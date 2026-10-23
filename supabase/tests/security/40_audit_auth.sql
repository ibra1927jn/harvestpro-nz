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

-- ── Tablas muertas borradas (20261024030000_drop_dead_tables) ───────────────
-- El bloqueo por intentos de la app se quitó en 20261018000000; sus tablas y
-- funciones ya no existen (GoTrue limita los intentos de acceso por su cuenta).
SELECT sec_test.record(to_regclass('public.' || t) IS NULL,
    'dead table/view ' || t || ' is gone', 'still exists')
FROM unnest(ARRAY['messages', 'quality_inspections', 'wage_rates', 'sync_conflicts', 'login_attempts',
                  'account_locks', 'pickers_performance_today']) AS t;
SELECT sec_test.record(NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = f),
    'account-lock function ' || f || '() is gone', 'still exists')
FROM unnest(ARRAY['is_account_locked', 'get_failed_login_count', 'check_rate_limit', 'unlock_account',
                  'cleanup_old_login_attempts', 'cleanup_old_account_locks', 'lock_account_on_failures']) AS f;
SELECT sec_test.record((SELECT health_check() ->> 'status') = 'healthy',
    'health_check() still works without the dropped tables', 'unhealthy');
SELECT sec_test.deny(w, 'cannot read server health / row counts', $$SELECT health_check()$$)
FROM unnest(ARRAY['anon', 'A.runner']) AS w;

-- ── Funciones de usuario: sin sesión no hacen nada ──────────────────────────
SELECT sec_test.deny('anon', 'cannot call setup_orchard_atomic()', $$SELECT setup_orchard_atomic('X', 'X')$$);
SELECT sec_test.deny('A.manager', 'cannot create orchards', $$SELECT setup_orchard_atomic('SECTEST-X', 'X')$$);
-- El salario mínimo lo manda el cliente (minWageFloorOn): sin él no se crea (20261024011000)
SELECT sec_test.allow('A.admin', 'creates an orchard', $$SELECT setup_orchard_atomic('SECTEST-X', 'X', NULL, 0, '07:00', 6.5, NULL, 23.95)$$);
SELECT sec_test.deny('anon', 'cannot read unread counts', $$SELECT * FROM my_unread_counts()$$);

-- ── Cuenta dada de baja: pierde los permisos de su rol ──────────────────────
SELECT sec_test.deny('A.inactive_manager', 'cannot correct buckets', $$UPDATE bucket_records SET quality_grade = 'C' WHERE id = {A.bucket}$$);
SELECT sec_test.sees('A.inactive_manager', 'cannot read company payroll data', $$SELECT 1 FROM daily_attendance WHERE id = {B.att}$$, 0);

SELECT sec_test.finish();
ROLLBACK;
