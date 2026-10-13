-- =============================================================================
-- Operación: huertos, bloques/filas/temporadas, asignación de filas, bins,
-- flota, transporte, inspecciones de calidad.
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- ── orchards ────────────────────────────────────────────────────────────────
SELECT sec_test.sees('anon', 'cannot list orchards', $$SELECT 1 FROM orchards$$, 0);
SELECT sec_test.allow('A.manager', 'renames own orchard', $$UPDATE orchards SET location = 'Cromwell' WHERE id = {A}$$);
SELECT sec_test.allow('A.admin', 'renames any orchard', $$UPDATE orchards SET location = 'Cromwell' WHERE id = {B}$$);
SELECT sec_test.deny(w, 'cannot edit another orchard', $$UPDATE orchards SET name = 'Hacked' WHERE id = {A}$$)
FROM unnest(ARRAY['B.manager', 'A.runner', 'A.team_leader', 'A.inactive_manager']) AS w;
SELECT sec_test.deny(w, 'cannot create orchards', $$INSERT INTO orchards (name) VALUES ('Fake')$$)
FROM unnest(ARRAY['anon', 'A.manager', 'A.runner']) AS w;
SELECT sec_test.deny(w, 'cannot delete orchards', $$DELETE FROM orchards WHERE id = {B}$$)
FROM unnest(ARRAY['A.manager', 'B.manager']) AS w;

-- ── Mapa: temporadas, bloques, filas ────────────────────────────────────────
SELECT sec_test.sees('anon', 'cannot read the orchard map', $$SELECT 1 FROM block_rows UNION ALL SELECT 1 FROM orchard_blocks UNION ALL SELECT 1 FROM harvest_seasons$$, 0);
SELECT sec_test.allow('A.manager', 'edits a block', $$UPDATE orchard_blocks SET name = 'N' WHERE id = {A.block}$$);
SELECT sec_test.deny(w, 'cannot edit blocks', $$UPDATE orchard_blocks SET name = 'N' WHERE id = {A.block}$$)
FROM unnest(ARRAY['A.team_leader', 'A.runner', 'B.manager']) AS w;
SELECT sec_test.deny(w, 'cannot edit rows', $$UPDATE block_rows SET target_buckets = 1 WHERE id = {A.row}$$)
FROM unnest(ARRAY['A.team_leader', 'A.runner', 'B.manager']) AS w;
SELECT sec_test.deny(w, 'cannot edit seasons', $$UPDATE harvest_seasons SET name = 'N' WHERE id = {A.season}$$)
FROM unnest(ARRAY['A.team_leader', 'A.runner', 'B.manager']) AS w;

-- ── row_assignments ─────────────────────────────────────────────────────────
SELECT sec_test.allow(w, 'assigns rows in own orchard', $$UPDATE row_assignments SET completion_percentage = 50 WHERE id = {A.rowasg}$$)
FROM unnest(ARRAY['A.team_leader', 'A.manager', 'A.admin']) AS w;
SELECT sec_test.deny(w, 'cannot change row assignments', $$UPDATE row_assignments SET completion_percentage = 50 WHERE id = {A.rowasg}$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.qc_inspector', 'B.team_leader', 'B.manager']) AS w;
SELECT sec_test.deny('B.team_leader', 'cannot create row assignments in another orchard',
    $$INSERT INTO row_assignments (orchard_id, row_number) VALUES ({A}, 9)$$);

-- ── bins / fleet / transport ────────────────────────────────────────────────
SELECT sec_test.allow(w, 'updates a bin', $$UPDATE bins SET status = 'full' WHERE id = {A.bin}$$)
FROM unnest(ARRAY['A.runner', 'A.logistics', 'A.manager']) AS w;
SELECT sec_test.deny(w, 'cannot update bins', $$UPDATE bins SET status = 'full' WHERE id = {A.bin}$$)
FROM unnest(ARRAY['anon', 'A.qc_inspector', 'A.payroll_admin', 'B.runner', 'B.logistics']) AS w;
SELECT sec_test.allow('A.logistics', 'updates a vehicle', $$UPDATE fleet_vehicles SET status = 'idle' WHERE id = {A.vehicle}$$);
SELECT sec_test.deny(w, 'cannot manage the fleet', $$UPDATE fleet_vehicles SET status = 'offline' WHERE id = {A.vehicle}$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'B.logistics']) AS w;
SELECT sec_test.allow('A.team_leader', 'requests transport',
    $$INSERT INTO transport_requests (orchard_id, requested_by, requester_name, zone) VALUES ({A}, auth.uid(), 'TL', 'Z2')$$);
SELECT sec_test.deny('B.team_leader', 'cannot request transport for another orchard',
    $$INSERT INTO transport_requests (orchard_id, requested_by, requester_name, zone) VALUES ({A}, auth.uid(), 'TL', 'Z2')$$);
SELECT sec_test.allow('A.logistics', 'assigns a transport request', $$UPDATE transport_requests SET status = 'assigned' WHERE id = {A.transport}$$);
SELECT sec_test.deny(w, 'cannot dispatch transport', $$UPDATE transport_requests SET status = 'completed' WHERE id = {A.transport}$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'B.logistics']) AS w;

-- ── qc_inspections (la nota de calidad puede afectar la paga) ───────────────
SELECT sec_test.allow('A.qc_inspector', 'records an inspection',
    $$INSERT INTO qc_inspections (orchard_id, picker_id, inspector_id, grade) VALUES ({A}, {A.picker}, auth.uid(), 'B')$$);
SELECT sec_test.deny(w, 'cannot record inspections',
    $$INSERT INTO qc_inspections (orchard_id, picker_id, inspector_id, grade) VALUES ({A}, {A.picker}, auth.uid(), 'reject')$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'B.qc_inspector']) AS w;
SELECT sec_test.deny(w, 'cannot change an inspection grade', $$UPDATE qc_inspections SET grade = 'reject' WHERE id = {A.qc}$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'B.qc_inspector']) AS w;

SELECT sec_test.finish();
ROLLBACK;
