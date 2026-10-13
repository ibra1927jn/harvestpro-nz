-- =============================================================================
-- RRHH: documentos y contratos que de verdad se pueden guardar
--
-- 1) Almacén "hr-documents": la política de acceso de la migración original
--    no llegó a crearse (bloque con permisos que solo avisaba), así que nadie
--    podía subir ni descargar documentos. Se crean las políticas: RRHH, admin
--    y manager pueden subir, ver y borrar documentos de RRHH.
-- 2) Contratos: RRHH trabaja con toda la empresa (la gente rota entre
--    huertos), pero solo podía crear/editar contratos de su propio huerto.
-- =============================================================================

-- 1) Almacén de documentos de RRHH
-- storage.objects pertenece a supabase_storage_admin. En una instalación
-- nueva con Supabase CLI el rol de migraciones no puede crear políticas ahí:
-- se intenta y, si no hay permiso, se avisa y hay que aplicar
-- supabase/storage_policies.sql como supabase_admin
-- (scripts/apply-storage-policies.sh). Mismo contenido que ese archivo.
DO $$
BEGIN
    DROP POLICY IF EXISTS "hr_docs_hr_manage" ON storage.objects;
    DROP POLICY IF EXISTS "HR documents read" ON storage.objects;
    DROP POLICY IF EXISTS "HR documents upload" ON storage.objects;
    DROP POLICY IF EXISTS "HR documents update" ON storage.objects;
    DROP POLICY IF EXISTS "HR documents delete" ON storage.objects;
    CREATE POLICY "HR documents read" ON storage.objects FOR SELECT TO authenticated
        USING (bucket_id = 'hr-documents' AND public.is_role(ARRAY['hr_admin', 'admin', 'manager']));
    CREATE POLICY "HR documents upload" ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'hr-documents' AND public.is_role(ARRAY['hr_admin', 'admin', 'manager']));
    CREATE POLICY "HR documents update" ON storage.objects FOR UPDATE TO authenticated
        USING (bucket_id = 'hr-documents' AND public.is_role(ARRAY['hr_admin', 'admin', 'manager']));
    CREATE POLICY "HR documents delete" ON storage.objects FOR DELETE TO authenticated
        USING (bucket_id = 'hr-documents' AND public.is_role(ARRAY['hr_admin', 'admin', 'manager']));
EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'HR documents storage policies NOT created (no permission on storage.objects). Run scripts/apply-storage-policies.sh';
END $$;

-- 2) Contratos: RRHH trabaja con toda la empresa (la gente rota entre
--    huertos), pero solo podía crear/editar contratos de su propio huerto.
-- =============================================================================


-- 2) Contratos de toda la empresa para RRHH y admin
DROP POLICY IF EXISTS "HR manages company contracts" ON public.contracts;
CREATE POLICY "HR manages company contracts" ON public.contracts
    FOR ALL
    USING (public.is_role(ARRAY['hr_admin', 'admin']))
    WITH CHECK (public.is_role(ARRAY['hr_admin', 'admin']));
