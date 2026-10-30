-- =============================================================================
-- B3: un día cerrado (day_closures) bloquea altas, cambios y borrados de sus
-- fichajes salvo admin; aprobar / rechazar sí se puede
-- (20261023014000_closed_day_attendance_lock).
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- Fichaje de un día que el manager ya cerró (hace 200 días: cierre del arnés)
DO $$
DECLARE
    v_day date := ((now() - interval '200 days') AT TIME ZONE 'Pacific/Auckland')::date;
    v_id uuid;
BEGIN
    INSERT INTO public.daily_attendance (picker_id, orchard_id, date, check_in, check_out, status, hours_worked)
    VALUES (sec_test.id_of('A.picker'), sec_test.id_of('A'), v_day,
            now() - interval '200 days 9 hours', now() - interval '200 days 1 hour', 'present', 7.5)
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.att_closed_day', v_id);
END $$;
CREATE TABLE sec_test.closed_day_row AS
SELECT date, check_in, check_out FROM public.daily_attendance WHERE id = sec_test.id_of('A.att_closed_day');
GRANT SELECT ON sec_test.closed_day_row TO authenticated;

SELECT sec_test.deny(w, 'cannot correct a timesheet of a closed day',
    $$UPDATE daily_attendance SET check_out = check_out + interval '2 hours' WHERE id = {A.att_closed_day}$$, ARRAY['P0001'])
FROM unnest(ARRAY['A.team_leader', 'A.manager', 'A.hr_admin']) AS w;
SELECT sec_test.deny('A.manager', 'cannot add a note to a timesheet of a closed day',
    $$UPDATE daily_attendance SET notes = 'x' WHERE id = {A.att_closed_day}$$, ARRAY['P0001']);
SELECT sec_test.deny('A.manager', 'cannot delete a timesheet of a closed day',
    $$DELETE FROM daily_attendance WHERE id = {A.att_closed_day}$$, ARRAY['P0001']);
SELECT sec_test.deny('A.manager', 'cannot soft-delete a timesheet of a closed day',
    $$UPDATE daily_attendance SET deleted_at = now() WHERE id = {A.att_closed_day}$$, ARRAY['P0001']);
SELECT sec_test.deny(w, 'cannot check someone in on a closed day',
    $$INSERT INTO daily_attendance (picker_id, orchard_id, date, check_in, check_out, status)
      SELECT {A.archived_picker}, {A}, date, check_in, check_out, 'present' FROM sec_test.closed_day_row$$, ARRAY['P0001'])
FROM unnest(ARRAY['A.team_leader', 'A.manager']) AS w;
SELECT sec_test.deny('A.manager', 'cannot move a timesheet out of a closed day',
    $$UPDATE daily_attendance SET date = date + 1 WHERE id = {A.att_closed_day}$$, ARRAY['P0001']);
SELECT sec_test.deny('A.manager', 'cannot move a timesheet into a closed day',
    $$UPDATE daily_attendance SET date = (SELECT date FROM sec_test.closed_day_row) WHERE id = {A.att}$$, ARRAY['P0001']);

-- Admin sí
SELECT sec_test.allow('A.admin', 'admin corrects a timesheet of a closed day',
    $$UPDATE daily_attendance SET check_out = check_out + interval '2 hours' WHERE id = {A.att_closed_day}$$);
-- Revisión de nómina sí (los días se revisan después de cerrarlos)
SELECT sec_test.returns('A.payroll_admin', 'payroll approves a timesheet of a closed day',
    $$SELECT (verified_by = auth.uid())::text FROM review_timesheet({A.att_closed_day}, 'approve')$$, 'true');
SELECT sec_test.returns('A.payroll_admin', 'payroll rejects a timesheet of a closed day',
    $$SELECT (rejected_by = auth.uid())::text FROM review_timesheet({A.att_closed_day}, 'reject', 'Check the hours')$$, 'true');
-- Un día abierto sigue igual
SELECT sec_test.allow('A.manager', 'corrects a timesheet of an open day',
    $$UPDATE daily_attendance SET check_out = now() WHERE id = {A.att}$$);
SELECT sec_test.finish();
ROLLBACK;
