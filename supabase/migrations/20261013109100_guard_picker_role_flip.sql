-- =============================================================================
-- guard_picker_team_changes: el manager no puede cambiar el rol de un picker
--
-- La regla (el manager no añade, quita, archiva ni mueve pickers de equipo)
-- solo miraba filas con role = 'picker'. Un manager podía:
--   1) UPDATE pickers SET role = 'runner'  (ya no es picker),
--   2) cambiarle team_leader_id / archivarlo / borrarlo,
--   3) UPDATE pickers SET role = 'picker'.
-- Ahora el manager no cambia el rol de/a 'picker'.
-- (prueba: supabase/tests/security/20_people.sql)
-- =============================================================================

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
    IF v_role IS DISTINCT FROM 'manager' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' AND COALESCE(NEW.role, 'picker') = 'picker' THEN
        RAISE EXCEPTION 'MANAGER_CANNOT_MANAGE_PICKERS: adding pickers to a team is done by the team leader or HR'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'DELETE' AND COALESCE(OLD.role, 'picker') = 'picker' THEN
        RAISE EXCEPTION 'MANAGER_CANNOT_MANAGE_PICKERS: removing pickers is done by the team leader or HR'
            USING ERRCODE = '42501';
    END IF;

    -- Cambiar el rol de/a picker era un rodeo: picker → runner, mover o
    -- archivar (ya no es "picker") y volver a picker
    IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role
       AND 'picker' IN (COALESCE(OLD.role, 'picker'), COALESCE(NEW.role, 'picker')) THEN
        RAISE EXCEPTION 'MANAGER_CANNOT_MANAGE_PICKERS: changing a picker''s role is done by the team leader or HR'
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

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
