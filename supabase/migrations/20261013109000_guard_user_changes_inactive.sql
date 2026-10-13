-- =============================================================================
-- guard_user_changes: una cuenta dada de baja no se reactiva a sí misma
--
-- El disparador leía el rol de quien llama sin mirar is_active. Con la
-- política "users_update_self_policy" (id = auth.uid()), un admin o una
-- persona de RRHH DADOS DE BAJA podían volver a activarse (y el admin,
-- además, cambiarse el rol). Ahora el rol solo cuenta si la cuenta está
-- activa, igual que is_role().
-- (prueba: supabase/tests/security/20_people.sql, "cannot reactivate self")
-- =============================================================================

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

    -- Solo cuentas activas tienen rol aquí: una cuenta dada de baja no se
    -- reactiva ni se cambia el rol a sí misma (antes admin / RRHH sí podían)
    SELECT role, orchard_id INTO v_my_role, v_my_orchard FROM public.users WHERE id = v_uid AND is_active;
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

    -- Otros datos (nombre, consentimiento…) de otra persona: solo manager o RRHH
    -- (las políticas ya lo limitan; aquí no se toca nada más)
    RETURN NEW;
END;
$$;
