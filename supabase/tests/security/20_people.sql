-- =============================================================================
-- Personas: cuentas (users), plantilla de campo (pickers), invitaciones,
-- documentos de RRHH (tabla y almacén hr-documents).
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- ── users: escalada de privilegios ──────────────────────────────────────────
SELECT sec_test.sees('anon', 'cannot read user accounts', $$SELECT 1 FROM users$$, 0);
SELECT sec_test.sees('B.runner', 'cannot read accounts of another orchard', $$SELECT 1 FROM users WHERE id = {A.manager}$$, 0);
SELECT sec_test.allow('A.runner', 'updates own name', $$UPDATE users SET full_name = 'Renamed' WHERE id = auth.uid()$$);
SELECT sec_test.deny(w, 'cannot make self admin', $$UPDATE users SET role = 'admin' WHERE id = auth.uid()$$)
FROM unnest(ARRAY['A.runner', 'A.team_leader', 'A.manager', 'A.hr_admin', 'A.payroll_admin']) AS w;
SELECT sec_test.deny('A.inactive_manager', 'cannot reactivate self', $$UPDATE users SET is_active = true WHERE id = auth.uid()$$);
SELECT sec_test.deny('A.runner', 'cannot edit another user', $$UPDATE users SET full_name = 'Hacked' WHERE id = {A.runner2}$$);
SELECT sec_test.deny('A.manager', 'cannot change someone''s role', $$UPDATE users SET role = 'admin' WHERE id = {A.runner}$$);
SELECT sec_test.deny('A.manager', 'cannot deactivate a runner (team leader / HR do it)', $$UPDATE users SET is_active = false WHERE id = {A.runner}$$);
SELECT sec_test.allow('A.hr_admin', 'deactivates a runner', $$UPDATE users SET is_active = false WHERE id = {A.runner}$$);
SELECT sec_test.allow('A.admin', 'changes a role', $$UPDATE users SET role = 'team_leader' WHERE id = {A.runner}$$);
SELECT sec_test.deny('A.runner', 'cannot create another account',
    $$INSERT INTO users (id, email, role, orchard_id) VALUES ({B.runner}, 'x@example.test', 'admin', {A})$$, ARRAY['42501', '23505']);

-- ── pickers: regla del dueño (el manager no da de alta/baja ni mueve gente) ─
SELECT sec_test.sees('anon', 'cannot read pickers', $$SELECT 1 FROM pickers$$, 0);
SELECT sec_test.allow(w, 'adds a picker',
    $$INSERT INTO pickers (picker_id, name, orchard_id, team_leader_id) VALUES ('SECTEST-NEW', 'New', {A}, {A.team_leader})$$)
FROM unnest(ARRAY['A.team_leader', 'A.hr_admin']) AS w;
SELECT sec_test.deny(w, 'cannot add pickers',
    $$INSERT INTO pickers (picker_id, name, orchard_id, team_leader_id) VALUES ('SECTEST-NEW', 'New', {A}, {A.team_leader})$$)
FROM unnest(ARRAY['anon', 'A.manager', 'A.runner', 'A.qc_inspector', 'A.logistics', 'A.payroll_admin']) AS w;
SELECT sec_test.allow('A.team_leader', 'archives a picker', $$UPDATE pickers SET status = 'archived', archived_at = now() WHERE id = {A.picker}$$);
SELECT sec_test.deny('A.manager', 'cannot archive a picker', $$UPDATE pickers SET status = 'archived', archived_at = now() WHERE id = {A.picker}$$);
SELECT sec_test.deny('A.manager', 'cannot move a picker to another team', $$UPDATE pickers SET team_leader_id = {A.team_leader2} WHERE id = {A.picker}$$);
SELECT sec_test.deny('A.manager', 'cannot delete a picker', $$DELETE FROM pickers WHERE id = {A.picker}$$);
SELECT sec_test.deny(w, 'cannot edit pickers', $$UPDATE pickers SET name = 'Hacked' WHERE id = {A.picker}$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.qc_inspector', 'A.logistics', 'A.payroll_admin']) AS w;
SELECT sec_test.allow('A.manager', 'assigns a picker to a row', $$UPDATE pickers SET current_row = 3 WHERE id = {A.picker}$$);

-- ── allowed_registrations (invitaciones: deciden el rol de la cuenta nueva) ─
SELECT sec_test.sees('anon', 'cannot list invitations', $$SELECT 1 FROM allowed_registrations$$, 0);
SELECT sec_test.sees('A.runner', 'cannot list other people''s invitations', $$SELECT 1 FROM allowed_registrations WHERE id = {A.invite}$$, 0);
SELECT sec_test.allow('A.manager', 'invites a runner to own orchard',
    $$INSERT INTO allowed_registrations (email, assigned_role, orchard_id) VALUES ('sectest.new1@example.test', 'runner', {A})$$);
SELECT sec_test.deny('A.manager', 'cannot invite an admin (privilege escalation)',
    $$INSERT INTO allowed_registrations (email, assigned_role, orchard_id) VALUES ('sectest.new2@example.test', 'admin', {A})$$);
SELECT sec_test.deny('A.manager', 'cannot invite a payroll admin',
    $$INSERT INTO allowed_registrations (email, assigned_role, orchard_id) VALUES ('sectest.new3@example.test', 'payroll_admin', {A})$$);
SELECT sec_test.deny('A.manager', 'cannot turn an invitation into admin', $$UPDATE allowed_registrations SET assigned_role = 'admin' WHERE id = {A.invite}$$);
SELECT sec_test.allow('A.hr_admin', 'invites a payroll admin',
    $$INSERT INTO allowed_registrations (email, assigned_role, orchard_id) VALUES ('sectest.new4@example.test', 'payroll_admin', {A})$$);
SELECT sec_test.deny('A.hr_admin', 'cannot invite an admin',
    $$INSERT INTO allowed_registrations (email, assigned_role, orchard_id) VALUES ('sectest.new5@example.test', 'admin', {A})$$);
SELECT sec_test.allow('A.admin', 'invites an admin',
    $$INSERT INTO allowed_registrations (email, assigned_role, orchard_id) VALUES ('sectest.new6@example.test', 'admin', {A})$$);
SELECT sec_test.deny(w, 'cannot create invitations',
    $$INSERT INTO allowed_registrations (email, assigned_role, orchard_id) VALUES ('sectest.new7@example.test', 'runner', {A})$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'A.qc_inspector', 'A.logistics', 'A.payroll_admin']) AS w;
-- El alta comprueba un email sin sesión (función, devuelve solo esa invitación)
SELECT sec_test.sees('anon', 'checks one invitation by email', $$SELECT * FROM check_registration('sectest.invite-a@example.test')$$, 1);

-- ── hr_documents (visados, pasaportes, contratos firmados) ──────────────────
SELECT sec_test.sees('A.runner', 'reads own HR document record', $$SELECT 1 FROM hr_documents WHERE id = {A.hrdoc}$$, 1);
SELECT sec_test.sees(w, 'cannot read someone else''s HR documents', $$SELECT 1 FROM hr_documents WHERE id = {A.hrdoc}$$, 0)
FROM unnest(ARRAY['anon', 'A.runner2', 'A.team_leader', 'A.qc_inspector', 'A.logistics', 'A.payroll_admin', 'B.runner']) AS w;
SELECT sec_test.sees(w, 'reads HR documents', $$SELECT 1 FROM hr_documents WHERE id = {A.hrdoc}$$, 1)
FROM unnest(ARRAY['A.hr_admin', 'A.admin']) AS w;
SELECT sec_test.deny(w, 'cannot change HR document records', $$UPDATE hr_documents SET title = 'x' WHERE id = {A.hrdoc}$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'A.payroll_admin']) AS w;
SELECT sec_test.deny('A.runner', 'cannot upload HR document records',
    $$INSERT INTO hr_documents (orchard_id, user_id, document_type, title, storage_path) VALUES ({A}, auth.uid(), 'other', 'x', 'x')$$);

-- Almacén hr-documents (archivos)
SELECT sec_test.sees(w, 'cannot list HR document files', $$SELECT 1 FROM storage.objects WHERE bucket_id = 'hr-documents'$$, 0)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'A.payroll_admin']) AS w;
SELECT sec_test.deny(w, 'cannot upload HR document files',
    $$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('hr-documents', 'sectest/evil.pdf', auth.uid())$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'A.payroll_admin']) AS w;
SELECT sec_test.allow('A.hr_admin', 'uploads an HR document file',
    $$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('hr-documents', 'sectest/ok.pdf', auth.uid())$$);

SELECT sec_test.finish();
ROLLBACK;
