-- =============================================================================
-- Notificaciones push (auditoría 2026-10-23, problema 4): el circuito no existía.
--
-- 1) push_subscriptions: una fila por dispositivo (endpoint único) y los tipos
--    de aviso que ese dispositivo NO quiere (muted_types, las mismas casillas de
--    Ajustes: qc_reject, transport, attendance, visa_expiry). El alta va por
--    register_push_subscription(): si el móvil lo usaba otra cuenta, su fila se
--    borra (si no, la cuenta anterior seguiría recibiendo los avisos del móvil).
-- 2) notification_outbox: lo que hay que avisar a quién. La rellenan SOLO los
--    triggers de esta migración en los eventos; ningún cliente puede escribir
--    en ella (sin políticas, sin GRANT): nadie manda un push arbitrario a otro.
--    El texto no se guarda aquí: tipo + parámetros, y send-push lo escribe en el
--    idioma de quien lo recibe (users.preferred_locale).
-- 3) send-push en modo «flush» procesa la bandeja: claim_push_outbox() reparte
--    lotes sin solapes (FOR UPDATE SKIP LOCKED), reintenta hasta 5 veces.
-- 4) pg_cron cada minuto llama a push_outbox_tick(): limpia lo viejo y, si hay
--    pendientes y el proyecto está configurado en Vault (push_project_url y
--    push_service_role_key), despierta send-push con pg_net. Sin esa
--    configuración no hace nada: los clientes despiertan send-push tras escribir.
--
-- Eventos (a quién):
--   · QC rechaza o marca un criterio «bad» → team leader del picker y managers del huerto
--   · aviso (broadcast) → sus destinatarios (target_roles; vacío = todos)
--   · solicitud de transporte nueva → logística del huerto
--   · transporte asignado / completado → quien lo pidió
--   · nómina rechaza una hoja de horas → team leader del picker (y el picker si tiene cuenta)
--   · ausencia aprobada / rechazada → quien la pidió
--   · mensaje de chat → participantes (menos quien escribe y quien silenció la conversación);
--     en privado sin el texto. La petición de corrección de horas del runner es un
--     mensaje directo a su team leader y a los managers: va por aquí.
-- Nunca se avisa a quien hizo el cambio, a cuentas desactivadas ni a quien no tiene
-- ningún dispositivo suscrito (así la bandeja no crece con avisos que nadie recibirá).
-- =============================================================================

-- 1) Suscripciones ------------------------------------------------------------
ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS muted_types text[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_muted_types_check;
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_muted_types_check
    CHECK (muted_types <@ ARRAY['qc_reject', 'transport', 'attendance', 'visa_expiry']::text[]);

COMMENT ON COLUMN public.push_subscriptions.muted_types IS
    'Tipos de aviso que este dispositivo no quiere (casillas de Ajustes). send-push los respeta.';

-- Un endpoint = un dispositivo = una cuenta (se queda la fila más reciente)
DELETE FROM public.push_subscriptions a
USING public.push_subscriptions b
WHERE a.endpoint = b.endpoint
  AND (a.created_at, a.id) < (b.created_at, b.id);
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key ON public.push_subscriptions (endpoint);

CREATE OR REPLACE FUNCTION public.register_push_subscription(
    p_endpoint text,
    p_p256dh text,
    p_auth text,
    p_user_agent text DEFAULT NULL,
    p_muted_types text[] DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
    END IF;
    IF p_endpoint IS NULL OR p_endpoint !~ '^https://' OR char_length(p_endpoint) > 1000 THEN
        RAISE EXCEPTION 'Invalid push endpoint' USING ERRCODE = '22023';
    END IF;
    IF coalesce(char_length(p_p256dh), 0) NOT BETWEEN 20 AND 200
       OR coalesce(char_length(p_auth), 0) NOT BETWEEN 8 AND 100 THEN
        RAISE EXCEPTION 'Invalid push keys' USING ERRCODE = '22023';
    END IF;

    -- El dispositivo era de otra cuenta (cerró sesión sin red, o el navegador lo
    -- comparte): esa cuenta deja de recibir aquí
    DELETE FROM public.push_subscriptions WHERE endpoint = p_endpoint AND user_id <> v_uid;

    INSERT INTO public.push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth, user_agent, muted_types, updated_at)
    VALUES (v_uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300), coalesce(p_muted_types, '{}'), now())
    ON CONFLICT (endpoint) DO UPDATE
        SET keys_p256dh = EXCLUDED.keys_p256dh,
            keys_auth = EXCLUDED.keys_auth,
            user_agent = EXCLUDED.user_agent,
            muted_types = EXCLUDED.muted_types,
            updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.register_push_subscription(text, text, text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, text, text[]) TO authenticated, service_role;

-- 2) Bandeja de salida --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    orchard_id uuid REFERENCES public.orchards(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN (
        'qc_reject', 'broadcast', 'transport_new', 'transport_assigned', 'transport_completed',
        'timesheet_rejected', 'leave_decided', 'chat_message')),
    -- Datos para escribir el aviso en el idioma de quien lo recibe (send-push)
    params jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- Pantalla que abre al tocarlo; NULL = la de inicio del rol de quien lo recibe
    url text,
    -- Un evento avisa una vez por persona aunque el trigger salte dos veces
    dedupe_key text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz,
    claimed_at timestamptz,
    attempts smallint NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    last_error text,
    UNIQUE (recipient_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_pending
    ON public.notification_outbox (next_attempt_at, created_at) WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notification_outbox_created ON public.notification_outbox (created_at);

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
-- Sin políticas permisivas: solo la clave de servicio (send-push) y los triggers.
-- La restrictiva de 2FA, como en toda tabla de public (20261014000000_server_side_mfa)
DROP POLICY IF EXISTS "Require 2FA for privileged roles" ON public.notification_outbox;
CREATE POLICY "Require 2FA for privileged roles" ON public.notification_outbox
    AS RESTRICTIVE FOR ALL
    USING ((SELECT public.mfa_satisfied()))
    WITH CHECK ((SELECT public.mfa_satisfied()));
REVOKE ALL ON public.notification_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notification_outbox TO service_role;

COMMENT ON TABLE public.notification_outbox IS
    'Avisos push pendientes/enviados. La rellenan los triggers de eventos; la vacía send-push (flush).';

-- Encola un aviso para varias personas (uso interno de los triggers)
CREATE OR REPLACE FUNCTION public.enqueue_push(
    p_recipients uuid[],
    p_type text,
    p_params jsonb,
    p_dedupe_key text,
    p_orchard_id uuid DEFAULT NULL,
    p_url text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    INSERT INTO public.notification_outbox (recipient_id, orchard_id, type, params, url, dedupe_key)
    SELECT DISTINCT u.id, p_orchard_id, p_type, coalesce(p_params, '{}'::jsonb), p_url, p_dedupe_key
    FROM public.users u
    WHERE u.id = ANY (p_recipients)
      AND coalesce(u.is_active, true)
      AND u.id IS DISTINCT FROM auth.uid()
      AND EXISTS (SELECT 1 FROM public.push_subscriptions s WHERE s.user_id = u.id)
    ON CONFLICT (recipient_id, dedupe_key) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_push(uuid[], text, jsonb, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_push(uuid[], text, jsonb, text, uuid, text) TO service_role;

-- Managers activos de un huerto
CREATE OR REPLACE FUNCTION public.push_orchard_role_ids(p_orchard_id uuid, p_roles text[])
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT coalesce(array_agg(u.id), '{}')
    FROM public.users u
    WHERE u.orchard_id = p_orchard_id AND u.role = ANY (p_roles) AND coalesce(u.is_active, true);
$$;

REVOKE ALL ON FUNCTION public.push_orchard_role_ids(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_orchard_role_ids(uuid, text[]) TO service_role;

-- 3) Triggers de eventos -------------------------------------------------------
-- Si algo falla al encolar, el aviso se pierde pero el cambio se guarda (un
-- aviso nunca debe impedir guardar una inspección o un fichaje).

-- QC: rechazo o algún criterio «bad»
CREATE OR REPLACE FUNCTION public.push_on_qc_inspection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_picker record;
    v_bad text[];
BEGIN
    BEGIN
        SELECT coalesce(array_agg(key ORDER BY key), '{}') INTO v_bad
        FROM jsonb_each_text(CASE WHEN jsonb_typeof(NEW.criteria) = 'object' THEN NEW.criteria ELSE '{}'::jsonb END)
        WHERE value = 'bad';
        IF NEW.grade <> 'reject' AND cardinality(v_bad) = 0 THEN
            RETURN NULL;
        END IF;
        SELECT p.name, p.team_leader_id INTO v_picker FROM public.pickers p WHERE p.id = NEW.picker_id;
        PERFORM public.enqueue_push(
            array_append(public.push_orchard_role_ids(NEW.orchard_id, ARRAY['manager']), v_picker.team_leader_id),
            'qc_reject',
            jsonb_build_object('picker_name', coalesce(v_picker.name, ''), 'grade', NEW.grade,
                               'bad', to_jsonb(v_bad), 'row', NEW.row_number),
            'qc:' || NEW.id,
            NEW.orchard_id);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'push_on_qc_inspection: %', SQLERRM;
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_qc_inspection ON public.qc_inspections;
CREATE TRIGGER trg_push_qc_inspection
    AFTER INSERT OR UPDATE OF grade, criteria ON public.qc_inspections
    FOR EACH ROW EXECUTE FUNCTION public.push_on_qc_inspection();

-- Avisos del manager
CREATE OR REPLACE FUNCTION public.push_on_broadcast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ids uuid[];
BEGIN
    BEGIN
        SELECT coalesce(array_agg(u.id), '{}') INTO v_ids
        FROM public.users u
        WHERE u.orchard_id = NEW.orchard_id
          AND coalesce(u.is_active, true)
          AND u.id <> NEW.sender_id
          AND (coalesce(cardinality(NEW.target_roles), 0) = 0 OR u.role = ANY (NEW.target_roles));
        PERFORM public.enqueue_push(
            v_ids,
            'broadcast',
            jsonb_build_object('title', left(NEW.title, 120), 'content', left(NEW.content, 240),
                               'priority', NEW.priority),
            'broadcast:' || NEW.id,
            NEW.orchard_id);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'push_on_broadcast: %', SQLERRM;
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_broadcast ON public.broadcasts;
CREATE TRIGGER trg_push_broadcast
    AFTER INSERT ON public.broadcasts
    FOR EACH ROW EXECUTE FUNCTION public.push_on_broadcast();

-- Transporte: nueva → logística; asignada / completada → quien la pidió
CREATE OR REPLACE FUNCTION public.push_on_transport_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_params jsonb;
BEGIN
    BEGIN
        IF NEW.deleted_at IS NOT NULL THEN RETURN NULL; END IF;
        v_params := jsonb_build_object('requester_name', NEW.requester_name, 'zone', NEW.zone,
                                       'bins', NEW.bins_count, 'priority', NEW.priority);
        IF TG_OP = 'INSERT' THEN
            IF NEW.status = 'pending' THEN
                PERFORM public.enqueue_push(
                    public.push_orchard_role_ids(NEW.orchard_id, ARRAY['logistics']),
                    'transport_new', v_params, 'transport_new:' || NEW.id, NEW.orchard_id);
            END IF;
        ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('assigned', 'completed') THEN
            PERFORM public.enqueue_push(
                ARRAY[NEW.requested_by],
                'transport_' || NEW.status, v_params, 'transport_' || NEW.status || ':' || NEW.id, NEW.orchard_id);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'push_on_transport_request: %', SQLERRM;
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_transport_insert ON public.transport_requests;
CREATE TRIGGER trg_push_transport_insert
    AFTER INSERT ON public.transport_requests
    FOR EACH ROW EXECUTE FUNCTION public.push_on_transport_request();
DROP TRIGGER IF EXISTS trg_push_transport_status ON public.transport_requests;
CREATE TRIGGER trg_push_transport_status
    AFTER UPDATE OF status ON public.transport_requests
    FOR EACH ROW WHEN (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('assigned', 'completed'))
    EXECUTE FUNCTION public.push_on_transport_request();

-- Nómina rechaza una hoja de horas → team leader del picker (y el picker si tiene cuenta)
CREATE OR REPLACE FUNCTION public.push_on_timesheet_rejected()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_picker record;
BEGIN
    BEGIN
        SELECT p.id, p.name, p.team_leader_id INTO v_picker FROM public.pickers p WHERE p.id = NEW.picker_id;
        PERFORM public.enqueue_push(
            ARRAY[v_picker.team_leader_id, v_picker.id],
            'timesheet_rejected',
            jsonb_build_object('picker_name', coalesce(v_picker.name, ''), 'date', NEW.date,
                               'reason', left(coalesce(NEW.rejection_reason, ''), 200)),
            'timesheet_rejected:' || NEW.id || ':' || extract(epoch FROM NEW.rejected_at)::bigint,
            NEW.orchard_id);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'push_on_timesheet_rejected: %', SQLERRM;
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_timesheet_rejected ON public.daily_attendance;
CREATE TRIGGER trg_push_timesheet_rejected
    AFTER UPDATE OF rejected_at ON public.daily_attendance
    FOR EACH ROW WHEN (NEW.rejected_at IS NOT NULL AND NEW.rejected_at IS DISTINCT FROM OLD.rejected_at)
    EXECUTE FUNCTION public.push_on_timesheet_rejected();

-- Ausencia aprobada / rechazada → quien la pidió
CREATE OR REPLACE FUNCTION public.push_on_leave_decided()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_name text;
BEGIN
    BEGIN
        SELECT p.name INTO v_name FROM public.pickers p WHERE p.id = NEW.picker_id;
        PERFORM public.enqueue_push(
            ARRAY[NEW.requested_by],
            'leave_decided',
            jsonb_build_object('picker_name', coalesce(v_name, ''), 'status', NEW.status,
                               'leave_type', NEW.type, 'start_date', NEW.start_date, 'end_date', NEW.end_date),
            'leave_decided:' || NEW.id || ':' || NEW.status,
            NEW.orchard_id);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'push_on_leave_decided: %', SQLERRM;
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_leave_decided ON public.leave_requests;
CREATE TRIGGER trg_push_leave_decided
    AFTER UPDATE OF status ON public.leave_requests
    FOR EACH ROW WHEN (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'rejected')
                       AND NEW.requested_by IS NOT NULL)
    EXECUTE FUNCTION public.push_on_leave_decided();

-- Chat: participantes menos quien escribe y quien silenció la conversación.
-- En privado (direct) sin el texto: «Nuevo mensaje de X».
CREATE OR REPLACE FUNCTION public.push_on_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_conv record;
    v_sender text;
    v_ids uuid[];
BEGIN
    BEGIN
        SELECT c.type, c.name, c.participant_ids, c.muted_by INTO v_conv
        FROM public.conversations c WHERE c.id = NEW.conversation_id;
        IF NOT FOUND THEN RETURN NULL; END IF;
        SELECT coalesce(nullif(u.full_name, ''), u.email, '') INTO v_sender FROM public.users u WHERE u.id = NEW.sender_id;
        SELECT coalesce(array_agg(p::uuid), '{}') INTO v_ids
        FROM unnest(v_conv.participant_ids) AS p
        WHERE p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND p <> NEW.sender_id::text
          AND NOT (p = ANY (coalesce(v_conv.muted_by, '{}')));
        PERFORM public.enqueue_push(
            v_ids,
            'chat_message',
            jsonb_build_object(
                'sender_name', coalesce(v_sender, ''),
                'conversation_type', v_conv.type,
                'conversation_name', coalesce(v_conv.name, ''),
                -- Solo en grupos: un mensaje privado no se enseña en la pantalla bloqueada
                'preview', CASE WHEN v_conv.type = 'direct' THEN NULL ELSE left(NEW.content, 140) END),
            'chat:' || NEW.id,
            NULL);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'push_on_chat_message: %', SQLERRM;
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_chat_message ON public.chat_messages;
CREATE TRIGGER trg_push_chat_message
    AFTER INSERT ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.push_on_chat_message();

REVOKE ALL ON FUNCTION public.push_on_qc_inspection() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_on_broadcast() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_on_transport_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_on_timesheet_rejected() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_on_leave_decided() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_on_chat_message() FROM PUBLIC, anon, authenticated;

-- 4) Reparto (send-push) --------------------------------------------------------
-- Coge un lote de pendientes para enviarlo. Otro flush a la vez no coge los
-- mismos (SKIP LOCKED + claimed_at); uno que se quedó a medias (la función murió)
-- se vuelve a coger a los 2 minutos.
CREATE OR REPLACE FUNCTION public.claim_push_outbox(p_limit integer DEFAULT 100)
RETURNS SETOF public.notification_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.notification_outbox o
    SET claimed_at = now(), attempts = o.attempts + 1
    WHERE o.id IN (
        SELECT q.id FROM public.notification_outbox q
        WHERE q.sent_at IS NULL
          AND q.attempts < 5
          AND q.next_attempt_at <= now()
          AND (q.claimed_at IS NULL OR q.claimed_at < now() - interval '2 minutes')
        ORDER BY q.created_at
        LIMIT least(greatest(coalesce(p_limit, 100), 1), 500)
        FOR UPDATE SKIP LOCKED
    )
    RETURNING o.*;
$$;

REVOKE ALL ON FUNCTION public.claim_push_outbox(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_outbox(integer) TO service_role;

-- Cada minuto (pg_cron): limpia y despierta send-push si hay pendientes
CREATE OR REPLACE FUNCTION public.push_outbox_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url text;
    v_key text;
BEGIN
    -- Enviados hace más de una semana, o sin enviar después de 2 días (sin claves
    -- VAPID, o 5 intentos fallidos): fuera
    DELETE FROM public.notification_outbox
    WHERE (sent_at IS NOT NULL AND sent_at < now() - interval '7 days')
       OR (sent_at IS NULL AND created_at < now() - interval '2 days');

    IF NOT EXISTS (
        SELECT 1 FROM public.notification_outbox
        WHERE sent_at IS NULL AND attempts < 5 AND next_attempt_at <= now()
    ) THEN
        RETURN;
    END IF;

    BEGIN
        SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'push_project_url';
        SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_service_role_key';
        IF v_url IS NULL OR v_key IS NULL THEN
            RETURN;
        END IF;
        PERFORM net.http_post(
            url := rtrim(v_url, '/') || '/functions/v1/send-push',
            headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
            body := '{"action":"flush"}'::jsonb,
            timeout_milliseconds := 10000);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'push_outbox_tick: %', SQLERRM;
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.push_outbox_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_outbox_tick() TO service_role;

DO $$
BEGIN
    BEGIN
        CREATE EXTENSION IF NOT EXISTS pg_cron;
        CREATE EXTENSION IF NOT EXISTS pg_net;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'pg_cron / pg_net not available (%): push relies on client flushes', SQLERRM;
        RETURN;
    END;
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'push-outbox-flush';
    PERFORM cron.schedule('push-outbox-flush', '* * * * *', 'SELECT public.push_outbox_tick()');
END $$;
