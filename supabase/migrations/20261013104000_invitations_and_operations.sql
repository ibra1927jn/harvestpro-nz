-- =============================================================================
-- Invitaciones y operación (huecos encontrados por
-- supabase/tests/security/20_people.sql y 50_operations.sql)
--
-- 1) allowed_registrations: la invitación decide el rol de la cuenta que se
--    registra (guard_user_changes). Un manager podía crear una invitación de
--    "admin" (o cambiar una existente) y registrarse con ella: escalada a
--    admin. Ahora: admin invita a cualquier rol; RRHH a cualquiera menos
--    admin; manager solo personal de campo de su huerto (mismos roles que
--    puede vincular en guard_user_changes).
-- 2) orchards: cualquier manager podía cambiar cualquier huerto.
-- 3) row_assignments: "Team leaders manage row assignments" no miraba el
--    huerto: un jefe de equipo / manager de otro huerto cambiaba filas ajenas.
-- 4) qc_inspections: cualquier usuario (runner, jefe de equipo) podía
--    registrar inspecciones de calidad (p. ej. "reject") de un recolector.
-- =============================================================================

-- 1) Invitaciones
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

    SELECT role, orchard_id INTO v_role, v_orchard FROM public.users WHERE id = auth.uid() AND is_active;

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
REVOKE EXECUTE ON FUNCTION public.guard_invitation_role() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_invitation_role ON public.allowed_registrations;
CREATE TRIGGER trg_guard_invitation_role
    BEFORE INSERT OR UPDATE ON public.allowed_registrations
    FOR EACH ROW EXECUTE FUNCTION public.guard_invitation_role();

-- 2) Huertos: el manager cambia el suyo; admin cualquiera
DROP POLICY IF EXISTS "orchards_update_policy" ON public.orchards;
CREATE POLICY "orchards_update_policy" ON public.orchards FOR UPDATE TO authenticated
    USING (public.is_role(ARRAY['admin']) OR (public.is_role(ARRAY['manager']) AND id = public.get_my_orchard_id()))
    WITH CHECK (public.is_role(ARRAY['admin']) OR (public.is_role(ARRAY['manager']) AND id = public.get_my_orchard_id()));

-- 3) Asignación de filas: manager / jefe de equipo de ese huerto; admin
DROP POLICY IF EXISTS "Team leaders manage row assignments" ON public.row_assignments;
DROP POLICY IF EXISTS "Manage row assignments" ON public.row_assignments;
CREATE POLICY "Manage row assignments" ON public.row_assignments FOR ALL TO authenticated
    USING (public.is_role(ARRAY['admin']) OR (orchard_id = public.get_my_orchard_id() AND public.is_manager_or_leader()))
    WITH CHECK (public.is_role(ARRAY['admin']) OR (orchard_id = public.get_my_orchard_id() AND public.is_manager_or_leader()));

-- 4) Inspecciones de calidad: QC, manager y admin (como la pantalla QC)
DROP POLICY IF EXISTS "QC inspectors create inspections" ON public.qc_inspections;
CREATE POLICY "QC inspectors create inspections" ON public.qc_inspections FOR INSERT TO authenticated
    WITH CHECK (
        inspector_id = auth.uid()
        AND orchard_id = public.get_my_orchard_id()
        AND public.is_role(ARRAY['qc_inspector', 'manager', 'admin'])
    );

DROP POLICY IF EXISTS "Managers manage inspections" ON public.qc_inspections;
CREATE POLICY "Managers manage inspections" ON public.qc_inspections FOR ALL TO authenticated
    USING (orchard_id = public.get_my_orchard_id() AND public.is_role(ARRAY['manager', 'qc_inspector', 'admin']))
    WITH CHECK (orchard_id = public.get_my_orchard_id() AND public.is_role(ARRAY['manager', 'qc_inspector', 'admin']));
