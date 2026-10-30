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

-- Almacén privado "qc-photos" (enlaces firmados desde 20261018000000_security_hardening_2).
-- Rutas <orchard_id>/<día>/<inspección>.webp; desde 20261027020000_qc_photos_by_orchard
-- cada huerto solo sube en su carpeta (primera carpeta = get_my_orchard_id()): QC y
-- manager de ese huerto; admin, cualquier huerto. Borra quien subió, en su huerto.
-- Ver (20261027040000_team_scoped_leave_qc_rows): manager, las de su huerto; RRHH y
-- admin, todas; QC, las que subió; team leader, las de inspecciones de SU equipo.
DROP POLICY IF EXISTS "Authenticated users can upload QC photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own QC photos" ON storage.objects;
DROP POLICY IF EXISTS "Public can view QC photos" ON storage.objects;
DROP POLICY IF EXISTS "QC staff upload QC photos" ON storage.objects;
DROP POLICY IF EXISTS "Uploader deletes own QC photos" ON storage.objects;
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
CREATE POLICY "QC staff upload QC photos" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'qc-photos' AND (
        (SELECT public.is_role(ARRAY['admin']))
        OR ((SELECT public.is_role(ARRAY['qc_inspector', 'manager']))
            AND (storage.foldername(name))[1] = (SELECT public.get_my_orchard_id())::text)));
CREATE POLICY "Uploader deletes own QC photos" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'qc-photos' AND owner_id = (SELECT auth.uid())::text AND (
        (SELECT public.is_role(ARRAY['admin']))
        OR (storage.foldername(name))[1] = (SELECT public.get_my_orchard_id())::text));

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

-- Cuentas de baja (Fase 2, migración 20261027030000_fase2_rls_gaps): ningún
-- fichero, ni para leer ni para subir, mientras su token siga vivo.
DROP POLICY IF EXISTS "Active accounts only" ON storage.objects;
CREATE POLICY "Active accounts only" ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
    USING ((SELECT public.is_active_member()))
    WITH CHECK ((SELECT public.is_active_member()));
