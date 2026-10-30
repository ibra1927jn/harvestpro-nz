-- =============================================================================
-- A2: el team leader solo ficha / corrige / borra fichajes de SU equipo o de
-- gente sin equipo; ya no existe la política que dejaba a manager y team
-- leader cambiar fichajes de cualquier huerto (20261023011000). La lectura
-- quedó limitada por rol en 20261024021000 (ver 99_attendance_privacy.sql).
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- Persona sin equipo en A, con un fichaje abierto
DO $$
DECLARE v_id uuid; v_att uuid;
BEGIN
    INSERT INTO public.pickers (picker_id, name, orchard_id, team_leader_id, role, status)
    VALUES ('SECTEST-FREE-' || substr(gen_random_uuid()::text, 1, 6), 'SecTest free picker', sec_test.id_of('A'),
            NULL, 'picker', 'active')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.free_picker', v_id);
    INSERT INTO public.daily_attendance (picker_id, orchard_id, date, check_in, status)
    VALUES (v_id, sec_test.id_of('A'), (now() AT TIME ZONE 'Pacific/Auckland')::date, now() - interval '1 hour', 'present')
    RETURNING id INTO v_att;
    INSERT INTO sec_test.ids VALUES ('A.att_free', v_att);
END $$;

SELECT sec_test.returns('A.team_leader', 'policy attendance_update_policy is gone',
    $$SELECT count(*)::text FROM pg_policies WHERE tablename = 'daily_attendance' AND policyname = 'attendance_update_policy'$$, '0');

-- ── Su equipo: sí ────────────────────────────────────────────────────────────
SELECT sec_test.allow('A.team_leader', 'checks out a picker of own team',
    $$UPDATE daily_attendance SET check_out = now() WHERE id = {A.att}$$);
SELECT sec_test.allow('A.team_leader', 'checks in a picker of own team',
    $$INSERT INTO daily_attendance (picker_id, orchard_id, date, check_in, check_out, status)
      VALUES ({A.picker}, {A}, current_date - 5, now() - interval '5 days 8 hours', now() - interval '5 days', 'present')$$);

-- ── Otro equipo: no ──────────────────────────────────────────────────────────
SELECT sec_test.deny('A.team_leader2', 'cannot correct a timesheet of another team',
    $$UPDATE daily_attendance SET check_out = now() WHERE id = {A.att}$$);
SELECT sec_test.deny('A.team_leader2', 'cannot check in a picker of another team',
    $$INSERT INTO daily_attendance (picker_id, orchard_id, date, check_in, check_out, status)
      VALUES ({A.picker}, {A}, current_date - 5, now() - interval '5 days 8 hours', now() - interval '5 days', 'present')$$);
SELECT sec_test.deny('A.team_leader2', 'cannot delete a timesheet of another team',
    $$DELETE FROM daily_attendance WHERE id = {A.att}$$);
SELECT sec_test.deny('A.team_leader2', 'cannot move a timesheet to a picker of another team',
    $$UPDATE daily_attendance SET picker_id = {A.picker} WHERE id = {A.att_free}$$);

-- ── Sin equipo: sí (puede coger a gente sin equipo) ─────────────────────────
SELECT sec_test.allow(w, 'checks out a picker without a team',
    $$UPDATE daily_attendance SET check_out = now() WHERE id = {A.att_free}$$)
FROM unnest(ARRAY['A.team_leader', 'A.team_leader2']) AS w;
SELECT sec_test.allow('A.team_leader2', 'checks in a picker without a team',
    $$INSERT INTO daily_attendance (picker_id, orchard_id, date, check_in, check_out, status)
      VALUES ({A.free_picker}, {A}, current_date - 5, now() - interval '5 days 8 hours', now() - interval '5 days', 'present')$$);

-- ── Manager y RRHH: todo su huerto; otro huerto, nadie ──────────────────────
SELECT sec_test.allow(w, 'corrects any timesheet of own orchard',
    $$UPDATE daily_attendance SET check_out = now() WHERE id = {A.att}$$)
FROM unnest(ARRAY['A.manager', 'A.hr_admin', 'A.admin']) AS w;
SELECT sec_test.deny(w, 'cannot correct a timesheet of another orchard',
    $$UPDATE daily_attendance SET check_out = now() WHERE id = {A.att}$$)
FROM unnest(ARRAY['B.manager', 'B.team_leader', 'B.hr_admin']) AS w;
SELECT sec_test.deny(w, 'cannot close a shift left open in another orchard (the Edge Function does it)',
    $$UPDATE daily_attendance SET check_out = now() WHERE id = {A.att_rotated}$$)
FROM unnest(ARRAY['B.manager', 'B.team_leader']) AS w;

-- ── Lectura (20261024021000): el TL ve su equipo y la gente sin equipo; ──────
-- runner y QC ya no leen fichajes ajenos (usan presence_today)
SELECT sec_test.sees('A.team_leader2', 'reads only the picker without a team (not another team)',
    $$SELECT 1 FROM daily_attendance WHERE id IN ({A.att}, {A.att_free})$$, 1);
SELECT sec_test.sees(w, 'no longer reads attendance of the whole orchard',
    $$SELECT 1 FROM daily_attendance WHERE id IN ({A.att}, {A.att_free})$$, 0)
FROM unnest(ARRAY['A.runner', 'A.qc_inspector']) AS w;

SELECT sec_test.finish();
ROLLBACK;
