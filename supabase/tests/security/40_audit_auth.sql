-- =============================================================================
-- Auditoría, bloqueo de cuentas, intentos de acceso y funciones de servidor.
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- ── audit_logs ──────────────────────────────────────────────────────────────
SELECT sec_test.sees(w, 'cannot read the audit log', $$SELECT 1 FROM audit_logs WHERE id = {A.audit}$$, 0)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'A.qc_inspector', 'A.logistics', 'A.inactive_manager']) AS w;
SELECT sec_test.sees(w, 'reads the audit log', $$SELECT 1 FROM audit_logs WHERE id = {A.audit}$$, 1)
FROM unnest(ARRAY['A.manager', 'A.admin']) AS w;
SELECT sec_test.deny('anon', 'cannot write audit entries',
    $$INSERT INTO audit_logs (action, table_name, new_values) VALUES ('CUSTOM', 'sectest', '{}')$$);
SELECT sec_test.deny('A.runner', 'cannot write an audit entry in someone else''s name',
    $$INSERT INTO audit_logs (user_id, action, table_name, new_values) VALUES ({A.manager}, 'CUSTOM', 'sectest', '{"event":"timesheet_approved"}')$$);
SELECT sec_test.deny('A.runner', 'cannot write an anonymous audit entry',
    $$INSERT INTO audit_logs (user_id, action, table_name) VALUES (NULL, 'CUSTOM', 'sectest')$$);
-- Lo que hacen submit-audit-log y writeAudit (con la sesión del usuario)
SELECT sec_test.allow('A.runner', 'writes own audit entry',
    $$INSERT INTO audit_logs (user_id, action, table_name, new_values) VALUES (auth.uid(), 'CUSTOM', 'sectest', '{}')$$);
SELECT sec_test.returns('A.manager', 'cannot backdate an audit entry',
    $$INSERT INTO audit_logs (user_id, action, table_name, created_at) VALUES (auth.uid(), 'CUSTOM', 'sectest', '2000-01-01')
      RETURNING (created_at > now() - interval '1 minute')::text$$, 'true');
SELECT sec_test.deny(w, 'cannot alter the audit log', $$UPDATE audit_logs SET new_values = '{}' WHERE id = {A.audit}$$)
FROM unnest(ARRAY['A.manager', 'A.admin']) AS w;
SELECT sec_test.deny(w, 'cannot delete from the audit log', $$DELETE FROM audit_logs WHERE id = {A.audit}$$)
FROM unnest(ARRAY['A.manager', 'A.admin']) AS w;
SELECT sec_test.deny(w, 'cannot call get_record_audit_trail()', $$SELECT * FROM get_record_audit_trail('sectest', {A})$$)
FROM unnest(ARRAY['anon', 'A.runner']) AS w;
SELECT sec_test.deny(w, 'cannot purge old audit logs', $$SELECT cleanup_old_audit_logs()$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.manager']) AS w;

-- ── account_locks / login_attempts ──────────────────────────────────────────
SELECT sec_test.deny(w, 'cannot lock someone''s account',
    $$INSERT INTO account_locks (email, locked_until, locked_by_system) VALUES ('manager@harvestpro.nz', now() + interval '1 day', true)$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader']) AS w;
SELECT sec_test.sees(w, 'cannot read account locks', $$SELECT 1 FROM account_locks WHERE email = 'sectest.locked@example.test'$$, 0)
FROM unnest(ARRAY['anon', 'A.runner']) AS w;
SELECT sec_test.sees('A.manager', 'reads account locks', $$SELECT 1 FROM account_locks WHERE email = 'sectest.locked@example.test'$$, 1);
SELECT sec_test.sees(w, 'cannot read login attempts', $$SELECT 1 FROM login_attempts$$, 0)
FROM unnest(ARRAY['anon', 'A.runner']) AS w;
-- Antes de iniciar sesión la app registra el intento y mira si la cuenta está bloqueada
SELECT sec_test.allow('anon', 'logs a login attempt', $$INSERT INTO login_attempts (email, success) VALUES ('someone@example.test', true)$$);
SELECT sec_test.returns('anon', 'checks whether an account is locked', $$SELECT is_account_locked('sectest.locked@example.test')::text$$, 'true');
SELECT sec_test.deny(w, 'cannot unlock accounts', $$SELECT unlock_account('sectest.locked@example.test', 'x')$$)
FROM unnest(ARRAY['anon', 'A.runner']) AS w;
SELECT sec_test.returns('A.manager', 'unlocks an account', $$SELECT unlock_account('sectest.locked@example.test', 'sectest')::text$$, 'true');
SELECT sec_test.deny(w, 'cannot purge security tables', $$SELECT cleanup_old_login_attempts()$$)
FROM unnest(ARRAY['anon', 'A.runner']) AS w;
SELECT sec_test.deny(w, 'cannot purge security tables', $$SELECT cleanup_old_account_locks()$$)
FROM unnest(ARRAY['anon', 'A.runner']) AS w;
SELECT sec_test.deny(w, 'cannot read server health / row counts', $$SELECT health_check()$$)
FROM unnest(ARRAY['anon', 'A.runner']) AS w;

-- ── Funciones de usuario: sin sesión no hacen nada ──────────────────────────
SELECT sec_test.deny('anon', 'cannot call setup_orchard_atomic()', $$SELECT setup_orchard_atomic('X', 'X')$$);
SELECT sec_test.deny('A.manager', 'cannot create orchards', $$SELECT setup_orchard_atomic('SECTEST-X', 'X')$$);
SELECT sec_test.allow('A.admin', 'creates an orchard', $$SELECT setup_orchard_atomic('SECTEST-X', 'X')$$);
SELECT sec_test.deny('anon', 'cannot read unread counts', $$SELECT * FROM my_unread_counts()$$);

-- ── Cuenta dada de baja: pierde los permisos de su rol ──────────────────────
SELECT sec_test.deny('A.inactive_manager', 'cannot correct buckets', $$UPDATE bucket_records SET quality_grade = 'C' WHERE id = {A.bucket}$$);
SELECT sec_test.sees('A.inactive_manager', 'cannot read company payroll data', $$SELECT 1 FROM daily_attendance WHERE id = {B.att}$$, 0);

SELECT sec_test.finish();
ROLLBACK;
