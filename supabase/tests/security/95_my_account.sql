-- =============================================================================
-- «Mi cuenta» (migración 20261022050000_my_account)
--   · update_my_profile(): solo con sesión y cuenta activa; valida nombre,
--     teléfono, idioma y que la foto esté en la carpeta propia del almacén
--   · Almacén privado "avatars": cada uno sube / borra en <auth.uid()>/…;
--     cualquier cuenta con sesión lee (fotos en los cajones de perfil)
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- Lo que queda DESPUÉS de la llamada se lee en una función plpgsql (cada
-- sentencia ve el estado nuevo); en un SELECT suelto la subconsulta vería el
-- estado anterior a la función.
CREATE FUNCTION sec_test.my_account_after(p_name text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
    PERFORM public.update_my_profile(p_name, NULL, NULL, NULL);
    RETURN (SELECT full_name || '|' || role || '|' || orchard_id::text || '|' || is_active::text
            FROM public.users WHERE id = auth.uid())
        || '|' || COALESCE((SELECT name FROM public.pickers WHERE id = auth.uid()), '-')
        || '|' || (SELECT count(*) FROM public.users WHERE full_name = p_name)::text;
END $$;

-- ── update_my_profile ───────────────────────────────────────────────────────
SELECT sec_test.deny('anon', 'cannot call update_my_profile', $$SELECT update_my_profile('Anon', NULL, NULL, NULL)$$);

SELECT sec_test.returns(w, 'changes own display name, phone and locale',
    $$SELECT (update_my_profile('SecTest Renamed', ' 021 555 123 ', 'es', NULL))->>'full_name'$$, 'SecTest Renamed')
FROM unnest(ARRAY['A.runner', 'A.team_leader', 'A.qc_inspector', 'A.hr_admin', 'B.logistics']) AS w;
SELECT sec_test.returns('A.runner', 'trims the phone', $$SELECT (update_my_profile(NULL, ' 021 555 123 ', NULL, NULL))->>'phone'$$, '021 555 123');
SELECT sec_test.returns('A.runner', 'empty string clears the phone',
    $$SELECT COALESCE((update_my_profile(NULL, '', NULL, NULL))->>'phone', '<null>')$$, '<null>');
SELECT sec_test.returns('A.runner', 'NULL keeps the current name',
    $$SELECT (update_my_profile(NULL, NULL, 'mi', NULL))->>'full_name' = (SELECT full_name FROM users WHERE id = auth.uid())$$, 'true');
SELECT sec_test.returns('A.runner', 'stores the locale', $$SELECT (update_my_profile(NULL, NULL, 'mi', NULL))->>'preferred_locale'$$, 'mi');

-- Solo la fila propia; rol, huerto y alta intactos; el nombre llega a la lista de personas
-- (trigger sync_person_from_user de 20261012010000: pickers.id = users.id para TL y runners)
SELECT sec_test.returns('A.runner', 'renames only itself and keeps role, orchard and active status',
    $$SELECT sec_test.my_account_after('SecTest Renamed')$$,
    'SecTest Renamed|runner|e1337e6a-54cc-431c-9c00-980e8ea270a4|true|SecTest Renamed|1');
SELECT sec_test.returns('A.team_leader', 'display name change reaches the pickers list',
    $$SELECT split_part(sec_test.my_account_after('SecTest TL Renamed'), '|', 5)$$, 'SecTest TL Renamed');

-- Validación (mismos límites que el cliente)
SELECT sec_test.deny('A.runner', 'rejects a 1-character name', $$SELECT update_my_profile('A', NULL, NULL, NULL)$$, ARRAY['22023']);
SELECT sec_test.deny('A.runner', 'rejects an 81-character name', $$SELECT update_my_profile(repeat('x', 81), NULL, NULL, NULL)$$, ARRAY['22023']);
SELECT sec_test.deny('A.runner', 'rejects a 31-character phone', $$SELECT update_my_profile(NULL, repeat('1', 31), NULL, NULL)$$, ARRAY['22023']);
SELECT sec_test.deny('A.runner', 'rejects a malformed locale', $$SELECT update_my_profile(NULL, NULL, 'not a locale', NULL)$$, ARRAY['22023']);
SELECT sec_test.deny('A.runner', 'rejects a photo path outside the own folder',
    $$SELECT update_my_profile(NULL, NULL, NULL, '00000000-0000-0000-0000-000000000000/avatar-1.jpg')$$, ARRAY['22023']);
SELECT sec_test.deny('A.runner', 'rejects a photo path with traversal',
    $$SELECT update_my_profile(NULL, NULL, NULL, auth.uid()::text || '/../other/avatar-1.jpg')$$, ARRAY['22023']);
SELECT sec_test.returns('A.runner', 'accepts a photo path inside the own folder',
    $$SELECT (update_my_profile(NULL, NULL, NULL, auth.uid()::text || '/avatar-1.jpg'))->>'avatar_url' = auth.uid()::text || '/avatar-1.jpg'$$, 'true');
SELECT sec_test.returns('A.runner', 'empty string removes the photo',
    $$SELECT COALESCE((update_my_profile(NULL, NULL, NULL, ''))->>'avatar_url', '<null>')$$, '<null>');

-- Cuenta dada de baja: nada
SELECT sec_test.deny(w, 'cannot edit the profile once deactivated', $$SELECT update_my_profile('Back again', NULL, NULL, NULL)$$, ARRAY['P0002'])
FROM unnest(ARRAY['A.inactive_manager', 'A.inactive_hr_admin', 'A.inactive_admin']) AS w;

-- ── Almacén "avatars" ──────────────────────────────────────────────────────
SELECT sec_test.record(
    EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'avatars' AND public = false),
    'avatars: bucket exists and is private', 'missing or public');
SELECT sec_test.record(
    COALESCE((SELECT file_size_limit <= 2097152 AND allowed_mime_types @> ARRAY['image/jpeg'] AND NOT allowed_mime_types @> ARRAY['text/html']
              FROM storage.buckets WHERE id = 'avatars'), false),
    'avatars: 2 MB limit and image types only', 'limit or mime types differ');

-- Foto ya subida por el manager de A (como la subiría la app: <uid>/avatar-<ts>.jpg)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp']) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
SELECT 'avatars', id::text || '/avatar-seed.jpg', id, id::text FROM sec_test.who WHERE key = 'A.manager';

SELECT sec_test.allow(w, 'uploads a photo into the own folder',
    $$INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES ('avatars', auth.uid()::text || '/avatar-1.jpg', auth.uid(), auth.uid()::text)$$)
FROM unnest(ARRAY['A.runner', 'A.team_leader', 'A.qc_inspector', 'A.logistics', 'A.hr_admin', 'A.payroll_admin', 'A.manager', 'B.admin']) AS w;
SELECT sec_test.deny(w, 'cannot upload into someone else''s folder',
    $$INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES ('avatars', '00000000-0000-0000-0000-000000000000/avatar-1.jpg', auth.uid(), auth.uid()::text)$$)
FROM unnest(ARRAY['A.runner', 'A.manager', 'A.admin']) AS w;
SELECT sec_test.deny(w, 'cannot upload at the bucket root',
    $$INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES ('avatars', 'avatar-1.jpg', auth.uid(), auth.uid()::text)$$)
FROM unnest(ARRAY['A.runner', 'A.manager']) AS w;
SELECT sec_test.deny('anon', 'cannot upload photos',
    $$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('avatars', 'sectest/avatar-1.jpg', NULL)$$);

-- Lectura: cualquier cuenta con sesión (las fotos salen en cabeceras y cajones de perfil); anon nada
SELECT sec_test.sees(w, 'reads another account''s photo', $$SELECT 1 FROM storage.objects WHERE bucket_id = 'avatars'$$, 1)
FROM unnest(ARRAY['A.runner', 'A.team_leader', 'B.runner', 'A.manager']) AS w;
SELECT sec_test.sees('anon', 'sees no photos', $$SELECT 1 FROM storage.objects WHERE bucket_id = 'avatars'$$, 0);
SELECT sec_test.sees('A.manager@aal1', 'aal1: privileged role sees no photos without 2FA', $$SELECT 1 FROM storage.objects WHERE bucket_id = 'avatars'$$, 0);

-- Borrar / sustituir: solo lo propio
SELECT sec_test.allow('A.manager', 'deletes own photo', $$DELETE FROM storage.objects WHERE bucket_id = 'avatars' AND name LIKE '%/avatar-seed.jpg'$$);
SELECT sec_test.deny(w, 'cannot delete someone else''s photo', $$DELETE FROM storage.objects WHERE bucket_id = 'avatars' AND name LIKE '%/avatar-seed.jpg'$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.admin', 'A.hr_admin', 'B.manager']) AS w;
SELECT sec_test.deny(w, 'cannot move someone else''s photo', $$UPDATE storage.objects SET name = auth.uid()::text || '/stolen.jpg' WHERE bucket_id = 'avatars' AND name LIKE '%/avatar-seed.jpg'$$)
FROM unnest(ARRAY['A.runner', 'A.admin']) AS w;

SELECT sec_test.finish();
ROLLBACK;
