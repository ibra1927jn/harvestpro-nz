-- =============================================================================
-- Almacén "qc-photos" (hueco encontrado por supabase/tests/security/20_people.sql)
--
-- El almacén es de lectura pública. Cualquier usuario con sesión podía subir
-- cualquier archivo (alojamiento público gratis) y borrar las fotos de calidad
-- de otras personas ("Users can delete own QC photos" no miraba el dueño).
-- Ahora suben QC, manager y admin (pantalla QC) y borra quien subió la foto.
--
-- Igual que 20261013030000: si el rol de migraciones no puede crear
-- políticas en storage.objects, se avisa y hay que aplicar
-- supabase/storage_policies.sql (scripts/apply-storage-policies.sh).
-- =============================================================================
DO $$
BEGIN
    DROP POLICY IF EXISTS "Authenticated users can upload QC photos" ON storage.objects;
    DROP POLICY IF EXISTS "Users can delete own QC photos" ON storage.objects;
    DROP POLICY IF EXISTS "QC staff upload QC photos" ON storage.objects;
    DROP POLICY IF EXISTS "Uploader deletes own QC photos" ON storage.objects;
    CREATE POLICY "QC staff upload QC photos" ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'qc-photos' AND public.is_role(ARRAY['qc_inspector', 'manager', 'admin']));
    CREATE POLICY "Uploader deletes own QC photos" ON storage.objects FOR DELETE TO authenticated
        USING (bucket_id = 'qc-photos' AND owner_id = auth.uid()::text);
EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'QC photo storage policies NOT created (no permission on storage.objects). Run scripts/apply-storage-policies.sh';
END $$;
