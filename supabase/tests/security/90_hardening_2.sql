-- =============================================================================
-- Endurecimiento 2 (migración 20261018000000_security_hardening_2)
--   · Nadie puede insertar intentos de acceso ni bloquear cuentas ajenas
--   · Documentos de RRHH: el manager ve la lista, no los ficheros
--   · Fotos de QC: privadas (QC, manager y admin)
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- ── Bloqueo de cuentas ──────────────────────────────────────────────────────
-- login_attempts y account_locks ya no existen (20261024030000); el trigger tampoco
SELECT sec_test.record(
    NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_lock_account'),
    'login_attempts: the lock trigger is gone', 'trigger still exists');

-- ── Documentos de RRHH ──────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('hr-documents', 'hr-documents', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
SELECT 'hr-documents', 'A/sectest-passport.pdf', id, id::text FROM sec_test.who WHERE key = 'A.hr_admin';

SELECT sec_test.sees('A.manager', 'still sees the HR document list (visa expiry alerts)', $$SELECT 1 FROM hr_documents WHERE id = {A.hrdoc}$$, 1);
SELECT sec_test.sees('A.manager', 'cannot open HR document files', $$SELECT 1 FROM storage.objects WHERE bucket_id = 'hr-documents'$$, 0);
SELECT sec_test.deny('A.manager', 'cannot upload HR document files',
    $$INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES ('hr-documents', 'A/x.pdf', auth.uid(), auth.uid()::text)$$);
SELECT sec_test.deny('A.manager', 'cannot delete HR document files', $$DELETE FROM storage.objects WHERE bucket_id = 'hr-documents'$$);
SELECT sec_test.deny('A.manager', 'cannot edit HR document records', $$UPDATE hr_documents SET title = 'x' WHERE id = {A.hrdoc}$$);
SELECT sec_test.deny('A.manager', 'cannot add HR document records',
    $$INSERT INTO hr_documents (orchard_id, user_id, document_type, title, storage_path, uploaded_by) VALUES ({A}, {A.runner}, 'other', 'x', 'A/x.pdf', auth.uid())$$);
SELECT sec_test.sees(w, 'opens HR document files', $$SELECT 1 FROM storage.objects WHERE bucket_id = 'hr-documents'$$, 1)
FROM unnest(ARRAY['A.hr_admin', 'A.admin']) AS w;
SELECT sec_test.allow('A.hr_admin', 'uploads HR document files',
    $$INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES ('hr-documents', 'A/new.pdf', auth.uid(), auth.uid()::text)$$);
SELECT sec_test.sees(w, 'cannot see the HR document list', $$SELECT 1 FROM hr_documents WHERE id = {A.hrdoc}$$, 0)
FROM unnest(ARRAY['anon', 'A.team_leader', 'A.qc_inspector', 'A.logistics', 'A.payroll_admin']) AS w;

-- ── Fotos de QC ─────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('qc-photos', 'qc-photos', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
SELECT 'qc-photos', 'A/sectest-photo.webp', id, id::text FROM sec_test.who WHERE key = 'A.qc_inspector';

SELECT sec_test.record((SELECT NOT public FROM storage.buckets WHERE id = 'qc-photos'), 'qc-photos bucket is private', 'bucket is public');
SELECT sec_test.sees(w, 'sees QC photos', $$SELECT 1 FROM storage.objects WHERE bucket_id = 'qc-photos' AND name = 'A/sectest-photo.webp'$$, 1)
FROM unnest(ARRAY['A.qc_inspector', 'A.manager', 'A.admin']) AS w;
SELECT sec_test.sees(w, 'cannot see QC photos', $$SELECT 1 FROM storage.objects WHERE bucket_id = 'qc-photos'$$, 0)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'A.payroll_admin']) AS w;

SELECT sec_test.finish();
ROLLBACK;
