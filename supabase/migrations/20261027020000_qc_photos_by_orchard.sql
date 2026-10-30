-- =============================================================================
-- Fotos de QC (almacén privado "qc-photos"): cada huerto solo ve su carpeta
--
-- Las fotos se guardan en <orchard_id>/<día NZ>/<inspección>.webp (useQC.ts; la
-- cola sin red valida esa forma en sync.schemas.ts). Las políticas solo miraban
-- el rol: un QC o un manager de CUALQUIER huerto podía ver, firmar enlaces o
-- subir fotos en la carpeta de otro huerto. Inventario de ramas 2026-10-27, B.
--
-- Ahora la primera carpeta de la ruta tiene que ser el huerto de quien llama
-- (get_my_orchard_id(), NULL si la cuenta está de baja):
--   - ver (y firmar enlaces): QC y manager de ese huerto; admin, cualquiera;
--   - subir: QC y manager en la carpeta de su huerto; admin, en cualquiera;
--   - borrar: solo quien subió la foto, y dentro de su huerto (admin, cualquiera).
-- La restrictiva de 2FA de storage.objects sigue aplicando. Funciones envueltas
-- en (SELECT ...) (20261021000100_rls_initplan). Mismo texto en
-- supabase/storage_policies.sql.
--
-- storage.objects pertenece a supabase_storage_admin: si el rol de migraciones
-- no puede crear políticas, se avisa y hay que aplicar
-- supabase/storage_policies.sql (scripts/apply-storage-policies.sh).
-- =============================================================================
DO $$
BEGIN
    DROP POLICY IF EXISTS "QC staff view QC photos" ON storage.objects;
    DROP POLICY IF EXISTS "QC staff upload QC photos" ON storage.objects;
    DROP POLICY IF EXISTS "Uploader deletes own QC photos" ON storage.objects;

    CREATE POLICY "QC staff view QC photos" ON storage.objects FOR SELECT TO authenticated
        USING (bucket_id = 'qc-photos' AND (
            (SELECT public.is_role(ARRAY['admin']))
            OR ((SELECT public.is_role(ARRAY['qc_inspector', 'manager']))
                AND (storage.foldername(name))[1] = (SELECT public.get_my_orchard_id())::text)));

    CREATE POLICY "QC staff upload QC photos" ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'qc-photos' AND (
            (SELECT public.is_role(ARRAY['admin']))
            OR ((SELECT public.is_role(ARRAY['qc_inspector', 'manager']))
                AND (storage.foldername(name))[1] = (SELECT public.get_my_orchard_id())::text)));

    CREATE POLICY "Uploader deletes own QC photos" ON storage.objects FOR DELETE TO authenticated
        USING (bucket_id = 'qc-photos' AND owner_id = (SELECT auth.uid())::text AND (
            (SELECT public.is_role(ARRAY['admin']))
            OR (storage.foldername(name))[1] = (SELECT public.get_my_orchard_id())::text));
EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'QC photo storage policies NOT updated (no permission on storage.objects). Run scripts/apply-storage-policies.sh';
END $$;
