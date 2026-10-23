-- Políticas del almacén "hr-documents" (RRHH y admin; el manager ya no abre
-- los ficheros desde 20261018000000_security_hardening_2: antes este archivo
-- seguía dándoselo y al aplicarlo se le devolvía el acceso).
-- Se aplican como supabase_admin porque storage.objects no es del rol de
-- migraciones en instalaciones nuevas. Idempotente.
DROP POLICY IF EXISTS "hr_docs_hr_manage" ON storage.objects;
DROP POLICY IF EXISTS "HR documents read" ON storage.objects;
DROP POLICY IF EXISTS "HR documents upload" ON storage.objects;
DROP POLICY IF EXISTS "HR documents update" ON storage.objects;
DROP POLICY IF EXISTS "HR documents delete" ON storage.objects;
CREATE POLICY "HR documents read" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'hr-documents' AND public.is_role(ARRAY['hr_admin', 'admin']));
CREATE POLICY "HR documents upload" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'hr-documents' AND public.is_role(ARRAY['hr_admin', 'admin']));
CREATE POLICY "HR documents update" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'hr-documents' AND public.is_role(ARRAY['hr_admin', 'admin']))
    WITH CHECK (bucket_id = 'hr-documents' AND public.is_role(ARRAY['hr_admin', 'admin']));
CREATE POLICY "HR documents delete" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'hr-documents' AND public.is_role(ARRAY['hr_admin', 'admin']));

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
-- Lectura (bucket privado desde 20261018000000_security_hardening_2): QC, manager y admin
DROP POLICY IF EXISTS "QC staff view QC photos" ON storage.objects;
CREATE POLICY "QC staff view QC photos" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'qc-photos' AND public.is_role(ARRAY['qc_inspector', 'manager', 'admin']));

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

-- Almacén privado "chat-attachments" (fotos, PDF y notas de voz del chat,
-- migración 20261023050000): sube y lee quien participa en la conversación de
-- la carpeta (<conversation_id>/<uuid>.<ext>); borra quien subió.
DROP POLICY IF EXISTS "Chat attachments read" ON storage.objects;
DROP POLICY IF EXISTS "Chat attachments upload" ON storage.objects;
DROP POLICY IF EXISTS "Chat attachments delete own" ON storage.objects;
CREATE POLICY "Chat attachments read" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'chat-attachments' AND EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id::text = (storage.foldername(objects.name))[1]
          AND (SELECT auth.uid())::text = ANY (c.participant_ids)));
CREATE POLICY "Chat attachments upload" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'chat-attachments' AND EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id::text = (storage.foldername(objects.name))[1]
          AND (SELECT auth.uid())::text = ANY (c.participant_ids)));
CREATE POLICY "Chat attachments delete own" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'chat-attachments' AND owner_id = (SELECT auth.uid())::text);
