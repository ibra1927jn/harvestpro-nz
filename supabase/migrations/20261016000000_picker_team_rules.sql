-- =============================================================================
-- Equipos de pickers: el team leader solo trabaja con SU equipo
--
-- Problema (auditoría 2026-10-16): seguían activas las políticas de marzo
-- pickers_insert_policy / pickers_update_policy / pickers_delete_policy
-- (2026030101_rls_consolidation) y "Manage pickers" (schema_v3). Como las
-- políticas se suman (OR), cualquier team leader podía editar, archivar o
-- quitar de su equipo a cualquier persona de la empresa, y un manager podía
-- borrar filas de team leaders y runners.
--
-- Regla del dueño (2026-10-16):
--   · Team leader: da de alta gente nueva EN SU equipo, edita a su gente y
--     puede coger a alguien que no tiene equipo (activo). No suelta a nadie,
--     no lo pasa a otro equipo, no lo da de baja, no lo borra, no le cambia
--     el rol ni el huerto habitual.
--   · RRHH (hr_admin) y admin: todo lo anterior ("HR manages pickers").
--   · Manager: sigue moviendo equipos de fila y vinculando team leaders y
--     runners al huerto (guard_picker_team_changes le impide dar de alta,
--     baja o mover pickers). Ya no borra filas.
-- (prueba: supabase/tests/security/25_picker_teams.sql)
-- =============================================================================

-- 1) Fuera las políticas viejas que lo permitían todo
DROP POLICY IF EXISTS "pickers_insert_policy" ON public.pickers;
DROP POLICY IF EXISTS "pickers_update_policy" ON public.pickers;
DROP POLICY IF EXISTS "pickers_delete_policy" ON public.pickers;
DROP POLICY IF EXISTS "Manage pickers" ON public.pickers;

-- 2) Team leader: alta solo en su equipo, como picker activo
DROP POLICY IF EXISTS "Team leader adds to own team" ON public.pickers;
CREATE POLICY "Team leader adds to own team" ON public.pickers
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_role(ARRAY['team_leader'])
        AND team_leader_id = auth.uid()
        AND COALESCE(role, 'picker') = 'picker'
        AND COALESCE(status, 'active') = 'active'
        AND archived_at IS NULL
        AND deleted_at IS NULL
    );

-- 3) Team leader: edita a su gente o coge a alguien sin equipo; la fila
--    tiene que acabar en su equipo (no puede soltarla ni pasarla a otro)
DROP POLICY IF EXISTS "Team leader edits own team" ON public.pickers;
CREATE POLICY "Team leader edits own team" ON public.pickers
    FOR UPDATE TO authenticated
    USING (
        public.is_role(ARRAY['team_leader'])
        AND (
            team_leader_id = auth.uid()
            OR (
                team_leader_id IS NULL
                AND COALESCE(role, 'picker') = 'picker'
                AND COALESCE(status, 'active') = 'active'
                AND archived_at IS NULL
                AND deleted_at IS NULL
            )
        )
    )
    WITH CHECK (
        public.is_role(ARRAY['team_leader'])
        AND team_leader_id = auth.uid()
    );

-- 4) Manager: vincula team leaders/runners y mueve equipos de fila.
--    Lo que no puede hacer con pickers lo frena guard_picker_team_changes.
DROP POLICY IF EXISTS "Manager links field staff" ON public.pickers;
CREATE POLICY "Manager links field staff" ON public.pickers
    FOR INSERT TO authenticated
    WITH CHECK (public.is_manager());

DROP POLICY IF EXISTS "Manager updates field staff" ON public.pickers;
CREATE POLICY "Manager updates field staff" ON public.pickers
    FOR UPDATE TO authenticated
    USING (public.is_manager())
    WITH CHECK (public.is_manager());

-- 5) El trigger también frena al team leader en las columnas que son de RRHH
CREATE OR REPLACE FUNCTION public.guard_picker_team_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role text;
BEGIN
    -- Funciones del servidor (service role) y sistema: sin usuario, sin regla
    IF auth.uid() IS NULL THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    SELECT role INTO v_role FROM public.users WHERE id = auth.uid();

    -- ── Team leader ──────────────────────────────────────────────────────
    IF v_role = 'team_leader' THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'TEAM_LEADER_CANNOT_REMOVE_PICKERS: removing people is done by HR'
                USING ERRCODE = '42501';
        END IF;
        IF TG_OP = 'UPDATE' AND (
               NEW.role IS DISTINCT FROM OLD.role
            OR NEW.orchard_id IS DISTINCT FROM OLD.orchard_id
            OR (NEW.team_leader_id IS DISTINCT FROM OLD.team_leader_id
                AND NOT (OLD.team_leader_id IS NULL AND NEW.team_leader_id = auth.uid()))
            OR NEW.status IS DISTINCT FROM OLD.status
            OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
            OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
        ) THEN
            RAISE EXCEPTION 'TEAM_LEADER_CANNOT_MOVE_PICKERS: releasing, moving, archiving or changing role or orchard is done by HR'
                USING ERRCODE = '42501';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    IF v_role IS DISTINCT FROM 'manager' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    -- ── Manager (igual que en 20261013109100_guard_picker_role_flip) ─────
    IF TG_OP = 'INSERT' AND COALESCE(NEW.role, 'picker') = 'picker' THEN
        RAISE EXCEPTION 'MANAGER_CANNOT_MANAGE_PICKERS: adding pickers to a team is done by the team leader or HR'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'MANAGER_CANNOT_MANAGE_PICKERS: removing people is done by HR'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role
       AND 'picker' IN (COALESCE(OLD.role, 'picker'), COALESCE(NEW.role, 'picker')) THEN
        RAISE EXCEPTION 'MANAGER_CANNOT_MANAGE_PICKERS: changing a picker''s role is done by HR'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'UPDATE' AND COALESCE(OLD.role, 'picker') = 'picker' AND (
           NEW.team_leader_id IS DISTINCT FROM OLD.team_leader_id
        OR (NEW.status IN ('inactive', 'archived') AND NEW.status IS DISTINCT FROM OLD.status)
        OR (NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL)
        OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
    ) THEN
        RAISE EXCEPTION 'MANAGER_CANNOT_MANAGE_PICKERS: moving or removing pickers from a team is done by the team leader or HR'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;
