-- =============================================================================
-- 2FA exigido en el SERVIDOR (decisión del dueño, 2026-10-14)
--
-- Antes: MFAGuard pedía el código solo en la interfaz. Una sesión con solo
-- contraseña (aal1) de manager / admin / payroll_admin / hr_admin leía y
-- escribía todo por REST y Edge Functions (review.md, hallazgo #1).
--
-- Ahora:
-- 1) public.security_settings (una fila): enforce_mfa, true por defecto en
--    toda instalación nueva. Nadie la lee ni la cambia por la API (RLS sin
--    políticas, sin GRANT): solo SQL directo. Para el PC de desarrollo del
--    dueño: scripts/dev-disable-mfa.sql (y scripts/dev-enable-mfa.sql).
-- 2) public.mfa_satisfied(): true si no se exige, si no hay sesión, si el
--    rol de la cuenta no es privilegiado o si el token es aal2.
-- 3) Las funciones de rol (is_role, is_manager, get_auth_role, …) tratan a
--    una cuenta privilegiada con sesión aal1 como SIN rol privilegiado: así
--    también quedan cubiertas las RPC SECURITY DEFINER que las usan.
-- 4) Política RESTRICTIVE "Require 2FA for privileged roles" en TODA tabla de
--    public y en storage.objects: con aal1 una cuenta privilegiada no ve ni
--    toca nada (tampoco lo que vería cualquier miembro del huerto: chats,
--    fichajes…). Excepciones para que la app pueda mostrar las pantallas de
--    2FA: su propia fila de users, la lista de huertos (solo lectura) y el
--    registro de intentos de acceso / consentimiento (solo alta).
-- 5) Triggers que dan poderes por rol (guard_user_changes,
--    guard_invitation_role) y RPC de mensajería: mismo criterio.
-- Las Edge Functions lo comprueban en requireRole (_shared/security.ts)
-- llamando a mfa_satisfied() con la sesión del usuario.
-- =============================================================================

-- 1) Ajuste ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_settings (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    enforce_mfa boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.security_settings IS
    'Una fila. enforce_mfa: exigir 2FA (aal2) en el servidor a manager/admin/payroll_admin/hr_admin. Solo por SQL (scripts/dev-disable-mfa.sql).';

INSERT INTO public.security_settings (id, enforce_mfa) VALUES (true, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_settings FROM anon, authenticated;

-- 2) Comprobación única --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mfa_satisfied()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT auth.uid() IS NULL
        -- Sin fila = se exige (nunca abrir por un borrado)
        OR NOT COALESCE((SELECT s.enforce_mfa FROM public.security_settings s WHERE s.id), true)
        OR COALESCE(auth.jwt() ->> 'aal', '') = 'aal2'
        OR NOT EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.role IN ('admin', 'manager', 'payroll_admin', 'hr_admin')
        );
$$;
COMMENT ON FUNCTION public.mfa_satisfied() IS
    'false solo para una cuenta privilegiada (admin/manager/payroll_admin/hr_admin) con sesión sin 2FA (aal1) mientras security_settings.enforce_mfa.';
REVOKE ALL ON FUNCTION public.mfa_satisfied() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mfa_satisfied() TO anon, authenticated, service_role;

-- 3) Funciones de rol usadas por RLS y RPC --------------------------------------
CREATE OR REPLACE FUNCTION public.is_role(allowed_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE((SELECT role = ANY (allowed_roles) FROM public.users
                     WHERE id = auth.uid() AND is_active), false)
       AND public.mfa_satisfied();
$$;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE((SELECT role IN ('manager', 'admin') FROM public.users
                     WHERE id = auth.uid() AND is_active), false)
       AND public.mfa_satisfied();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active AND role = 'admin')
       AND public.mfa_satisfied();
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_leader()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.users
                   WHERE id = auth.uid() AND is_active AND role IN ('manager', 'team_leader'))
       AND public.mfa_satisfied();
$$;

CREATE OR REPLACE FUNCTION public.is_logistics_or_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.users
                   WHERE id = auth.uid() AND is_active AND role IN ('manager', 'logistics', 'admin'))
       AND public.mfa_satisfied();
$$;

CREATE OR REPLACE FUNCTION public.is_hr_manager_or_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.users
                   WHERE id = auth.uid() AND is_active AND role IN ('manager', 'hr_admin', 'admin'))
       AND public.mfa_satisfied();
$$;

CREATE OR REPLACE FUNCTION public.can_read_company_payroll()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND is_active
          AND role IN ('admin', 'manager', 'payroll_admin', 'hr_admin')
    ) AND public.mfa_satisfied();
$$;

-- Sin 2FA el rol privilegiado no cuenta: NULL (como una cuenta sin rol)
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT role FROM public.users WHERE id = auth.uid() AND is_active AND public.mfa_satisfied();
$$;

-- 4) Política RESTRICTIVE en todas las tablas ----------------------------------
DO $$
DECLARE
    t record;
    v_name text := 'Require 2FA for privileged roles';
    v_check text := '(SELECT public.mfa_satisfied())';
BEGIN
    FOR t IN
        SELECT c.relname FROM pg_class c
        WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
        ORDER BY c.relname
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_name, t.relname);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_name || ' (select)', t.relname);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_name || ' (insert)', t.relname);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_name || ' (update)', t.relname);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_name || ' (delete)', t.relname);

        IF t.relname = 'users' THEN
            -- Su propia fila: la app la lee al entrar (rol, nombre) y guarda el
            -- consentimiento de privacidad antes de la pantalla de 2FA. El rol y
            -- la baja propios ya los protege guard_user_changes.
            EXECUTE format(
                'CREATE POLICY %I ON public.users AS RESTRICTIVE FOR ALL TO public USING (id = auth.uid() OR %s) WITH CHECK (id = auth.uid() OR %s)',
                v_name, v_check, v_check);
        ELSIF t.relname = 'orchards' THEN
            -- Nombre del huerto en la cabecera: lectura libre; escribir, con 2FA
            EXECUTE format('CREATE POLICY %I ON public.orchards AS RESTRICTIVE FOR INSERT TO public WITH CHECK (%s)', v_name || ' (insert)', v_check);
            EXECUTE format('CREATE POLICY %I ON public.orchards AS RESTRICTIVE FOR UPDATE TO public USING (%s) WITH CHECK (%s)', v_name || ' (update)', v_check, v_check);
            EXECUTE format('CREATE POLICY %I ON public.orchards AS RESTRICTIVE FOR DELETE TO public USING (%s)', v_name || ' (delete)', v_check);
        ELSIF t.relname IN ('login_attempts', 'privacy_consent_log') THEN
            -- Se escriben al entrar (antes del código): el alta queda libre
            EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO public USING (%s)', v_name || ' (select)', t.relname, v_check);
            EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO public USING (%s) WITH CHECK (%s)', v_name || ' (update)', t.relname, v_check, v_check);
            EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO public USING (%s)', v_name || ' (delete)', t.relname, v_check);
        ELSE
            EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO public USING (%s) WITH CHECK (%s)',
                v_name, t.relname, v_check, v_check);
        END IF;
    END LOOP;
END $$;

-- Ficheros (fotos de QC, documentos de RRHH)
DROP POLICY IF EXISTS "Require 2FA for privileged roles" ON storage.objects;
CREATE POLICY "Require 2FA for privileged roles" ON storage.objects AS RESTRICTIVE FOR ALL TO public
    USING ((SELECT public.mfa_satisfied())) WITH CHECK ((SELECT public.mfa_satisfied()));

-- 5) Triggers con poderes por rol y RPC de mensajería ---------------------------
-- guard_user_changes: igual que 20261013109000, pero sin 2FA el rol propio no cuenta
CREATE OR REPLACE FUNCTION public.guard_user_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_my_role text;
    v_my_orchard uuid;
    v_reg RECORD;
    v_basic text[] := ARRAY['team_leader', 'runner', 'qc_inspector', 'logistics'];
BEGIN
    -- Funciones del servidor (clave de servicio) y SQL directo: sin límites
    IF v_uid IS NULL THEN
        RETURN NEW;
    END IF;

    -- Solo cuentas activas (y con 2FA si su rol lo exige) tienen rol aquí
    SELECT role, orchard_id INTO v_my_role, v_my_orchard FROM public.users
    WHERE id = v_uid AND is_active AND public.mfa_satisfied();
    -- Sin fila activa: rol vacío, nunca NULL (NOT (NULL) no lanzaría la excepción)
    v_my_role := COALESCE(v_my_role, '');

    IF v_my_role = 'admin' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- Alta propia: tiene que coincidir con una invitación sin usar
        IF NEW.id IS DISTINCT FROM v_uid THEN
            RAISE EXCEPTION 'Cannot create other users' USING ERRCODE = '42501';
        END IF;
        SELECT * INTO v_reg FROM public.allowed_registrations ar
        WHERE lower(ar.email) = lower((SELECT email FROM auth.users WHERE id = v_uid))
          AND ar.used_at IS NULL
        ORDER BY ar.created_at DESC
        LIMIT 1;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'No invitation for this email' USING ERRCODE = '42501';
        END IF;
        IF NEW.role IS DISTINCT FROM COALESCE(v_reg.role, v_reg.assigned_role) THEN
            RAISE EXCEPTION 'Role does not match the invitation' USING ERRCODE = '42501';
        END IF;
        IF v_reg.orchard_id IS NOT NULL AND NEW.orchard_id IS DISTINCT FROM v_reg.orchard_id THEN
            RAISE EXCEPTION 'Orchard does not match the invitation' USING ERRCODE = '42501';
        END IF;
        UPDATE public.allowed_registrations SET used_at = now() WHERE id = v_reg.id;
        RETURN NEW;
    END IF;

    -- UPDATE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.email IS DISTINCT FROM OLD.email THEN
        RAISE EXCEPTION 'Cannot change user id or email' USING ERRCODE = '42501';
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Only an admin can change roles' USING ERRCODE = '42501';
    END IF;

    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
        -- RRHH; o un manager reactivando a personal de campo al vincularlo
        IF NOT (
            v_my_role = 'hr_admin'
            OR (v_my_role = 'manager' AND OLD.role = ANY (v_basic) AND NEW.is_active)
        ) THEN
            RAISE EXCEPTION 'Not allowed to change active status' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF NEW.orchard_id IS DISTINCT FROM OLD.orchard_id THEN
        -- Uno mismo (cambiar de huerto); RRHH; o un manager vinculando
        -- personal de campo a su huerto o desvinculándolo
        IF NOT (
            OLD.id = v_uid
            OR v_my_role = 'hr_admin'
            OR (v_my_role = 'manager' AND OLD.role = ANY (v_basic)
                AND (NEW.orchard_id IS NULL OR NEW.orchard_id = v_my_orchard))
        ) THEN
            RAISE EXCEPTION 'Not allowed to change this user''s orchard' USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_invitation_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role text;
    v_orchard uuid;
    v_new_role text := NEW.assigned_role;
BEGIN
    -- Servidor / SQL directo: sin límites
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;
    -- Marcar como usada (alta) no cambia el rol ni el huerto
    IF TG_OP = 'UPDATE' AND NEW.assigned_role IS NOT DISTINCT FROM OLD.assigned_role
       AND NEW.orchard_id IS NOT DISTINCT FROM OLD.orchard_id AND NEW.email IS NOT DISTINCT FROM OLD.email THEN
        RETURN NEW;
    END IF;

    SELECT role, orchard_id INTO v_role, v_orchard FROM public.users
    WHERE id = auth.uid() AND is_active AND public.mfa_satisfied();

    IF v_role = 'admin' THEN
        RETURN NEW;
    END IF;
    IF v_role = 'hr_admin' AND v_new_role IS DISTINCT FROM 'admin' THEN
        RETURN NEW;
    END IF;
    IF v_role = 'manager'
       AND v_new_role IN ('team_leader', 'runner', 'qc_inspector', 'logistics')
       AND NEW.orchard_id IS NOT DISTINCT FROM v_orchard THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Not allowed to invite role %', COALESCE(v_new_role, '?') USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_broadcast(p_broadcast_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT public.mfa_satisfied() THEN
        RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
    END IF;
    UPDATE public.broadcasts
    SET acknowledged_by = array_append(COALESCE(acknowledged_by, '{}'), auth.uid())
    WHERE id = p_broadcast_id
      AND orchard_id = public.get_my_orchard_id()
      AND NOT (auth.uid() = ANY (COALESCE(acknowledged_by, '{}')));
END;
$$;

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
    IF v_me IS NULL OR NOT public.mfa_satisfied() THEN
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

CREATE OR REPLACE FUNCTION public.my_unread_counts()
RETURNS TABLE(conversation_id uuid, unread integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT m.conversation_id, count(*)::integer
    FROM public.chat_messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE public.mfa_satisfied()
      AND auth.uid()::text = ANY (c.participant_ids)
      AND m.sender_id::text <> auth.uid()::text
      AND NOT (auth.uid()::text = ANY (COALESCE(m.read_by, '{}')))
    GROUP BY m.conversation_id;
$$;
