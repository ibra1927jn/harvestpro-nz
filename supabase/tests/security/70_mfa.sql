-- =============================================================================
-- 2FA en el servidor (migración 20261014000000_server_side_mfa)
-- Una cuenta privilegiada (admin, manager, payroll_admin, hr_admin) con sesión
-- de solo contraseña (aal1) no ve ni toca datos; con aal2 sí. Las cuentas no
-- privilegiadas no necesitan 2FA. Con security_settings.enforce_mfa = false
-- (PC de desarrollo) aal1 vuelve a valer.
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- ── Con 2FA exigido (por defecto) ───────────────────────────────────────────
SELECT sec_test.record(
    (SELECT column_default FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'security_settings' AND column_name = 'enforce_mfa') = 'true',
    'settings: enforce_mfa defaults to ON', 'default is not true');
-- Este archivo prueba con 2FA exigido aunque la BD local lo tenga apagado (ROLLBACK)
UPDATE public.security_settings SET enforce_mfa = true;

-- Privilegiados sin 2FA: nada de datos
SELECT sec_test.sees(w, 'aal1: sees no attendance', $$SELECT 1 FROM daily_attendance$$, 0)
FROM unnest(ARRAY['A.manager@aal1', 'A.admin@aal1', 'A.payroll_admin@aal1', 'A.hr_admin@aal1']) AS w;
SELECT sec_test.sees(w, 'aal1: sees no buckets', $$SELECT 1 FROM bucket_records$$, 0)
FROM unnest(ARRAY['A.manager@aal1', 'A.admin@aal1', 'A.payroll_admin@aal1', 'A.hr_admin@aal1']) AS w;
SELECT sec_test.sees(w, 'aal1: sees no people', $$SELECT 1 FROM pickers$$, 0)
FROM unnest(ARRAY['A.manager@aal1', 'A.admin@aal1', 'A.payroll_admin@aal1', 'A.hr_admin@aal1']) AS w;
SELECT sec_test.sees(w, 'aal1: sees no contracts or HR documents',
    $$SELECT 1 FROM contracts UNION ALL SELECT 1 FROM hr_documents$$, 0)
FROM unnest(ARRAY['A.manager@aal1', 'A.admin@aal1', 'A.hr_admin@aal1']) AS w;
SELECT sec_test.sees('A.payroll_admin@aal1', 'aal1: sees no pay weeks', $$SELECT 1 FROM pay_weeks$$, 0);
SELECT sec_test.sees('A.manager@aal1', 'aal1: does not see own private chat',
    $$SELECT 1 FROM chat_messages WHERE id = {A.chat}$$, 0);
SELECT sec_test.sees('A.manager@aal1', 'aal1: no unread counts', $$SELECT * FROM my_unread_counts()$$, 0);
SELECT sec_test.sees('A.manager@aal1', 'aal1: sees no other user', $$SELECT 1 FROM users WHERE id <> auth.uid()$$, 0);
SELECT sec_test.sees('A.manager@aal1', 'aal1: sees no stored files', $$SELECT 1 FROM storage.objects WHERE id = {A.qc_photo}$$, 0);
SELECT sec_test.returns(w, 'aal1: get_auth_role() is empty', $$SELECT get_auth_role()$$, '<null>')
FROM unnest(ARRAY['A.manager@aal1', 'A.admin@aal1', 'A.payroll_admin@aal1', 'A.hr_admin@aal1']) AS w;
SELECT sec_test.returns('A.admin@aal1', 'aal1: is_role(admin) is false', $$SELECT is_role(ARRAY['admin'])::text$$, 'false');
SELECT sec_test.returns('A.payroll_admin@aal1', 'aal1: can_read_company_payroll() is false',
    $$SELECT can_read_company_payroll()::text$$, 'false');

SELECT sec_test.deny('A.manager@aal1', 'aal1: cannot correct attendance',
    $$UPDATE daily_attendance SET notes = 'x' WHERE id = {A.att}$$);
SELECT sec_test.deny('A.manager@aal1', 'aal1: cannot record a bucket',
    $$INSERT INTO bucket_records (orchard_id, picker_id, scanned_by, scanned_at) VALUES ({A}, {A.picker}, {A.manager}, now())$$);
SELECT sec_test.deny('A.hr_admin@aal1', 'aal1: cannot invite staff',
    $$INSERT INTO allowed_registrations (email, assigned_role, orchard_id) VALUES ('sectest.aal1@example.test', 'runner', {A})$$);
SELECT sec_test.deny('A.hr_admin@aal1', 'aal1: cannot deactivate staff',
    $$UPDATE users SET is_active = false WHERE id = {A.runner}$$);
SELECT sec_test.deny('A.admin@aal1', 'aal1: cannot change own role',
    $$UPDATE users SET role = 'runner' WHERE id = auth.uid()$$);
SELECT sec_test.deny('A.admin@aal1', 'aal1: cannot change an orchard',
    $$UPDATE orchards SET name = name WHERE id = {A}$$);
SELECT sec_test.deny('A.manager@aal1', 'aal1: cannot mark a chat read',
    $$SELECT mark_conversation_read({A.conv})$$);
SELECT sec_test.deny('A.manager@aal1', 'aal1: cannot unlock accounts',
    $$SELECT unlock_account('sectest.locked@example.test')$$);

-- Lo que la app necesita para mostrar la pantalla de 2FA
SELECT sec_test.sees(w, 'aal1: reads own profile row', $$SELECT 1 FROM users WHERE id = auth.uid()$$, 1)
FROM unnest(ARRAY['A.manager@aal1', 'A.admin@aal1', 'A.payroll_admin@aal1', 'A.hr_admin@aal1']) AS w;
SELECT sec_test.allow('A.manager@aal1', 'aal1: saves own privacy consent',
    $$UPDATE users SET privacy_consent_at = now() WHERE id = auth.uid()$$);
SELECT sec_test.allow('A.manager@aal1', 'aal1: reads the orchard list (name in the header)',
    $$SELECT 1 FROM orchards WHERE id = {A}$$);

-- Con 2FA: acceso normal
SELECT sec_test.sees('A.manager', 'aal2: manager sees attendance of own orchard',
    $$SELECT 1 FROM daily_attendance WHERE id = {A.att}$$, 1);
SELECT sec_test.allow('A.manager', 'aal2: manager corrects attendance',
    $$UPDATE daily_attendance SET notes = 'x' WHERE id = {A.att}$$);
SELECT sec_test.sees('A.payroll_admin', 'aal2: payroll sees pay weeks', $$SELECT 1 FROM pay_weeks WHERE id = {payweek}$$, 1);
SELECT sec_test.returns('A.admin', 'aal2: get_auth_role() = admin', $$SELECT get_auth_role()$$, 'admin');

-- Roles de campo: no necesitan 2FA (aal1 = igual que siempre)
SELECT sec_test.sees('A.team_leader@aal1', 'aal1 team leader: sees attendance of own orchard',
    $$SELECT 1 FROM daily_attendance WHERE id = {A.att}$$, 1);
SELECT sec_test.allow('A.team_leader@aal1', 'aal1 team leader: checks out own team',
    $$UPDATE daily_attendance SET check_out = now() WHERE id = {A.att}$$);
SELECT sec_test.allow('A.runner@aal1', 'aal1 runner: records a bucket',
    $$INSERT INTO bucket_records (orchard_id, picker_id, scanned_by, scanned_at) VALUES ({A}, {A.picker}, {A.runner}, now())$$);
SELECT sec_test.returns('A.qc_inspector@aal1', 'aal1 QC: role still counts', $$SELECT get_auth_role()$$, 'qc_inspector');

-- El ajuste no se lee ni se cambia por la API (ni siquiera admin con 2FA)
SELECT sec_test.sees(w, 'cannot read security settings', $$SELECT 1 FROM security_settings$$, 0)
FROM unnest(ARRAY['anon', 'A.admin', 'A.manager', 'A.runner']) AS w;
SELECT sec_test.deny(w, 'cannot turn 2FA enforcement off',
    $$UPDATE security_settings SET enforce_mfa = false$$)
FROM unnest(ARRAY['anon', 'A.admin', 'A.admin@aal1', 'A.manager']) AS w;
SELECT sec_test.deny('A.admin', 'cannot delete the security settings row', $$DELETE FROM security_settings$$);

-- ── PC de desarrollo: 2FA desactivado por SQL ───────────────────────────────
UPDATE public.security_settings SET enforce_mfa = false;
SELECT sec_test.sees('A.manager@aal1', 'enforcement off: aal1 manager sees attendance',
    $$SELECT 1 FROM daily_attendance WHERE id = {A.att}$$, 1);
SELECT sec_test.allow('A.manager@aal1', 'enforcement off: aal1 manager corrects attendance',
    $$UPDATE daily_attendance SET notes = 'x' WHERE id = {A.att}$$);
SELECT sec_test.returns('A.payroll_admin@aal1', 'enforcement off: aal1 payroll reads company payroll',
    $$SELECT can_read_company_payroll()::text$$, 'true');

-- Sin la fila de ajustes: se exige (nunca se abre por un borrado)
DELETE FROM public.security_settings;
SELECT sec_test.sees('A.manager@aal1', 'settings row missing: enforcement stays ON',
    $$SELECT 1 FROM daily_attendance$$, 0);

SELECT sec_test.finish();
ROLLBACK;
