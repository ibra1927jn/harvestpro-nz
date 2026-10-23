-- =============================================================================
-- Chat: adjuntos, silenciar y gestión de grupos (migración 20261023050000)
--   · chat_messages: columnas del adjunto; texto vacío solo con adjunto; la
--     ruta tiene que estar en la carpeta de su conversación
--   · Almacén privado "chat-attachments": sube y lee quien participa en la
--     conversación de la carpeta; borra quien subió
--   · set_conversation_muted(): cada participante lo suyo
--   · update_conversation(): solo creador / manager / admin que participan
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- Grupo de prueba creado por el runner A: runner A, runner2 A y jefe de equipo A
DO $$
DECLARE v_id uuid;
BEGIN
    INSERT INTO public.conversations (type, name, participant_ids, created_by)
    VALUES ('group', 'SecTest group',
            ARRAY[sec_test.id_of('A.runner')::text, sec_test.id_of('A.runner2')::text, sec_test.id_of('A.team_leader')::text],
            sec_test.id_of('A.runner'))
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.group', v_id);
    -- El manager A también está, para probar que gestiona sin haberlo creado
    UPDATE public.conversations SET participant_ids = participant_ids || sec_test.id_of('A.manager')::text WHERE id = v_id;
END $$;

-- ── Columnas del adjunto ─────────────────────────────────────────────────────
SELECT sec_test.allow('A.runner', 'sends a photo without text',
    $$INSERT INTO chat_messages (conversation_id, sender_id, content, attachment_path, attachment_type, attachment_name, attachment_size)
      VALUES ({A.conv}, auth.uid(), '', {A.conv}::text || '/' || gen_random_uuid()::text || '.jpg', 'image', 'row 12.jpg', 123456)$$);
SELECT sec_test.allow('A.runner', 'sends a voice note with its duration',
    $$INSERT INTO chat_messages (conversation_id, sender_id, attachment_path, attachment_type, attachment_size, duration_ms)
      VALUES ({A.conv}, auth.uid(), {A.conv}::text || '/' || gen_random_uuid()::text || '.webm', 'audio', 40000, 42000)$$);
SELECT sec_test.deny('A.runner', 'cannot send an empty message without attachment',
    $$INSERT INTO chat_messages (conversation_id, sender_id, content) VALUES ({A.conv}, auth.uid(), '  ')$$, ARRAY['23514']);
SELECT sec_test.deny('A.runner', 'cannot point an attachment at another conversation''s folder',
    $$INSERT INTO chat_messages (conversation_id, sender_id, attachment_path, attachment_type, attachment_size)
      VALUES ({A.conv}, auth.uid(), {A.group}::text || '/' || gen_random_uuid()::text || '.jpg', 'image', 10)$$, ARRAY['23514']);
SELECT sec_test.deny('A.runner', 'rejects a path with traversal',
    $$INSERT INTO chat_messages (conversation_id, sender_id, attachment_path, attachment_type, attachment_size)
      VALUES ({A.conv}, auth.uid(), {A.conv}::text || '/../x/' || gen_random_uuid()::text || '.jpg', 'image', 10)$$, ARRAY['23514']);
SELECT sec_test.deny('A.runner', 'rejects an attachment over 10 MB',
    $$INSERT INTO chat_messages (conversation_id, sender_id, attachment_path, attachment_type, attachment_size)
      VALUES ({A.conv}, auth.uid(), {A.conv}::text || '/' || gen_random_uuid()::text || '.pdf', 'pdf', 10485761)$$, ARRAY['23514']);
SELECT sec_test.deny('A.runner', 'rejects an unknown attachment type',
    $$INSERT INTO chat_messages (conversation_id, sender_id, attachment_path, attachment_type, attachment_size)
      VALUES ({A.conv}, auth.uid(), {A.conv}::text || '/' || gen_random_uuid()::text || '.pdf', 'html', 10)$$, ARRAY['23514']);
SELECT sec_test.deny('A.runner', 'rejects a voice note over 2 minutes',
    $$INSERT INTO chat_messages (conversation_id, sender_id, attachment_path, attachment_type, attachment_size, duration_ms)
      VALUES ({A.conv}, auth.uid(), {A.conv}::text || '/' || gen_random_uuid()::text || '.webm', 'audio', 10, 600000)$$, ARRAY['23514']);
SELECT sec_test.deny('A.runner', 'rejects a duration on a photo',
    $$INSERT INTO chat_messages (conversation_id, sender_id, attachment_path, attachment_type, attachment_size, duration_ms)
      VALUES ({A.conv}, auth.uid(), {A.conv}::text || '/' || gen_random_uuid()::text || '.jpg', 'image', 10, 1000)$$, ARRAY['23514']);
SELECT sec_test.deny('A.runner2', 'cannot post an attachment in someone else''s conversation',
    $$INSERT INTO chat_messages (conversation_id, sender_id, attachment_path, attachment_type, attachment_size)
      VALUES ({A.conv}, auth.uid(), {A.conv}::text || '/' || gen_random_uuid()::text || '.jpg', 'image', 10)$$);
SELECT sec_test.returns('A.runner', 'last_messages gives the attachment type',
    $$WITH m AS (INSERT INTO chat_messages (conversation_id, sender_id, attachment_path, attachment_type, attachment_size, created_at)
                 VALUES ({A.group}, auth.uid(), {A.group}::text || '/' || gen_random_uuid()::text || '.pdf', 'pdf', 10, now() + interval '1 hour')
                 RETURNING id)
      SELECT (SELECT count(*) FROM m)::text$$, '1');

-- ── Almacén "chat-attachments" ───────────────────────────────────────────────
SELECT sec_test.record(
    COALESCE((SELECT public = false AND file_size_limit = 10485760
                     AND allowed_mime_types @> ARRAY['image/jpeg', 'application/pdf', 'audio/webm', 'audio/mp4']
                     AND NOT allowed_mime_types @> ARRAY['text/html']
              FROM storage.buckets WHERE id = 'chat-attachments'), false),
    'chat-attachments: private bucket, 10 MB, photos/PDF/audio only', 'missing, public, or limits differ');

-- Archivo ya subido por el runner A en su conversación con el manager
INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
SELECT 'chat-attachments', (SELECT id FROM sec_test.ids WHERE key = 'A.conv')::text || '/11111111-1111-1111-1111-111111111111.jpg', id, id::text
FROM sec_test.who WHERE key = 'A.runner';

SELECT sec_test.allow(w, 'uploads into a conversation it is in',
    $$INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
      VALUES ('chat-attachments', {A.conv}::text || '/' || gen_random_uuid()::text || '.jpg', auth.uid(), auth.uid()::text)$$)
FROM unnest(ARRAY['A.runner', 'A.manager']) AS w;
SELECT sec_test.deny(w, 'cannot upload into a conversation it is not in',
    $$INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
      VALUES ('chat-attachments', {A.conv}::text || '/' || gen_random_uuid()::text || '.jpg', auth.uid(), auth.uid()::text)$$)
FROM unnest(ARRAY['A.runner2', 'A.admin', 'A.hr_admin', 'B.manager']) AS w;
SELECT sec_test.deny('A.runner', 'cannot upload at the bucket root',
    $$INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES ('chat-attachments', 'x.jpg', auth.uid(), auth.uid()::text)$$);
SELECT sec_test.deny('A.runner', 'cannot upload into a made-up folder',
    $$INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES ('chat-attachments', 'not-a-uuid/x.jpg', auth.uid(), auth.uid()::text)$$);
SELECT sec_test.deny('anon', 'cannot upload',
    $$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('chat-attachments', {A.conv}::text || '/x.jpg', NULL)$$);

SELECT sec_test.sees(w, 'reads attachments of its conversation', $$SELECT 1 FROM storage.objects WHERE bucket_id = 'chat-attachments'$$, 1)
FROM unnest(ARRAY['A.runner', 'A.manager']) AS w;
SELECT sec_test.sees(w, 'cannot read attachments of other conversations', $$SELECT 1 FROM storage.objects WHERE bucket_id = 'chat-attachments'$$, 0)
FROM unnest(ARRAY['anon', 'A.runner2', 'A.admin', 'A.hr_admin', 'B.manager']) AS w;
SELECT sec_test.sees('A.manager@aal1', 'aal1: privileged role sees no attachments without 2FA', $$SELECT 1 FROM storage.objects WHERE bucket_id = 'chat-attachments'$$, 0);

SELECT sec_test.allow('A.runner', 'deletes own upload', $$DELETE FROM storage.objects WHERE bucket_id = 'chat-attachments'$$);
SELECT sec_test.deny(w, 'cannot delete someone else''s upload', $$DELETE FROM storage.objects WHERE bucket_id = 'chat-attachments'$$)
FROM unnest(ARRAY['anon', 'A.manager', 'A.runner2', 'A.admin']) AS w;
SELECT sec_test.deny(w, 'cannot move an upload', $$UPDATE storage.objects SET name = 'x/y.jpg' WHERE bucket_id = 'chat-attachments'$$)
FROM unnest(ARRAY['A.runner', 'A.manager']) AS w;

-- ── Silenciar ────────────────────────────────────────────────────────────────
SELECT sec_test.returns('A.runner', 'mutes own conversation',
    $$SELECT set_conversation_muted({A.conv}, true)::text$$, 'true');
SELECT sec_test.deny('A.runner2', 'cannot mute a conversation it is not in', $$SELECT set_conversation_muted({A.conv}, true)$$, ARRAY['P0002']);
SELECT sec_test.deny('anon', 'cannot mute', $$SELECT set_conversation_muted({A.conv}, true)$$);
SELECT sec_test.deny('A.runner', 'cannot change muted_by directly', $$UPDATE conversations SET muted_by = ARRAY[{A.manager}::text] WHERE id = {A.conv}$$);

-- ── Gestionar un grupo ───────────────────────────────────────────────────────
SELECT sec_test.returns('A.runner', 'creator renames the group',
    $$SELECT update_conversation({A.group}, '  Block A crew ', NULL, NULL)->>'name'$$, 'Block A crew');
SELECT sec_test.returns('A.manager', 'a manager in the group adds a person',
    $$SELECT jsonb_array_length(update_conversation({A.group}, NULL, ARRAY[{A.qc_inspector}], NULL)->'participant_ids')::text$$, '5');
SELECT sec_test.returns('A.runner', 'creator removes a person',
    $$SELECT (update_conversation({A.group}, NULL, NULL, ARRAY[{A.runner2}])->'participant_ids' ? {A.runner2}::text)::text$$, 'false');
SELECT sec_test.deny(w, 'cannot change a group it did not create', $$SELECT update_conversation({A.group}, 'Mine now', NULL, NULL)$$)
FROM unnest(ARRAY['A.runner2', 'A.team_leader']) AS w;
SELECT sec_test.deny(w, 'cannot change a group it is not in', $$SELECT update_conversation({A.group}, 'Mine now', NULL, NULL)$$, ARRAY['P0002'])
FROM unnest(ARRAY['A.admin', 'B.manager', 'A.hr_admin']) AS w;
SELECT sec_test.deny('anon', 'cannot change a group', $$SELECT update_conversation({A.group}, 'x', NULL, NULL)$$);
SELECT sec_test.deny('A.manager', 'cannot turn a direct chat into a group', $$SELECT update_conversation({A.conv}, NULL, ARRAY[{A.runner2}], NULL)$$, ARRAY['22023']);
SELECT sec_test.deny('A.runner', 'cannot add a deactivated account', $$SELECT update_conversation({A.group}, NULL, ARRAY[{A.inactive_manager}], NULL)$$, ARRAY['22023']);
SELECT sec_test.deny('A.runner', 'cannot add a made-up account', $$SELECT update_conversation({A.group}, NULL, ARRAY['00000000-0000-0000-0000-000000000000'::uuid], NULL)$$, ARRAY['22023']);
SELECT sec_test.deny('A.runner', 'cannot leave a group with one person',
    $$SELECT update_conversation({A.group}, NULL, NULL, ARRAY[{A.runner2}, {A.team_leader}, {A.manager}])$$, ARRAY['22023']);
SELECT sec_test.deny('A.runner', 'rejects an empty name', $$SELECT update_conversation({A.group}, '   ', NULL, NULL)$$, ARRAY['22023']);
SELECT sec_test.deny('A.runner', 'rejects an 81-character name', $$SELECT update_conversation({A.group}, repeat('x', 81), NULL, NULL)$$, ARRAY['22023']);

SELECT sec_test.finish();
ROLLBACK;
