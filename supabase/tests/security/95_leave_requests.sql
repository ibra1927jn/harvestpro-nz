-- =============================================================================
-- leave_requests (Agenda de RRHH, revisión 21-10 #18): ausencias y permisos.
-- Lectura: manager del huerto; team leader solo las de SU equipo y cada persona
-- las suyas (20261027040000; los casos de equipo en 99_team_scope_leave_qc_rows.sql);
-- RRHH, nómina y admin de toda la empresa (runner, QC y logística ven «de permiso»
-- con presence_today: Fase 2, 20261027030000_fase2_rls_gaps). Pedir: RRHH/admin en cualquier huerto; manager y team leader en el
-- suyo, solo como "requested" y a su nombre. Decidir: RRHH/admin y el manager
-- de su huerto; nadie decide la suya (salvo admin). Nadie borra.
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- Una ausencia solicitada por huerto (del picker, pedida por su team leader)
-- y una del propio team leader de A (es persona de campo: pickers.id = users.id)
INSERT INTO sec_test.ids
SELECT o || '.leave', gen_random_uuid() FROM unnest(ARRAY['A', 'B']) AS o;
INSERT INTO sec_test.ids VALUES ('A.leave_tl', gen_random_uuid());
INSERT INTO public.leave_requests (id, orchard_id, picker_id, type, start_date, end_date, requested_by)
SELECT sec_test.id_of(o || '.leave'), sec_test.id_of(o), sec_test.id_of(o || '.picker'), 'annual',
       current_date + 7, current_date + 9, sec_test.id_of(o || '.team_leader')
FROM unnest(ARRAY['A', 'B']) AS o;
INSERT INTO public.leave_requests (id, orchard_id, picker_id, type, start_date, end_date, requested_by)
VALUES (sec_test.id_of('A.leave_tl'), sec_test.id_of('A'), sec_test.id_of('A.team_leader'), 'sick',
        current_date, current_date, sec_test.id_of('A.manager'));

-- ── Lectura ─────────────────────────────────────────────────────────────────
SELECT sec_test.sees('A.manager', 'sees leave of own orchard', $$SELECT 1 FROM leave_requests WHERE id IN ({A.leave}, {A.leave_tl})$$, 2);
-- {A.leave} es de su equipo; {A.leave_tl}, la suya
SELECT sec_test.sees('A.team_leader', 'sees leave of own team and own leave', $$SELECT 1 FROM leave_requests WHERE id IN ({A.leave}, {A.leave_tl})$$, 2);
SELECT sec_test.sees('A.team_leader2', 'cannot see leave of another team', $$SELECT 1 FROM leave_requests WHERE id IN ({A.leave}, {A.leave_tl})$$, 0);
-- El tipo (enfermedad, violencia doméstica…) y el motivo no son para todo el huerto
SELECT sec_test.sees(w, 'cannot read leave requests (uses presence_today)', $$SELECT 1 FROM leave_requests WHERE id = {A.leave}$$, 0)
FROM unnest(ARRAY['A.runner', 'A.qc_inspector', 'A.logistics']) AS w;
SELECT sec_test.sees(w, 'does not see leave of another orchard', $$SELECT 1 FROM leave_requests WHERE id = {B.leave}$$, 0)
FROM unnest(ARRAY['A.manager', 'A.team_leader', 'A.runner']) AS w;
SELECT sec_test.sees(w, 'sees leave of every orchard', $$SELECT 1 FROM leave_requests WHERE id IN ({A.leave}, {B.leave})$$, 2)
FROM unnest(ARRAY['A.hr_admin', 'A.payroll_admin', 'A.admin']) AS w;
SELECT sec_test.sees(w, 'cannot read leave requests', $$SELECT 1 FROM leave_requests$$, 0)
FROM unnest(ARRAY['anon', 'A.inactive_manager', 'A.inactive_hr_admin']) AS w;
SELECT sec_test.sees(w, 'without 2FA cannot read leave requests', $$SELECT 1 FROM leave_requests$$, 0)
FROM unnest(ARRAY['A.hr_admin@aal1', 'A.manager@aal1', 'A.admin@aal1']) AS w;
SELECT sec_test.deny('A.hr_admin@aal1', 'without 2FA cannot request leave',
    $$INSERT INTO leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by)
      VALUES ({A}, {A.picker}, 'annual', current_date + 1, current_date + 1, auth.uid())$$);
SELECT sec_test.deny('A.manager@aal1', 'without 2FA cannot decide leave',
    $$UPDATE leave_requests SET status = 'approved' WHERE id = {A.leave}$$);

-- ── Pedir ───────────────────────────────────────────────────────────────────
SELECT sec_test.allow(w, 'requests leave for a person of own orchard',
    $$INSERT INTO leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by)
      VALUES ({A}, {A.picker}, 'day_off', current_date + 1, current_date + 1, auth.uid())$$)
FROM unnest(ARRAY['A.team_leader', 'A.manager', 'A.hr_admin', 'A.admin']) AS w;
SELECT sec_test.allow('A.hr_admin', 'HR requests leave in another orchard',
    $$INSERT INTO leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by)
      VALUES ({B}, {B.picker}, 'annual', current_date + 1, current_date + 2, auth.uid())$$);
SELECT sec_test.allow('A.hr_admin', 'HR registers a leave already approved',
    $$INSERT INTO leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by, status)
      VALUES ({A}, {A.picker}, 'sick', current_date, current_date, auth.uid(), 'approved')$$);
SELECT sec_test.deny(w, 'cannot request leave in another orchard',
    $$INSERT INTO leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by)
      VALUES ({B}, {B.picker}, 'annual', current_date + 1, current_date + 1, auth.uid())$$)
FROM unnest(ARRAY['A.team_leader', 'A.manager']) AS w;
SELECT sec_test.deny(w, 'cannot create a leave already approved',
    $$INSERT INTO leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by, status)
      VALUES ({A}, {A.picker}, 'annual', current_date + 1, current_date + 1, auth.uid(), 'approved')$$)
FROM unnest(ARRAY['A.team_leader', 'A.manager']) AS w;
SELECT sec_test.deny('A.team_leader', 'cannot request in the name of someone else',
    $$INSERT INTO leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by)
      VALUES ({A}, {A.picker}, 'annual', current_date + 1, current_date + 1, {A.manager})$$);
SELECT sec_test.deny(w, 'cannot request leave',
    $$INSERT INTO leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by)
      VALUES ({A}, {A.picker}, 'annual', current_date + 1, current_date + 1, auth.uid())$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.qc_inspector', 'A.logistics', 'A.payroll_admin', 'A.inactive_manager']) AS w;
-- Restricciones de la tabla: fin antes del inicio, medio día de varios días, tipo desconocido
SELECT sec_test.deny('A.hr_admin', 'end before start is rejected',
    $$INSERT INTO leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by)
      VALUES ({A}, {A.picker}, 'annual', current_date + 2, current_date + 1, auth.uid())$$, ARRAY['23514']);
SELECT sec_test.deny('A.hr_admin', 'half day over several days is rejected',
    $$INSERT INTO leave_requests (orchard_id, picker_id, type, start_date, end_date, half_day, requested_by)
      VALUES ({A}, {A.picker}, 'annual', current_date + 1, current_date + 2, true, auth.uid())$$, ARRAY['23514']);
SELECT sec_test.deny('A.hr_admin', 'unknown leave type is rejected',
    $$INSERT INTO leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by)
      VALUES ({A}, {A.picker}, 'holiday', current_date + 1, current_date + 1, auth.uid())$$, ARRAY['23514']);

-- ── Decidir ─────────────────────────────────────────────────────────────────
SELECT sec_test.allow(w, 'approves leave of own orchard',
    $$UPDATE leave_requests SET status = 'approved', decided_by = auth.uid(), decided_at = now() WHERE id = {A.leave}$$)
FROM unnest(ARRAY['A.manager', 'A.hr_admin', 'A.admin']) AS w;
SELECT sec_test.allow('A.hr_admin', 'HR rejects leave in another orchard with a note',
    $$UPDATE leave_requests SET status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = 'no cover' WHERE id = {B.leave}$$);
SELECT sec_test.deny('A.manager', 'cannot decide leave of another orchard',
    $$UPDATE leave_requests SET status = 'approved' WHERE id = {B.leave}$$);
SELECT sec_test.deny(w, 'cannot decide leave requests',
    $$UPDATE leave_requests SET status = 'approved' WHERE id = {A.leave}$$)
FROM unnest(ARRAY['anon', 'A.team_leader', 'A.runner', 'A.payroll_admin', 'A.logistics', 'A.inactive_manager']) AS w;
SELECT sec_test.deny('A.team_leader', 'cannot approve own leave',
    $$UPDATE leave_requests SET status = 'approved' WHERE id = {A.leave_tl}$$);
SELECT sec_test.allow('A.manager', 'manager decides the team leader''s leave',
    $$UPDATE leave_requests SET status = 'approved', decided_by = auth.uid(), decided_at = now() WHERE id = {A.leave_tl}$$);
SELECT sec_test.allow('A.manager', 'cancels an approved leave',
    $$UPDATE leave_requests SET status = 'cancelled', decided_by = auth.uid(), decided_at = now() WHERE id = {A.leave}$$);
SELECT sec_test.deny('A.manager', 'cannot move a leave to another orchard',
    $$UPDATE leave_requests SET orchard_id = {B} WHERE id = {A.leave}$$);

-- ── Borrar: nadie ──────────────────────────────────────────────────────────
SELECT sec_test.deny(w, 'cannot delete leave requests', $$DELETE FROM leave_requests WHERE id = {A.leave}$$)
FROM unnest(ARRAY['A.team_leader', 'A.manager', 'A.hr_admin', 'A.admin']) AS w;

SELECT sec_test.finish();
ROLLBACK;
