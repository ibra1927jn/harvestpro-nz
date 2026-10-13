-- =============================================================================
-- Documentos de RRHH y bins: solo cuentas activas
--
-- 20261013100000 hizo que is_role() exija is_active ("un manager dado de baja
-- seguía con todos sus permisos"), pero dos políticas de escritura miraban
-- el rol directamente en public.users, sin is_active:
--   · hr_documents_hr_manage (ALL): un manager / RRHH / admin dado de baja
--     seguía leyendo, cambiando y borrando visados y pasaportes;
--   · "Runners and logistics update bins": un runner / logística dado de
--     baja seguía cambiando bins.
-- Mismas reglas, con is_role() (cuenta activa).
-- (prueba: supabase/tests/security/20_people.sql, "once deactivated")
-- =============================================================================

DROP POLICY IF EXISTS "hr_documents_hr_manage" ON public.hr_documents;
CREATE POLICY "hr_documents_hr_manage" ON public.hr_documents FOR ALL
    USING (public.is_role(ARRAY['hr_admin', 'admin', 'manager']))
    WITH CHECK (public.is_role(ARRAY['hr_admin', 'admin', 'manager']));

DROP POLICY IF EXISTS "Runners and logistics update bins" ON public.bins;
CREATE POLICY "Runners and logistics update bins" ON public.bins FOR UPDATE
    USING (orchard_id = public.get_my_orchard_id() AND public.is_role(ARRAY['runner', 'logistics']))
    WITH CHECK (orchard_id = public.get_my_orchard_id());
