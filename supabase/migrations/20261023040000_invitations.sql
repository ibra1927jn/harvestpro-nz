-- =============================================================================
-- B1 (auditoría 2026-10-23): invitaciones de usuarios desde la app
--
-- Hoy nadie puede darse de alta: el registro exige una fila sin usar en
-- allowed_registrations (guard_user_changes) y ninguna pantalla la crea.
-- La pantalla «Invitar» (Admin › Users y RRHH › Employees) la escribe; aquí:
--
-- 1) Quién invita (decisión del dueño 2026-10-23): admin y RRHH. RRHH no
--    invita admins (guard_invitation_role, igual que antes). El manager deja
--    de poder invitar (antes podía a personal de campo de su huerto); al
--    personal que ya tiene cuenta lo sigue vinculando con «Link Staff».
-- 2) Columnas nuevas: nombre (opcional), caducidad (14 días por defecto;
--    «reenviar» la alarga) y cuándo se reenvió. created_by = quien invita
--    (por defecto auth.uid(); una política RESTRICTIVE impide firmar a nombre
--    de otro). Las invitaciones que ya existían quedan sin caducidad (NULL).
-- 3) El alta (guard_user_changes) y la comprobación sin sesión
--    (check_registration) ignoran las invitaciones caducadas.
-- No hay correo: Supabase local no envía invitaciones (inviteUserByEmail
-- crearía la cuenta sin contraseña y el alta con contraseña chocaría). La
-- pantalla enseña el enlace de registro para copiarlo y mandarlo.
-- =============================================================================

-- 2) Columnas --------------------------------------------------------------------
ALTER TABLE public.allowed_registrations
    ADD COLUMN IF NOT EXISTS full_name text,
    ADD COLUMN IF NOT EXISTS expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS resent_at timestamptz;
ALTER TABLE public.allowed_registrations
    ALTER COLUMN expires_at SET DEFAULT (now() + interval '14 days'),
    ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.allowed_registrations
    DROP CONSTRAINT IF EXISTS allowed_registrations_full_name_check;
ALTER TABLE public.allowed_registrations
    ADD CONSTRAINT allowed_registrations_full_name_check CHECK (full_name IS NULL OR length(full_name) <= 120);

COMMENT ON COLUMN public.allowed_registrations.full_name IS 'Nombre de la persona invitada (opcional; se lo pone al registrarse).';
COMMENT ON COLUMN public.allowed_registrations.expires_at IS 'Hasta cuándo vale la invitación sin usar (NULL = sin caducidad, invitaciones antiguas). Reenviar la alarga.';
COMMENT ON COLUMN public.allowed_registrations.resent_at IS 'Último reenvío del enlace de registro.';

-- 1) Quién gestiona invitaciones: admin y RRHH ------------------------------------
DROP POLICY IF EXISTS "HR manage allowed registrations" ON public.allowed_registrations;
DROP POLICY IF EXISTS "HR manage registrations" ON public.allowed_registrations;
DROP POLICY IF EXISTS "Admin and HR manage invitations" ON public.allowed_registrations;
CREATE POLICY "Admin and HR manage invitations" ON public.allowed_registrations
    FOR ALL TO authenticated
    USING ((SELECT public.is_role(ARRAY['admin', 'hr_admin'])))
    WITH CHECK ((SELECT public.is_role(ARRAY['admin', 'hr_admin'])));

-- La invitación la firma quien la crea
DROP POLICY IF EXISTS "Invitation created by caller" ON public.allowed_registrations;
CREATE POLICY "Invitation created by caller" ON public.allowed_registrations
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (created_by = (SELECT auth.uid()));

-- El rol de la invitación: admin cualquiera; RRHH cualquiera menos admin
CREATE OR REPLACE FUNCTION public.guard_invitation_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role text;
    v_new_role text := NEW.assigned_role;
BEGIN
    -- Servidor / SQL directo: sin límites
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;
    -- Marcar como usada (alta), reenviar o caducar no cambian rol, huerto ni email
    IF TG_OP = 'UPDATE' AND NEW.assigned_role IS NOT DISTINCT FROM OLD.assigned_role
       AND NEW.orchard_id IS NOT DISTINCT FROM OLD.orchard_id AND NEW.email IS NOT DISTINCT FROM OLD.email THEN
        RETURN NEW;
    END IF;

    -- Sin 2FA el rol propio no cuenta (igual que 20261014000000)
    SELECT role INTO v_role FROM public.users
    WHERE id = auth.uid() AND is_active AND public.mfa_satisfied();

    IF v_role = 'admin' THEN
        RETURN NEW;
    END IF;
    IF v_role = 'hr_admin' AND v_new_role IS DISTINCT FROM 'admin' THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Not allowed to invite role %', COALESCE(v_new_role, '?') USING ERRCODE = '42501';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_invitation_role() FROM PUBLIC, anon, authenticated;

-- 3) Comprobación sin sesión: la invitación caducada no se ofrece ------------------
CREATE OR REPLACE FUNCTION public.check_registration(p_email text)
RETURNS TABLE(id uuid, role text, orchard_id uuid, used_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
    SELECT ar.id, COALESCE(ar.role, ar.assigned_role), ar.orchard_id, ar.used_at
    FROM public.allowed_registrations ar
    WHERE lower(ar.email) = lower(trim(p_email))
      AND (ar.used_at IS NOT NULL OR ar.expires_at IS NULL OR ar.expires_at > now())
    ORDER BY ar.used_at NULLS FIRST, ar.created_at DESC
    LIMIT 1;
$fn$;

-- 3) Alta: igual que 20261023013000 salvo que ignora invitaciones caducadas ---------
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
    -- Roles que trabajan para la empresa entera y cambian de huerto en la app
    v_switchers text[] := ARRAY['manager', 'hr_admin', 'payroll_admin'];
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
          -- Invitación caducada: ya no vale (RRHH / admin la reenvía)
          AND (ar.expires_at IS NULL OR ar.expires_at > now())
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
        -- Uno mismo si es rol de empresa/oficina; RRHH; o un manager vinculando
        -- personal de campo a su huerto o desvinculándolo
        IF NOT (
            (OLD.id = v_uid AND v_my_role = ANY (v_switchers))
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
