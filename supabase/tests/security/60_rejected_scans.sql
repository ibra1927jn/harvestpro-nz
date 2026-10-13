-- =============================================================================
-- rejected_scans: escaneos rechazados / dudosos que record-bucket reporta.
-- Lectura: manager (su huerto) y admin. Escritura: quien escanea, solo lo suyo
-- y en su huerto. Nadie edita ni borra.
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- Un rechazo por huerto, reportado por el runner de ese huerto
INSERT INTO sec_test.ids
SELECT o || '.rejected', gen_random_uuid() FROM unnest(ARRAY['A', 'B']) AS o;
INSERT INTO public.rejected_scans (id, orchard_id, reported_by, picker_code, scanned_at, reason)
SELECT sec_test.id_of(o || '.rejected'), sec_test.id_of(o), sec_test.id_of(o || '.runner'),
       'LOC-404', now(), 'UNKNOWN_BADGE: "LOC-404"'
FROM unnest(ARRAY['A', 'B']) AS o;

-- ── Lectura ─────────────────────────────────────────────────────────────────
SELECT sec_test.sees('A.manager', 'manager sees rejected scans of own orchard',
    $$SELECT 1 FROM rejected_scans WHERE id = {A.rejected}$$, 1);
SELECT sec_test.sees('A.manager', 'manager does not see rejected scans of another orchard',
    $$SELECT 1 FROM rejected_scans WHERE id = {B.rejected}$$, 0);
SELECT sec_test.sees('A.admin', 'admin sees rejected scans of every orchard',
    $$SELECT 1 FROM rejected_scans WHERE id IN ({A.rejected}, {B.rejected})$$, 2);
SELECT sec_test.sees(w, 'cannot read rejected scans', $$SELECT 1 FROM rejected_scans$$, 0)
FROM unnest(ARRAY['anon', 'A.team_leader', 'A.qc_inspector', 'A.logistics', 'A.payroll_admin',
                  'A.hr_admin', 'A.inactive_manager', 'A.runner2']) AS w;
-- Quien lo reportó ve solo lo suyo (ON CONFLICT DO NOTHING lo necesita)
SELECT sec_test.sees('A.runner', 'runner sees only the scans they reported',
    $$SELECT 1 FROM rejected_scans WHERE id IN ({A.rejected}, {B.rejected})$$, 1);
SELECT sec_test.sees('B.runner', 'runner of another orchard does not see them',
    $$SELECT 1 FROM rejected_scans WHERE id = {A.rejected}$$, 0);

-- ── Escritura ───────────────────────────────────────────────────────────────
SELECT sec_test.allow(w, 'reports an own rejected scan (orchard by default, idempotent)',
    $$INSERT INTO rejected_scans (id, picker_code, reason) VALUES (gen_random_uuid(), 'LOC-1', 'PAY_WEEK_CLOSED') ON CONFLICT (id) DO NOTHING$$)
FROM unnest(ARRAY['A.runner', 'A.team_leader', 'A.manager']) AS w;
SELECT sec_test.deny('A.runner', 'cannot report a scan in the name of someone else',
    $$INSERT INTO rejected_scans (id, reported_by, picker_code, reason) VALUES (gen_random_uuid(), {A.team_leader}, 'LOC-1', 'x')$$);
SELECT sec_test.deny('A.runner', 'cannot report into another orchard',
    $$INSERT INTO rejected_scans (id, orchard_id, picker_code, reason) VALUES (gen_random_uuid(), {B}, 'LOC-1', 'x')$$);
SELECT sec_test.deny(w, 'cannot report rejected scans',
    $$INSERT INTO rejected_scans (id, picker_code, reason) VALUES (gen_random_uuid(), 'LOC-1', 'x')$$)
FROM unnest(ARRAY['anon', 'A.qc_inspector', 'A.payroll_admin', 'A.hr_admin', 'A.logistics', 'A.inactive_manager']) AS w;
SELECT sec_test.deny(w, 'cannot change a rejected scan',
    $$UPDATE rejected_scans SET reason = 'ok' WHERE id = {A.rejected}$$)
FROM unnest(ARRAY['A.runner', 'A.manager', 'A.admin']) AS w;
SELECT sec_test.deny(w, 'cannot delete a rejected scan',
    $$DELETE FROM rejected_scans WHERE id = {A.rejected}$$)
FROM unnest(ARRAY['A.runner', 'A.manager', 'A.admin']) AS w;

SELECT sec_test.finish();
ROLLBACK;
