-- =============================================================================
-- Fotos de QC por huerto (migración 20261027020000_qc_photos_by_orchard)
-- Rutas <orchard_id>/<día>/<inspección>.webp. QC y manager solo ven, suben y
-- borran (lo suyo) en la carpeta de su huerto; admin, en cualquiera. Desde
-- 20261027040000 RRHH ve todas, QC solo las que subió y el team leader las de
-- inspecciones de su equipo (99_team_scope_leave_qc_rows.sql).
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- Foto del inspector de B en la carpeta de B ({A.qc_photo} ya está en la de A)
DO $$
DECLARE v_id uuid;
BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
    VALUES ('qc-photos', sec_test.id_of('B')::text || '/sectest/' || gen_random_uuid() || '.webp',
            sec_test.id_of('B.qc_inspector'), sec_test.id_of('B.qc_inspector')::text)
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('B.qc_photo', v_id);
END $$;

-- ── Ver (y firmar enlaces) ──────────────────────────────────────────────────
SELECT sec_test.sees(w, 'sees own orchard''s QC photo', $$SELECT 1 FROM storage.objects WHERE id = {A.qc_photo}$$, 1)
FROM unnest(ARRAY['A.qc_inspector', 'A.manager', 'A.admin']) AS w;
SELECT sec_test.sees(w, 'cannot see another orchard''s QC photo', $$SELECT 1 FROM storage.objects WHERE id = {B.qc_photo}$$, 0)
FROM unnest(ARRAY['A.qc_inspector', 'A.manager']) AS w;
SELECT sec_test.sees(w, 'cannot see another orchard''s QC photo', $$SELECT 1 FROM storage.objects WHERE id = {A.qc_photo}$$, 0)
FROM unnest(ARRAY['B.qc_inspector', 'B.manager']) AS w;
SELECT sec_test.sees(w, 'sees QC photos of any orchard',
    $$SELECT 1 FROM storage.objects WHERE id IN ({A.qc_photo}, {B.qc_photo})$$, 2)
FROM unnest(ARRAY['A.admin', 'A.hr_admin']) AS w;
SELECT sec_test.sees(w, 'cannot see QC photos', $$SELECT 1 FROM storage.objects WHERE id IN ({A.qc_photo}, {B.qc_photo})$$, 0)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'A.logistics', 'A.payroll_admin']) AS w;

-- ── Subir ───────────────────────────────────────────────────────────────────
SELECT sec_test.allow(w, 'uploads a QC photo to own orchard''s folder',
    $$INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
      VALUES ('qc-photos', {A}::text || '/2026-10-27/sectest-up.webp', auth.uid(), auth.uid()::text)$$)
FROM unnest(ARRAY['A.qc_inspector', 'A.manager']) AS w;
SELECT sec_test.deny(w, 'cannot upload a QC photo to another orchard''s folder',
    $$INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
      VALUES ('qc-photos', {B}::text || '/2026-10-27/sectest-up.webp', auth.uid(), auth.uid()::text)$$)
FROM unnest(ARRAY['A.qc_inspector', 'A.manager']) AS w;
SELECT sec_test.deny(w, 'cannot upload a QC photo outside an orchard folder',
    $$INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
      VALUES ('qc-photos', 'sectest/loose.webp', auth.uid(), auth.uid()::text)$$)
FROM unnest(ARRAY['A.qc_inspector', 'A.manager']) AS w;
SELECT sec_test.allow('A.admin', 'admin uploads a QC photo to any orchard''s folder',
    $$INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
      VALUES ('qc-photos', {B}::text || '/2026-10-27/sectest-admin.webp', auth.uid(), auth.uid()::text)$$);
SELECT sec_test.deny(w, 'deactivated or without 2FA cannot upload QC photos',
    $$INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
      VALUES ('qc-photos', {A}::text || '/2026-10-27/sectest-x.webp', auth.uid(), auth.uid()::text)$$)
FROM unnest(ARRAY['A.inactive_manager', 'A.manager@aal1']) AS w;

-- ── Borrar: quien subió, en su huerto ───────────────────────────────────────
SELECT sec_test.allow('B.qc_inspector', 'deletes own QC photo in own orchard', $$DELETE FROM storage.objects WHERE id = {B.qc_photo}$$);
SELECT sec_test.deny(w, 'cannot delete another orchard''s QC photo', $$DELETE FROM storage.objects WHERE id = {B.qc_photo}$$)
FROM unnest(ARRAY['A.qc_inspector', 'A.manager', 'B.manager']) AS w;

SELECT sec_test.finish();
ROLLBACK;
