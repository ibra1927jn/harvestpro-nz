-- =============================================================================
-- Mensajes y avisos: leídos, confirmados, orden de chats y notificaciones push
--
-- 1) Avisos (broadcasts): cada uno ve los de SU huerto y solo los dirigidos a
--    su rol (target_roles vacío = para todos). Antes cualquiera veía los de
--    cualquier huerto y el aviso del runner a Logística le llegaba a todos.
-- 2) Confirmar un aviso ("visto"): solo el manager podía modificar avisos, así
--    que la confirmación nunca se guardaba. Ahora una función añade al usuario
--    a acknowledged_by.
-- 3) Mensajes leídos y contadores: chat_messages no se podía modificar, así que
--    "leído" nunca se guardaba y los contadores estaban siempre a 0. Funciones
--    para marcar una conversación como leída y contar no leídos.
-- 4) Orden de los chats: conversations no se podía modificar; ahora cada
--    mensaje nuevo actualiza la hora de la conversación (disparador).
-- 5) Notificaciones push: la tabla push_subscriptions no existía.
-- =============================================================================

-- 1) Quién ve cada aviso
DROP POLICY IF EXISTS "broadcasts_view_policy" ON public.broadcasts;
CREATE POLICY "broadcasts_view_policy" ON public.broadcasts FOR SELECT
    USING (
        orchard_id = public.get_my_orchard_id()
        AND (
            sender_id = auth.uid()
            OR COALESCE(cardinality(target_roles), 0) = 0
            OR EXISTS (
                SELECT 1 FROM public.users u
                WHERE u.id = auth.uid()
                  AND (u.role = ANY (broadcasts.target_roles) OR u.role IN ('manager', 'admin'))
            )
        )
    );

-- 2) Confirmar un aviso
CREATE OR REPLACE FUNCTION public.acknowledge_broadcast(p_broadcast_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
    END IF;
    UPDATE public.broadcasts
    SET acknowledged_by = array_append(COALESCE(acknowledged_by, '{}'), auth.uid())
    WHERE id = p_broadcast_id
      AND orchard_id = public.get_my_orchard_id()
      AND NOT (auth.uid() = ANY (COALESCE(acknowledged_by, '{}')));
END;
$$;
GRANT EXECUTE ON FUNCTION public.acknowledge_broadcast(uuid) TO authenticated;

-- 3) Leídos y contadores
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me text := auth.uid()::text;
    v_count integer;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = p_conversation_id AND v_me = ANY (c.participant_ids)
    ) THEN
        RAISE EXCEPTION 'Not a participant' USING ERRCODE = '42501';
    END IF;
    UPDATE public.chat_messages
    SET read_by = array_append(COALESCE(read_by, '{}'), v_me)
    WHERE conversation_id = p_conversation_id
      AND sender_id::text <> v_me
      AND NOT (v_me = ANY (COALESCE(read_by, '{}')));
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_unread_counts()
RETURNS TABLE (conversation_id uuid, unread integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT m.conversation_id, count(*)::integer
    FROM public.chat_messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE auth.uid()::text = ANY (c.participant_ids)
      AND m.sender_id::text <> auth.uid()::text
      AND NOT (auth.uid()::text = ANY (COALESCE(m.read_by, '{}')))
    GROUP BY m.conversation_id;
$$;
GRANT EXECUTE ON FUNCTION public.my_unread_counts() TO authenticated;

-- 4) La conversación sube al recibir un mensaje
CREATE OR REPLACE FUNCTION public.touch_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.conversations SET updated_at = now() WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_conversation_on_message ON public.chat_messages;
CREATE TRIGGER trg_touch_conversation_on_message
    AFTER INSERT ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_on_message();

-- 5) Suscripciones a notificaciones push (una por usuario y dispositivo)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint text NOT NULL,
    keys_p256dh text NOT NULL,
    keys_auth text NOT NULL,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, endpoint)
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users manage own push subscriptions" ON public.push_subscriptions
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- El envío lo hace la función send-push con la clave de servicio.
