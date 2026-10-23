-- =============================================================================
-- Descartes de anomalías (anomaly_dismissals, 20261023045000) y historial de
-- exportaciones de nómina (payroll_exports, 20261023046000). Auditoría 23-10, E.
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

INSERT INTO sec_test.ids VALUES ('A.dismissal', gen_random_uuid()), ('A.export', gen_random_uuid());
INSERT INTO public.anomaly_dismissals (id, orchard_id, anomaly_key, anomaly_type, reason, dismissed_by)
VALUES (sec_test.id_of('A.dismissal'), sec_test.id_of('A'), 'peer_outlier|x|2026-10-23T01:00:00Z', 'peer_outlier', 'good trees', sec_test.id_of('A.manager'));
INSERT INTO public.payroll_exports (id, exported_by, week_start, week_end, format, filename, record_count, total_earnings)
VALUES (sec_test.id_of('A.export'), sec_test.id_of('A.payroll_admin'), DATE '2026-10-12', DATE '2026-10-18', 'xero', 'xero.csv', 10, 1234.5);

-- ── anomaly_dismissals ──────────────────────────────────────────────────────
SELECT sec_test.sees(w, 'reads the orchard''s dismissed anomalies', $$SELECT 1 FROM anomaly_dismissals WHERE id = {A.dismissal}$$, 1)
FROM unnest(ARRAY['A.manager', 'A.admin']) AS w;
SELECT sec_test.sees(w, 'cannot read dismissed anomalies', $$SELECT 1 FROM anomaly_dismissals WHERE id = {A.dismissal}$$, 0)
FROM unnest(ARRAY['anon', 'A.team_leader', 'A.runner', 'A.qc_inspector', 'A.hr_admin', 'A.payroll_admin', 'B.manager', 'A.manager@aal1', 'A.inactive_manager']) AS w;
SELECT sec_test.allow('A.manager', 'dismisses an anomaly of own orchard',
    $$INSERT INTO anomaly_dismissals (orchard_id, anomaly_key, anomaly_type, reason) VALUES ({A}, 'k2', 'off_hours', 'night shift')$$);
SELECT sec_test.deny('B.manager', 'cannot dismiss anomalies of another orchard',
    $$INSERT INTO anomaly_dismissals (orchard_id, anomaly_key, anomaly_type) VALUES ({A}, 'k3', 'off_hours')$$);
SELECT sec_test.deny('A.manager', 'cannot dismiss in someone else''s name',
    $$INSERT INTO anomaly_dismissals (orchard_id, anomaly_key, anomaly_type, dismissed_by) VALUES ({A}, 'k4', 'off_hours', {A.admin})$$);
SELECT sec_test.deny(w, 'cannot dismiss anomalies',
    $$INSERT INTO anomaly_dismissals (orchard_id, anomaly_key, anomaly_type) VALUES ({A}, 'k5', 'off_hours')$$)
FROM unnest(ARRAY['anon', 'A.team_leader', 'A.runner', 'A.qc_inspector', 'A.payroll_admin', 'A.manager@aal1']) AS w;
SELECT sec_test.deny('A.manager', 'cannot edit a dismissal', $$UPDATE anomaly_dismissals SET reason = 'x' WHERE id = {A.dismissal}$$);
SELECT sec_test.allow('A.manager', 'undoes own dismissal', $$DELETE FROM anomaly_dismissals WHERE id = {A.dismissal}$$);
SELECT sec_test.deny(w, 'cannot undo a dismissal', $$DELETE FROM anomaly_dismissals WHERE id = {A.dismissal}$$)
FROM unnest(ARRAY['B.manager', 'A.team_leader', 'A.runner']) AS w;

-- ── payroll_exports ─────────────────────────────────────────────────────────
SELECT sec_test.sees(w, 'reads the export history', $$SELECT 1 FROM payroll_exports WHERE id = {A.export}$$, 1)
FROM unnest(ARRAY['A.payroll_admin', 'A.admin', 'B.payroll_admin']) AS w;
SELECT sec_test.sees(w, 'cannot read the export history', $$SELECT 1 FROM payroll_exports WHERE id = {A.export}$$, 0)
FROM unnest(ARRAY['anon', 'A.manager', 'A.hr_admin', 'A.team_leader', 'A.runner', 'A.payroll_admin@aal1']) AS w;
SELECT sec_test.allow(w, 'logs an export',
    $$INSERT INTO payroll_exports (week_start, week_end, format, filename, record_count, total_earnings)
      VALUES (DATE '2026-10-19', DATE '2026-10-25', 'csv', 'w.csv', 3, 99)$$)
FROM unnest(ARRAY['A.payroll_admin', 'A.admin']) AS w;
SELECT sec_test.deny('A.payroll_admin', 'cannot log an export in someone else''s name',
    $$INSERT INTO payroll_exports (exported_by, week_start, week_end, format, filename) VALUES ({A.admin}, DATE '2026-10-19', DATE '2026-10-25', 'csv', 'w.csv')$$);
SELECT sec_test.deny(w, 'cannot log exports',
    $$INSERT INTO payroll_exports (week_start, week_end, format, filename) VALUES (DATE '2026-10-19', DATE '2026-10-25', 'csv', 'w.csv')$$)
FROM unnest(ARRAY['anon', 'A.manager', 'A.hr_admin', 'A.team_leader', 'A.payroll_admin@aal1']) AS w;
SELECT sec_test.deny('A.payroll_admin', 'cannot edit an export record', $$UPDATE payroll_exports SET filename = 'x' WHERE id = {A.export}$$);
SELECT sec_test.deny(w, 'cannot delete export records', $$DELETE FROM payroll_exports WHERE id = {A.export}$$)
FROM unnest(ARRAY['A.manager', 'A.hr_admin', 'A.runner']) AS w;
SELECT sec_test.allow(w, 'deletes an export record', $$DELETE FROM payroll_exports WHERE id = {A.export}$$)
FROM unnest(ARRAY['A.payroll_admin', 'A.admin']) AS w;

SELECT sec_test.finish();
ROLLBACK;
