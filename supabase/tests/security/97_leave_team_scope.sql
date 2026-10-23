-- =============================================================================
-- leave_requests: el team leader pide ausencias solo para SU equipo
-- (20261023030000_leave_requests_team_scope; decisión del dueño 23-10).
-- El manager, para todo su huerto; RRHH/admin como antes.
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- Un picker del equipo del otro team leader y uno sin equipo
DO $$
DECLARE v_id uuid;
BEGIN
    INSERT INTO public.pickers (picker_id, name, orchard_id, team_leader_id, role, status)
    VALUES ('SECTEST-A-LV-TL2', 'SecTest picker of team leader 2', sec_test.id_of('A'), sec_test.id_of('A.team_leader2'), 'picker', 'active')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.picker_tl2', v_id);
    INSERT INTO public.pickers (picker_id, name, orchard_id, team_leader_id, role, status)
    VALUES ('SECTEST-A-LV-FREE', 'SecTest picker without team', sec_test.id_of('A'), NULL, 'picker', 'active')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.picker_free', v_id);
END $$;

SELECT sec_test.allow('A.team_leader', 'team leader requests leave for his own team',
    $$INSERT INTO leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by)
      VALUES ({A}, {A.picker}, 'sick', current_date, current_date, auth.uid())$$);
SELECT sec_test.deny('A.team_leader', 'team leader cannot request leave for another team',
    $$INSERT INTO leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by)
      VALUES ({A}, {A.picker_tl2}, 'sick', current_date, current_date, auth.uid())$$);
SELECT sec_test.deny('A.team_leader', 'team leader cannot request leave for someone without team',
    $$INSERT INTO leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by)
      VALUES ({A}, {A.picker_free}, 'day_off', current_date, current_date, auth.uid())$$);
SELECT sec_test.deny('A.team_leader', 'team leader still cannot create it approved',
    $$INSERT INTO leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by, status)
      VALUES ({A}, {A.picker}, 'sick', current_date, current_date, auth.uid(), 'approved')$$);
SELECT sec_test.allow('A.team_leader2', 'the other team leader requests for his team',
    $$INSERT INTO leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by)
      VALUES ({A}, {A.picker_tl2}, 'annual', current_date + 1, current_date + 2, auth.uid())$$);
SELECT sec_test.allow('A.manager', 'manager requests leave for anyone of his orchard',
    $$INSERT INTO leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by)
      VALUES ({A}, {A.picker_tl2}, 'annual', current_date + 1, current_date + 1, auth.uid())$$);
SELECT sec_test.allow('A.manager', 'manager requests leave for someone without team',
    $$INSERT INTO leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by)
      VALUES ({A}, {A.picker_free}, 'annual', current_date + 1, current_date + 1, auth.uid())$$);
SELECT sec_test.allow('A.hr_admin', 'HR requests leave for anyone',
    $$INSERT INTO leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by)
      VALUES ({A}, {A.picker_free}, 'sick', current_date, current_date, auth.uid())$$);

SELECT sec_test.finish();
ROLLBACK;
