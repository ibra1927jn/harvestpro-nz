-- =============================================================================
-- A5 (parcial, auditoría 2026-10-23): reglas de acceso más anchas de lo debido
--
-- 1) users.orchard_id: cualquier rol podía cambiarse de huerto a sí mismo
--    (guard_user_changes permitía OLD.id = auth.uid()), así que «logística /
--    team leader / runner por huerto» no era frontera: bastaba un PATCH para
--    leer otro huerto. Ahora solo los roles de empresa / oficina (admin,
--    manager, hr_admin, payroll_admin; los que ven OrchardSwitcher) cambian su
--    propio huerto; al resto lo cambian manager (personal de campo a su huerto)
--    o RRHH. Igual que 20261014000000 salvo esa condición.
-- 2) transport_requests: se podía crear una solicitud a nombre de otro.
--    "Create transport" (solo huerto) sobraba junto a "Create transport
--    requests" (huerto + requested_by = yo) y "Manage transport" (ALL de
--    logística/manager sin WITH CHECK, que también vale para INSERT): se borra
--    la primera y una política RESTRICTIVE exige requested_by = quien llama en
--    todo INSERT.
-- La lectura de fichajes por huerto NO cambia (QC y runner la necesitan) y
-- variety_rates lo lleva otra rama.
-- =============================================================================

-- 1) Cambiar de huerto a uno mismo: solo roles de empresa / oficina -----------
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

-- 2) transport_requests: siempre a nombre de quien la pide -------------------
DROP POLICY IF EXISTS "Create transport" ON public.transport_requests;

DROP POLICY IF EXISTS "Transport requested by caller" ON public.transport_requests;
CREATE POLICY "Transport requested by caller" ON public.transport_requests
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (requested_by = (SELECT auth.uid()));
