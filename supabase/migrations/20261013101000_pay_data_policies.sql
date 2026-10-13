-- =============================================================================
-- Datos que deciden la paga: cubetas, fichajes, tarifas, configuración del
-- día, cierres de día y contratos (huecos encontrados por
-- supabase/tests/security/10_pay_data.sql)
--
-- 1) bucket_records: las políticas "no_insert/no_update/no_delete_on_closed_days"
--    y "Block scans from archived pickers" eran PERMISSIVE: en Postgres se
--    SUMAN (OR) a las demás, así que en vez de restringir abrían la tabla.
--    Resultado: cualquiera, incluso SIN SESIÓN (clave anon), podía crear
--    cubetas en cualquier huerto, y cualquier usuario con sesión (runner,
--    QC, logística…) podía editar o borrar cubetas de días no cerrados.
--    Ahora: escanean runner / jefe de equipo / manager en su huerto (admin en
--    cualquiera); corrigen y borran manager de ese huerto y admin; y las
--    restricciones son RESTRICTIVE (día cerrado con fecha NZ, recolector
--    archivado).
-- 2) daily_attendance: un jefe de equipo / manager podía crear fichajes en
--    cualquier huerto y crear, cambiar o aprobar SU PROPIA hoja de horas.
--    Ahora el alta es en su huerto y nadie salvo admin toca su propio fichaje.
-- 3) day_setups: el jefe de equipo podía cambiar la tarifa a destajo del día.
-- 4) day_closures: un manager podía cerrar días de otro huerto.
-- 5) contracts: un manager podía crear y cambiar contratos (tarifa por hora);
--    RRHH y admin los gestionan (pantalla RRHH). El manager los sigue leyendo.
-- 6) wage_rates: no miraba si la cuenta está activa.
-- 7) Un fichaje no se puede mover a otro huerto (salvo admin).
-- =============================================================================

-- 1) Cubetas ------------------------------------------------------------------
DROP POLICY IF EXISTS "bucket_records_insert_policy" ON public.bucket_records;
DROP POLICY IF EXISTS "Insert bucket records" ON public.bucket_records;
DROP POLICY IF EXISTS "no_insert_on_closed_days" ON public.bucket_records;
DROP POLICY IF EXISTS "Block scans from archived pickers" ON public.bucket_records;
DROP POLICY IF EXISTS "bucket_records_update_policy" ON public.bucket_records;
DROP POLICY IF EXISTS "no_update_on_closed_days" ON public.bucket_records;
DROP POLICY IF EXISTS "no_delete_on_closed_days" ON public.bucket_records;

-- Escanean: runner, jefe de equipo y manager en su huerto (record-bucket usa
-- la sesión del usuario); admin en cualquiera
DROP POLICY IF EXISTS "Scanners insert bucket records" ON public.bucket_records;
CREATE POLICY "Scanners insert bucket records" ON public.bucket_records FOR INSERT TO authenticated
    WITH CHECK (
        public.is_role(ARRAY['admin'])
        OR (public.is_role(ARRAY['manager', 'team_leader', 'runner']) AND orchard_id = public.get_my_orchard_id())
    );

DROP POLICY IF EXISTS "Managers correct bucket records" ON public.bucket_records;
CREATE POLICY "Managers correct bucket records" ON public.bucket_records FOR UPDATE TO authenticated
    USING (public.is_role(ARRAY['admin']) OR (public.is_role(ARRAY['manager']) AND orchard_id = public.get_my_orchard_id()))
    WITH CHECK (public.is_role(ARRAY['admin']) OR (public.is_role(ARRAY['manager']) AND orchard_id = public.get_my_orchard_id()));

DROP POLICY IF EXISTS "Managers delete bucket records" ON public.bucket_records;
CREATE POLICY "Managers delete bucket records" ON public.bucket_records FOR DELETE TO authenticated
    USING (public.is_role(ARRAY['admin']) OR (public.is_role(ARRAY['manager']) AND orchard_id = public.get_my_orchard_id()));

-- Restricciones de verdad (RESTRICTIVE = se exigen además de lo anterior)
DROP POLICY IF EXISTS "Restrict scans of archived pickers" ON public.bucket_records;
CREATE POLICY "Restrict scans of archived pickers" ON public.bucket_records AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (NOT EXISTS (
        SELECT 1 FROM public.pickers p WHERE p.id = bucket_records.picker_id AND p.status = 'archived'));

-- Día cerrado (fecha NZ del escaneo; antes se usaba la fecha UTC)
DROP POLICY IF EXISTS "Restrict changes on closed days" ON public.bucket_records;
CREATE POLICY "Restrict changes on closed days" ON public.bucket_records AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (NOT EXISTS (
        SELECT 1 FROM public.day_closures dc
        WHERE dc.orchard_id = bucket_records.orchard_id AND dc.status = 'closed'
          AND dc.date = (bucket_records.scanned_at AT TIME ZONE 'Pacific/Auckland')::date));

DROP POLICY IF EXISTS "Restrict deletes on closed days" ON public.bucket_records;
CREATE POLICY "Restrict deletes on closed days" ON public.bucket_records AS RESTRICTIVE FOR DELETE TO authenticated
    USING (NOT EXISTS (
        SELECT 1 FROM public.day_closures dc
        WHERE dc.orchard_id = bucket_records.orchard_id AND dc.status = 'closed'
          AND dc.date = (bucket_records.scanned_at AT TIME ZONE 'Pacific/Auckland')::date));

-- 2) Fichajes -----------------------------------------------------------------
-- Alta en cualquier huerto: fuera ("Manage attendance" ya cubre el propio)
DROP POLICY IF EXISTS "attendance_insert_policy" ON public.daily_attendance;

DROP POLICY IF EXISTS "Manage attendance" ON public.daily_attendance;
CREATE POLICY "Manage attendance" ON public.daily_attendance FOR ALL TO authenticated
    USING (
        public.is_role(ARRAY['admin'])
        OR (orchard_id = public.get_my_orchard_id() AND public.is_role(ARRAY['manager', 'team_leader', 'hr_admin']))
    )
    WITH CHECK (
        public.is_role(ARRAY['admin'])
        OR (orchard_id = public.get_my_orchard_id() AND public.is_role(ARRAY['manager', 'team_leader', 'hr_admin']))
    );

-- Cambios desde otro huerto (manage-attendance cierra el turno abierto en el
-- huerto anterior al fichar en otro): se mantiene, sin mover el fichaje
DROP POLICY IF EXISTS "attendance_update_policy" ON public.daily_attendance;
CREATE POLICY "attendance_update_policy" ON public.daily_attendance FOR UPDATE TO authenticated
    USING (public.is_role(ARRAY['manager', 'team_leader']))
    WITH CHECK (public.is_role(ARRAY['manager', 'team_leader']));

-- Nadie (salvo admin) crea, cambia, aprueba ni borra su propio fichaje
DROP POLICY IF EXISTS "No self attendance insert" ON public.daily_attendance;
CREATE POLICY "No self attendance insert" ON public.daily_attendance AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (picker_id IS DISTINCT FROM auth.uid() OR public.is_role(ARRAY['admin']));
DROP POLICY IF EXISTS "No self attendance update" ON public.daily_attendance;
CREATE POLICY "No self attendance update" ON public.daily_attendance AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (picker_id IS DISTINCT FROM auth.uid() OR public.is_role(ARRAY['admin']))
    WITH CHECK (picker_id IS DISTINCT FROM auth.uid() OR public.is_role(ARRAY['admin']));
DROP POLICY IF EXISTS "No self attendance delete" ON public.daily_attendance;
CREATE POLICY "No self attendance delete" ON public.daily_attendance AS RESTRICTIVE FOR DELETE TO authenticated
    USING (picker_id IS DISTINCT FROM auth.uid() OR public.is_role(ARRAY['admin']));

-- 3) Configuración del día (tarifa a destajo): manager del huerto o admin
DROP POLICY IF EXISTS "Manage day setups" ON public.day_setups;
CREATE POLICY "Manage day setups" ON public.day_setups FOR ALL TO authenticated
    USING (public.is_role(ARRAY['admin']) OR (public.is_role(ARRAY['manager']) AND orchard_id = public.get_my_orchard_id()))
    WITH CHECK (public.is_role(ARRAY['admin']) OR (public.is_role(ARRAY['manager']) AND orchard_id = public.get_my_orchard_id()));

-- 4) Cierre del día: manager del huerto o admin
DROP POLICY IF EXISTS "manager_only_insert_day_closures" ON public.day_closures;
DROP POLICY IF EXISTS "Managers close days" ON public.day_closures;
CREATE POLICY "Managers close days" ON public.day_closures FOR ALL TO authenticated
    USING (public.is_role(ARRAY['admin']) OR (public.is_role(ARRAY['manager']) AND orchard_id = public.get_my_orchard_id()))
    WITH CHECK (public.is_role(ARRAY['admin']) OR (public.is_role(ARRAY['manager']) AND orchard_id = public.get_my_orchard_id()));

-- 5) Contratos: escriben RRHH y admin ("HR manages company contracts")
DROP POLICY IF EXISTS "HR manage contracts" ON public.contracts;

-- 6) Tarifas por hora: roles de gestión activos, en su huerto
DROP POLICY IF EXISTS "Managers can manage wage rates" ON public.wage_rates;
CREATE POLICY "Managers can manage wage rates" ON public.wage_rates FOR ALL TO authenticated
    USING (orchard_id = public.get_my_orchard_id()
           AND public.is_role(ARRAY['manager', 'admin', 'hr_admin', 'payroll_admin']))
    WITH CHECK (orchard_id = public.get_my_orchard_id()
                AND public.is_role(ARRAY['manager', 'admin', 'hr_admin', 'payroll_admin']));

-- Un fichaje no cambia de huerto (quien paga ese turno); solo admin / servidor
CREATE OR REPLACE FUNCTION public.guard_attendance_orchard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NOT NULL AND NEW.orchard_id IS DISTINCT FROM OLD.orchard_id
       AND NOT public.is_role(ARRAY['admin']) THEN
        RAISE EXCEPTION 'Cannot move a timesheet to another orchard' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_attendance_orchard ON public.daily_attendance;
CREATE TRIGGER trg_guard_attendance_orchard
    BEFORE UPDATE OF orchard_id ON public.daily_attendance
    FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_orchard();
