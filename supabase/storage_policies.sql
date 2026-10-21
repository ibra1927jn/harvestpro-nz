-- Políticas del almacén "hr-documents" (RRHH, admin y manager).
-- Se aplican como supabase_admin porque storage.objects no es del rol de
-- migraciones en instalaciones nuevas. Idempotente.
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

-- Almacén "qc-photos" (lectura pública por URL). Antes cualquier usuario con
-- sesión podía subir cualquier archivo (alojamiento público gratis) y borrar
-- las fotos de calidad de otros. Suben QC, manager y admin; borra quien subió.
DROP POLICY IF EXISTS "Authenticated users can upload QC photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own QC photos" ON storage.objects;
DROP POLICY IF EXISTS "QC staff upload QC photos" ON storage.objects;
DROP POLICY IF EXISTS "Uploader deletes own QC photos" ON storage.objects;
CREATE POLICY "QC staff upload QC photos" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'qc-photos' AND public.is_role(ARRAY['qc_inspector', 'manager', 'admin']));
CREATE POLICY "Uploader deletes own QC photos" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'qc-photos' AND owner_id = auth.uid()::text);

-- Almacén privado "avatars" (Mi cuenta, migración 20261022050000): cada uno
-- sube, cambia y borra en avatars/<auth.uid()>/…; lee cualquier cuenta con
-- sesión (las fotos se ven en los cajones de perfil de todo el huerto).
DROP POLICY IF EXISTS "Avatars read" ON storage.objects;
DROP POLICY IF EXISTS "Avatars upload own" ON storage.objects;
DROP POLICY IF EXISTS "Avatars update own" ON storage.objects;
DROP POLICY IF EXISTS "Avatars delete own" ON storage.objects;
CREATE POLICY "Avatars read" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'avatars');
CREATE POLICY "Avatars upload own" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "Avatars update own" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
    WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "Avatars delete own" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
