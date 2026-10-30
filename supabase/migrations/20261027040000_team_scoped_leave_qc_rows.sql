-- =============================================================================
-- Fase 2 (seguridad): ausencias, calidad y filas por EQUIPO (decisión del dueño, 27-10)
--
-- 1. leave_requests (lectura):
--    - el team leader ve SOLO las ausencias de los pickers de su equipo
--      (pickers.team_leader_id = él), no las de todo el huerto. Pedirlas para
--      su equipo sigue igual ("Request leave", 20261023030000);
--    - manager (su huerto), RRHH, nómina y admin (toda la empresa), como antes;
--    - cada persona ve las suyas (picker_id = su cuenta);
--    - runner, QC y logística, nada más que eso: ven «de permiso» con
--      presence_today() (20261027030000_fase2_rls_gaps).
--
-- 2. qc_inspections (con las respuestas de bienestar, que son columnas de la
--    fila: informed, comfortable, wellbeing_notes) y las fotos de "qc-photos":
--    - manager de ese huerto; RRHH y admin (toda la empresa, como en ausencias);
--    - team leader: solo las de los pickers de SU equipo, nunca de otros;
--    - el inspector de QC: crea inspecciones y ve SOLO las que creó él (sin eso
--      la pantalla de QC se rompe: la alta devuelve la fila y su lista del día
--      son las suyas). Ya no las cambia ni las borra (la app no lo hace);
--    - nadie más: runner, logística y nómina no ven ninguna.
--    Antes "Read qc inspections" (sin TO) dejaba leer todas las del huerto a
--    cualquier rol, también la nota de bienestar.
--    Fotos: el manager las de su huerto; RRHH y admin, todas; el team leader las
--    de inspecciones que puede ver (la ruta se guarda en qc_inspections.photo_url);
--    quien la subió (QC o manager), las suyas. Mismo texto en
--    supabase/storage_policies.sql.
--
-- 3. row_assignments: el MANAGER asigna filas a cada equipo (una o varias por
--    delante, según vea la velocidad). El team leader solo mueve a SU equipo
--    entre las filas que el manager le asignó:
--    - crear, borrar o reasignar filas: manager de su huerto y admin. Antes
--      cualquier team leader del huerto podía crear, cambiar o borrar las de
--      cualquier equipo;
--    - el team leader actualiza las filas de SU equipo (team_leader_id = él)
--      solo en avance y fin (completion_percentage, status active/completed,
--      ended_at): guard_row_assignment_team_leader;
--    - mover a la gente = pickers.current_row; si lo cambia un team leader,
--      la fila tiene que ser una asignada (activa) a su equipo:
--      guard_team_leader_current_row.
--
-- Funciones de rol envueltas en (SELECT ...) (20261021000100_rls_initplan). No
-- se toca ninguna migración anterior.
-- =============================================================================

-- 1) leave_requests ---------------------------------------------------------
DROP POLICY IF EXISTS "Read leave requests" ON public.leave_requests;
CREATE POLICY "Read leave requests" ON public.leave_requests
    FOR SELECT TO authenticated
    USING (
        (
            orchard_id = (SELECT public.get_my_orchard_id())
            AND (SELECT public.is_role(ARRAY['manager']))
        )
        OR (SELECT public.is_role(ARRAY['hr_admin', 'payroll_admin', 'admin']))
        OR (
            orchard_id = (SELECT public.get_my_orchard_id())
            AND (SELECT public.is_role(ARRAY['team_leader']))
            AND public.is_my_team_member(picker_id)
        )
    );

DROP POLICY IF EXISTS "Read own leave requests" ON public.leave_requests;
CREATE POLICY "Read own leave requests" ON public.leave_requests
    FOR SELECT TO authenticated
    USING (
        picker_id = (SELECT auth.uid())
        AND (SELECT public.is_active_member())
    );

-- 2) qc_inspections -----------------------------------------------------------
DROP POLICY IF EXISTS "Read qc inspections" ON public.qc_inspections;
DROP POLICY IF EXISTS "Managers manage inspections" ON public.qc_inspections;

CREATE POLICY "Read qc inspections" ON public.qc_inspections
    FOR SELECT TO authenticated
    USING (
        (
            orchard_id = (SELECT public.get_my_orchard_id())
            AND (SELECT public.is_role(ARRAY['manager']))
        )
        OR (SELECT public.is_role(ARRAY['hr_admin', 'admin']))
        OR (
            orchard_id = (SELECT public.get_my_orchard_id())
            AND (SELECT public.is_role(ARRAY['team_leader']))
            AND public.is_my_team_member(picker_id)
        )
        OR (
            inspector_id = (SELECT auth.uid())
            AND orchard_id = (SELECT public.get_my_orchard_id())
            AND (SELECT public.is_role(ARRAY['qc_inspector']))
        )
    );

-- Cambiar o borrar: manager y admin del huerto (crear: "QC inspectors create inspections")
CREATE POLICY "Managers manage inspections" ON public.qc_inspections
    FOR ALL TO authenticated
    USING (
        orchard_id = (SELECT public.get_my_orchard_id())
        AND (SELECT public.is_role(ARRAY['manager', 'admin']))
    )
    WITH CHECK (
        orchard_id = (SELECT public.get_my_orchard_id())
        AND (SELECT public.is_role(ARRAY['manager', 'admin']))
    );

-- La política de fotos del team leader busca la inspección por la ruta
CREATE INDEX IF NOT EXISTS idx_qc_inspections_photo_url
    ON public.qc_inspections (photo_url) WHERE photo_url IS NOT NULL;

-- Fotos de QC (storage.objects pertenece a supabase_storage_admin: si no hay
-- permiso, se avisa y se aplica supabase/storage_policies.sql)
DO $$
BEGIN
    DROP POLICY IF EXISTS "QC staff view QC photos" ON storage.objects;
    CREATE POLICY "QC staff view QC photos" ON storage.objects FOR SELECT TO authenticated
        USING (bucket_id = 'qc-photos' AND (
            (SELECT public.is_role(ARRAY['admin', 'hr_admin']))
            OR ((SELECT public.is_role(ARRAY['manager']))
                AND (storage.foldername(name))[1] = (SELECT public.get_my_orchard_id())::text)
            OR ((SELECT public.is_role(ARRAY['qc_inspector']))
                AND owner_id = (SELECT auth.uid())::text
                AND (storage.foldername(name))[1] = (SELECT public.get_my_orchard_id())::text)
            OR ((SELECT public.is_role(ARRAY['team_leader']))
                AND EXISTS (
                    SELECT 1 FROM public.qc_inspections q
                    WHERE q.photo_url = objects.name
                      AND q.orchard_id = (SELECT public.get_my_orchard_id())
                      AND public.is_my_team_member(q.picker_id)
                ))));
EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'QC photo storage policies NOT updated (no permission on storage.objects). Run scripts/apply-storage-policies.sh';
END $$;

-- 3) row_assignments ----------------------------------------------------------
DROP POLICY IF EXISTS "Manage row assignments" ON public.row_assignments;

CREATE POLICY "Managers manage row assignments" ON public.row_assignments
    FOR ALL TO authenticated
    USING (
        (SELECT public.is_role(ARRAY['admin']))
        OR (
            orchard_id = (SELECT public.get_my_orchard_id())
            AND (SELECT public.is_role(ARRAY['manager']))
        )
    )
    WITH CHECK (
        (SELECT public.is_role(ARRAY['admin']))
        OR (
            orchard_id = (SELECT public.get_my_orchard_id())
            AND (SELECT public.is_role(ARRAY['manager']))
        )
    );

CREATE POLICY "Team leader updates own team rows" ON public.row_assignments
    FOR UPDATE TO authenticated
    USING (
        orchard_id = (SELECT public.get_my_orchard_id())
        AND team_leader_id = (SELECT auth.uid())
        AND (SELECT public.is_role(ARRAY['team_leader']))
    )
    WITH CHECK (
        orchard_id = (SELECT public.get_my_orchard_id())
        AND team_leader_id = (SELECT auth.uid())
        AND (SELECT public.is_role(ARRAY['team_leader']))
    );

-- El team leader solo apunta avance y fin de las filas de su equipo
CREATE OR REPLACE FUNCTION public.guard_row_assignment_team_leader()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (SELECT auth.uid()) IS NULL OR NOT public.is_role(ARRAY['team_leader']) THEN
        RETURN NEW;
    END IF;
    IF NEW.orchard_id IS DISTINCT FROM OLD.orchard_id
       OR NEW.row_number IS DISTINCT FROM OLD.row_number
       OR NEW.side IS DISTINCT FROM OLD.side
       OR NEW.team_leader_id IS DISTINCT FROM OLD.team_leader_id
       OR NEW.assigned_pickers IS DISTINCT FROM OLD.assigned_pickers
       OR NEW.season_id IS DISTINCT FROM OLD.season_id
       OR NEW.block_row_id IS DISTINCT FROM OLD.block_row_id
       OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('active', 'completed')) THEN
        RAISE EXCEPTION 'Only the manager assigns rows: a team leader records progress and completion of own team rows'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_row_assignment_team_leader() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_row_assignment_team_leader ON public.row_assignments;
CREATE TRIGGER trg_guard_row_assignment_team_leader
    BEFORE UPDATE ON public.row_assignments
    FOR EACH ROW EXECUTE FUNCTION public.guard_row_assignment_team_leader();

-- El team leader mueve a su gente solo a filas asignadas a su equipo
CREATE OR REPLACE FUNCTION public.guard_team_leader_current_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.current_row IS NOT DISTINCT FROM OLD.current_row
       OR COALESCE(NEW.current_row, 0) <= 0
       OR (SELECT auth.uid()) IS NULL
       OR NOT public.is_role(ARRAY['team_leader']) THEN
        RETURN NEW;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.row_assignments ra
        WHERE ra.orchard_id = NEW.orchard_id
          AND ra.team_leader_id = (SELECT auth.uid())
          AND ra.row_number = NEW.current_row
          AND ra.status = 'active'
          AND ra.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Row % is not assigned to your team by the manager', NEW.current_row
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_team_leader_current_row() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_team_leader_current_row ON public.pickers;
CREATE TRIGGER trg_guard_team_leader_current_row
    BEFORE UPDATE OF current_row ON public.pickers
    FOR EACH ROW EXECUTE FUNCTION public.guard_team_leader_current_row();
