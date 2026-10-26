-- =============================================================================
-- harvest_settings: lectura solo del propio huerto (+ los roles de empresa)
--
-- Seguían abiertas dos políticas de lectura antiguas, permisivas, que anulaban
-- la buena ("Read settings", por huerto), porque las permisivas se suman con OR:
--   - "Users can read settings"  USING (true)                 (20260227_rls_hierarchy_tables)
--   - "settings_view_policy"     USING (auth.uid() IS NOT NULL) (2026030101_rls_consolidation)
-- Cualquier sesión (un runner de otro huerto) leía la tarifa, el mínimo y los
-- objetivos de todos los huertos. Inventario de ramas 2026-10-27, clase B.
--
-- Queda una sola política de lectura, con el mismo modelo que daily_attendance
-- y bucket_records (20261012020000_company_wide_people):
--   - cualquier miembro activo lee la configuración de SU huerto
--     (get_my_orchard_id() es NULL si la cuenta está de baja);
--   - admin, manager, payroll_admin y hr_admin (can_read_company_payroll(), que
--     ya exige 2FA) leen la de todos: la nómina de la empresa usa el precio
--     guardado de cada huerto como respaldo (payroll-calc.ts, loadForPay).
-- La escritura no cambia ("Manage settings" y "Admin manages settings", de
-- 20261013060000_security_hardening). La restrictiva de 2FA sigue aplicando.
-- Funciones envueltas en (SELECT ...) para que se evalúen una vez por consulta
-- (20261021000100_rls_initplan).
-- =============================================================================

DROP POLICY IF EXISTS "Users can read settings" ON public.harvest_settings;
DROP POLICY IF EXISTS "settings_view_policy" ON public.harvest_settings;

DROP POLICY IF EXISTS "Read settings" ON public.harvest_settings;
CREATE POLICY "Read settings" ON public.harvest_settings
    FOR SELECT TO authenticated
    USING (
        orchard_id = (SELECT public.get_my_orchard_id())
        OR (SELECT public.can_read_company_payroll())
    );

REVOKE ALL ON public.harvest_settings FROM anon;
