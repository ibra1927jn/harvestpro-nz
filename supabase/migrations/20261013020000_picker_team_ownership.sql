-- =============================================================================
-- Quién mete y saca pickers de los equipos
--
-- Regla de la empresa: el MANAGER no añade ni quita pickers de los equipos.
-- Eso lo hacen el TEAM LEADER (su equipo) o RRHH. El manager sí sigue
-- moviendo equipos de fila (pickers.current_row) y vinculando team leaders
-- y runners al huerto.
--
-- Se aplica en la base de datos, no solo en la pantalla:
--   · manager no puede dar de alta ni borrar un picker,
--   · ni cambiarle el equipo (team_leader_id),
--   · ni darle de baja (status inactive/archived, archived_at, deleted_at).
-- RRHH (hr_admin) y admin pueden gestionar pickers (antes no tenían permiso).
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

DROP TRIGGER IF EXISTS trg_guard_picker_team_changes ON public.pickers;
CREATE TRIGGER trg_guard_picker_team_changes
    BEFORE INSERT OR UPDATE OR DELETE ON public.pickers
    FOR EACH ROW EXECUTE FUNCTION public.guard_picker_team_changes();

-- RRHH y admin gestionan pickers (altas, bajas, cambio de equipo)
DROP POLICY IF EXISTS "HR manages pickers" ON public.pickers;
CREATE POLICY "HR manages pickers" ON public.pickers
    FOR ALL
    USING (public.is_role(ARRAY['hr_admin', 'admin']))
    WITH CHECK (public.is_role(ARRAY['hr_admin', 'admin']));
