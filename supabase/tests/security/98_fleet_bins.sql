-- =============================================================================
-- Flota y bins de Logística (B6, auditoría 2026-10-23, migración 20261023044000)
-- Alta / cambios / baja de vehículos: logística, manager y admin de su huerto.
-- Bins: Logística cambia el estado y da de alta / baja.
-- Carga del vehículo: la recalcula un trigger al asignar / completar / cancelar.
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- ── Vehículos ───────────────────────────────────────────────────────────────
SELECT sec_test.allow(w, 'adds a vehicle with type, plate, zone and capacity',
    $$INSERT INTO fleet_vehicles (orchard_id, name, registration, type, zone, max_capacity, wof_expiry, next_service_date)
      VALUES ({A}, 'SecTest ute', 'ABC123', 'ute', 'A2', 4, current_date + 90, current_date + 30)$$)
FROM unnest(ARRAY['A.logistics', 'A.manager']) AS w;
SELECT sec_test.deny(w, 'cannot add vehicles',
    $$INSERT INTO fleet_vehicles (orchard_id, name, type) VALUES ({A}, 'SecTest x', 'truck')$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'A.qc_inspector', 'B.logistics']) AS w;
SELECT sec_test.allow('A.logistics', 'edits driver, status, WOF / COF and next service',
    $$UPDATE fleet_vehicles SET driver_name = 'Mere', status = 'maintenance', wof_expiry = current_date + 10,
          cof_expiry = current_date + 20, next_service_date = current_date + 5 WHERE id = {A.vehicle}$$);
SELECT sec_test.allow('A.logistics', 'retires a vehicle (deleted_at)',
    $$UPDATE fleet_vehicles SET deleted_at = now() WHERE id = {A.vehicle}$$);
SELECT sec_test.deny(w, 'cannot retire vehicles', $$UPDATE fleet_vehicles SET deleted_at = now() WHERE id = {A.vehicle}$$)
FROM unnest(ARRAY['A.runner', 'A.team_leader', 'B.logistics']) AS w;

-- ── Bins ────────────────────────────────────────────────────────────────────
SELECT sec_test.allow('A.logistics', 'marks a bin collected', $$UPDATE bins SET status = 'collected' WHERE id = {A.bin}$$);
SELECT sec_test.allow('A.logistics', 'adds a bin', $$INSERT INTO bins (orchard_id, bin_code, status) VALUES ({A}, 'SECTEST-NEW', 'empty')$$);
SELECT sec_test.allow('A.logistics', 'retires a bin (deleted_at)', $$UPDATE bins SET deleted_at = now() WHERE id = {A.bin}$$);
SELECT sec_test.deny(w, 'cannot change bins', $$UPDATE bins SET status = 'collected' WHERE id = {A.bin}$$)
FROM unnest(ARRAY['anon', 'A.qc_inspector', 'B.logistics']) AS w;

-- ── Carga del vehículo (trigger) ────────────────────────────────────────────
SELECT sec_test.allow('A.logistics', 'assigns a vehicle to a request (the trigger updates the vehicle under RLS)',
    $$UPDATE transport_requests SET assigned_vehicle = {A.vehicle}, status = 'assigned', bins_count = 3 WHERE id = {A.transport}$$);
SELECT sec_test.deny(w, 'cannot run the vehicle load recalculation directly', $$SELECT sync_vehicle_load({A.vehicle})$$)
FROM unnest(ARRAY['anon', 'A.logistics', 'A.runner']) AS w;

UPDATE public.fleet_vehicles SET max_capacity = 8, status = 'idle', bins_loaded = 0, load_status = 'empty'
WHERE id = sec_test.id_of('A.vehicle');
UPDATE public.transport_requests SET assigned_vehicle = sec_test.id_of('A.vehicle'), status = 'assigned', bins_count = 3
WHERE id = sec_test.id_of('A.transport');
SELECT sec_test.record(
    (SELECT bins_loaded = 3 AND load_status = 'partial' AND status = 'active' FROM fleet_vehicles WHERE id = sec_test.id_of('A.vehicle')),
    'trigger: assigning loads the vehicle (3 bins, partial, active)',
    (SELECT format('%s / %s / %s', bins_loaded, load_status, status) FROM fleet_vehicles WHERE id = sec_test.id_of('A.vehicle')));
INSERT INTO public.transport_requests (orchard_id, requested_by, requester_name, zone, bins_count, status, assigned_vehicle)
VALUES (sec_test.id_of('A'), sec_test.id_of('A.team_leader'), 'SecTest 2', 'Z2', 6, 'assigned', sec_test.id_of('A.vehicle'));
SELECT sec_test.record(
    (SELECT bins_loaded = 8 AND load_status = 'full' FROM fleet_vehicles WHERE id = sec_test.id_of('A.vehicle')),
    'trigger: a second request fills it up to its capacity',
    (SELECT format('%s / %s', bins_loaded, load_status) FROM fleet_vehicles WHERE id = sec_test.id_of('A.vehicle')));
UPDATE public.transport_requests SET status = 'completed' WHERE assigned_vehicle = sec_test.id_of('A.vehicle');
SELECT sec_test.record(
    (SELECT bins_loaded = 0 AND load_status = 'empty' AND status = 'idle' FROM fleet_vehicles WHERE id = sec_test.id_of('A.vehicle')),
    'trigger: completing empties it and leaves it idle',
    (SELECT format('%s / %s / %s', bins_loaded, load_status, status) FROM fleet_vehicles WHERE id = sec_test.id_of('A.vehicle')));
UPDATE public.fleet_vehicles SET status = 'maintenance' WHERE id = sec_test.id_of('A.vehicle');
UPDATE public.transport_requests SET status = 'assigned' WHERE id = sec_test.id_of('A.transport');
SELECT sec_test.record(
    (SELECT status = 'maintenance' AND bins_loaded = 3 FROM fleet_vehicles WHERE id = sec_test.id_of('A.vehicle')),
    'trigger: a vehicle in maintenance keeps its status',
    (SELECT format('%s / %s', bins_loaded, status) FROM fleet_vehicles WHERE id = sec_test.id_of('A.vehicle')));

SELECT sec_test.finish();
ROLLBACK;
