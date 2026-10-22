-- =============================================================================
-- A5 (parcial): cambiar el huerto propio solo los roles de empresa / oficina;
-- una solicitud de transporte siempre a nombre de quien la pide
-- (20261023013000_access_rules_orchard_transport).
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- ── users.orchard_id propio ─────────────────────────────────────────────────
SELECT sec_test.allow(w, 'office role switches own orchard',
    $$UPDATE users SET orchard_id = {B} WHERE id = auth.uid()$$)
FROM unnest(ARRAY['A.manager', 'A.hr_admin', 'A.payroll_admin', 'A.admin']) AS w;
SELECT sec_test.deny(w, 'field role cannot move itself to another orchard',
    $$UPDATE users SET orchard_id = {B} WHERE id = auth.uid()$$)
FROM unnest(ARRAY['A.team_leader', 'A.runner', 'A.qc_inspector', 'A.logistics']) AS w;
SELECT sec_test.deny('A.runner', 'field role cannot unlink itself from its orchard',
    $$UPDATE users SET orchard_id = NULL WHERE id = auth.uid()$$);
-- Quien sí mueve al personal de campo: RRHH, y el manager a su huerto
SELECT sec_test.allow('A.hr_admin', 'HR moves a runner to another orchard',
    $$UPDATE users SET orchard_id = {B} WHERE id = {A.runner}$$);
SELECT sec_test.allow('B.manager', 'manager links field staff to own orchard',
    $$UPDATE users SET orchard_id = {B} WHERE id = {A.runner}$$);
-- Lo demás de la fila propia sigue igual
SELECT sec_test.allow('A.runner', 'field role still edits own name',
    $$UPDATE users SET full_name = 'SecTest renamed' WHERE id = auth.uid()$$);

-- ── transport_requests ──────────────────────────────────────────────────────
SELECT sec_test.returns('A.runner', 'lax policy "Create transport" is gone',
    $$SELECT count(*)::text FROM pg_policies WHERE tablename = 'transport_requests' AND policyname = 'Create transport'$$, '0');
SELECT sec_test.allow(w, 'requests transport in own name',
    $$INSERT INTO transport_requests (orchard_id, requested_by, requester_name, zone) VALUES ({A}, auth.uid(), 'Me', 'Z3')$$)
FROM unnest(ARRAY['A.runner', 'A.team_leader', 'A.logistics', 'A.manager']) AS w;
SELECT sec_test.deny(w, 'cannot request transport in someone else''s name',
    $$INSERT INTO transport_requests (orchard_id, requested_by, requester_name, zone) VALUES ({A}, {A.runner2}, 'Not me', 'Z3')$$)
FROM unnest(ARRAY['A.runner', 'A.team_leader', 'A.logistics', 'A.manager']) AS w;
SELECT sec_test.deny('A.runner', 'cannot request transport without a requester',
    $$INSERT INTO transport_requests (orchard_id, requested_by, requester_name, zone) VALUES ({A}, NULL, 'Nobody', 'Z3')$$,
    ARRAY['42501', '23502']);
SELECT sec_test.allow('A.logistics', 'logistics still assigns requests',
    $$UPDATE transport_requests SET status = 'assigned' WHERE id = {A.transport}$$);

SELECT sec_test.finish();
ROLLBACK;
