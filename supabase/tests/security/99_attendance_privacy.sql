-- =============================================================================
-- Privacidad de fichajes y turnos largos (migraciones 20261024020000 y
-- 20261024021000):
--   · daily_attendance la leen manager, TL (su equipo), RRHH, nómina, admin y
--     cada uno lo suyo; runner, QC y logística no;
--   · presence_today(huerto): quién está, desde cuándo, descanso, permiso,
--     salió, otro huerto; solo de tu huerto (la oficina, de toda la empresa);
--   · un tramo cerrado de más de 14 h sin corregir no se aprueba.
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

DO $$
DECLARE
    v_id uuid;
    v_today date := (now() AT TIME ZONE 'Pacific/Auckland')::date;
BEGIN
    -- Fichaje propio del runner de A (persona de campo: pickers.id = users.id)
    INSERT INTO public.daily_attendance (picker_id, orchard_id, date, check_in, check_out, status)
    VALUES (sec_test.id_of('A.runner'), sec_test.id_of('A'), v_today - 3,
            now() - interval '3 days 8 hours', now() - interval '3 days', 'present')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.att_runner', v_id);

    -- El picker del equipo de A.team_leader trabajó ayer en B
    INSERT INTO public.daily_attendance (picker_id, orchard_id, date, check_in, check_out, status)
    VALUES (sec_test.id_of('A.picker'), sec_test.id_of('B'), v_today - 1,
            now() - interval '1 day 6 hours', now() - interval '1 day', 'present')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('B.att_team_picker', v_id);

    -- El picker de A está ahora en su descanso
    UPDATE public.daily_attendance SET break_start = now() - interval '5 minutes'
    WHERE id = sec_test.id_of('A.att');

    -- Persona de A que ya salió hoy, y otra de permiso aprobado hoy
    INSERT INTO public.pickers (picker_id, name, orchard_id, role, status)
    VALUES ('SECTEST-LEFT-' || substr(gen_random_uuid()::text, 1, 6), 'SecTest left', sec_test.id_of('A'), 'picker', 'active')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.left_picker', v_id);
    INSERT INTO public.daily_attendance (picker_id, orchard_id, date, check_in, check_out, status)
    VALUES (v_id, sec_test.id_of('A'), v_today, now() - interval '3 hours', now() - interval '1 hour', 'present');

    INSERT INTO public.pickers (picker_id, name, orchard_id, role, status)
    VALUES ('SECTEST-LEAVE-' || substr(gen_random_uuid()::text, 1, 6), 'SecTest on leave', sec_test.id_of('A'), 'picker', 'active')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.leave_picker', v_id);
    INSERT INTO public.leave_requests (orchard_id, picker_id, type, start_date, end_date, status)
    VALUES (sec_test.id_of('A'), v_id, 'annual', v_today, v_today, 'approved');

    -- Tramo de 16 h sin corregir (salida olvidada cerrada tarde)
    INSERT INTO public.daily_attendance (picker_id, orchard_id, date, check_in, check_out, status)
    VALUES (sec_test.id_of('A.picker'), sec_test.id_of('A'), v_today - 4,
            now() - interval '4 days 16 hours', now() - interval '4 days', 'present')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.att_long', v_id);
END $$;

-- ── Lectura de daily_attendance ─────────────────────────────────────────────
SELECT sec_test.sees('anon', 'reads no attendance', $$SELECT 1 FROM daily_attendance$$, 0);
SELECT sec_test.sees(w, 'reads attendance of own orchard',
    $$SELECT 1 FROM daily_attendance WHERE id = {A.att}$$, 1)
FROM unnest(ARRAY['A.admin', 'A.manager', 'A.hr_admin', 'A.payroll_admin', 'B.payroll_admin', 'A.team_leader']) AS w;
SELECT sec_test.sees(w, 'no longer reads other people''s attendance',
    $$SELECT 1 FROM daily_attendance WHERE id IN ({A.att}, {A.att_tl}, {A.att_rotated})$$, 0)
FROM unnest(ARRAY['A.runner', 'A.runner2', 'A.qc_inspector', 'A.logistics', 'B.runner', 'B.qc_inspector', 'B.logistics']) AS w;
SELECT sec_test.sees('A.team_leader2', 'does not read a picker of another team', $$SELECT 1 FROM daily_attendance WHERE id = {A.att}$$, 0);
SELECT sec_test.sees('A.runner', 'reads own attendance', $$SELECT 1 FROM daily_attendance WHERE id = {A.att_runner}$$, 1);
SELECT sec_test.sees('A.team_leader', 'reads own team picker shift in another orchard',
    $$SELECT 1 FROM daily_attendance WHERE id = {B.att_team_picker}$$, 1);
SELECT sec_test.sees('B.team_leader', 'does not read a shift in own orchard of another team''s picker',
    $$SELECT 1 FROM daily_attendance WHERE id = {B.att_team_picker}$$, 0);
SELECT sec_test.returns('A.team_leader', 'policy "Read attendance" (whole orchard) is gone',
    $$SELECT count(*)::text FROM pg_policies WHERE tablename = 'daily_attendance' AND policyname IN ('Read attendance', 'attendance_view_policy')$$, '0');

-- ── presence_today ──────────────────────────────────────────────────────────
SELECT sec_test.deny('anon', 'cannot call presence_today', $$SELECT * FROM presence_today({A})$$);
SELECT sec_test.deny(w, 'cannot see presence of another orchard', $$SELECT * FROM presence_today({B})$$)
FROM unnest(ARRAY['A.runner', 'A.qc_inspector', 'A.logistics', 'A.team_leader']) AS w;
SELECT sec_test.returns(w, 'sees the checked-in picker of own orchard, since when and on break',
    $$SELECT (present AND since IS NOT NULL AND on_break AND checked_in_today AND left_at IS NULL)::text
      FROM presence_today({A}) WHERE picker_id = {A.picker}$$, 'true')
FROM unnest(ARRAY['A.runner', 'A.qc_inspector', 'A.logistics', 'A.team_leader2', 'A.manager']) AS w;
SELECT sec_test.returns('A.runner', 'sees who already left today, with no since',
    $$SELECT (NOT present AND since IS NULL AND checked_in_today AND left_at IS NOT NULL)::text
      FROM presence_today({A}) WHERE picker_id = {A.left_picker}$$, 'true');
SELECT sec_test.returns('A.runner', 'sees who is on approved leave',
    $$SELECT (on_leave AND NOT present AND NOT checked_in_today)::text
      FROM presence_today({A}) WHERE picker_id = {A.leave_picker}$$, 'true');
SELECT sec_test.returns('B.runner', 'sees own orchard person working now in another orchard',
    $$SELECT (NOT present AND elsewhere_orchard_id = {A})::text
      FROM presence_today({B}) WHERE picker_id = {B.rotated_picker}$$, 'true');
SELECT sec_test.returns('B.payroll_admin', 'the office sees presence of any orchard',
    $$SELECT count(*)::text FROM presence_today({A}) WHERE picker_id = {A.picker}$$, '1');
SELECT sec_test.returns('A.runner', 'returns no hours or pay columns',
    $$SELECT count(*)::text FROM pg_proc p, unnest(p.proargnames) AS a(name)
      WHERE p.proname = 'presence_today' AND (a.name ILIKE '%hour%' OR a.name ILIKE '%pay%' OR a.name ILIKE '%rate%')$$, '0');

-- ── Tramos de más de 14 h ───────────────────────────────────────────────────
SELECT sec_test.deny(w, 'cannot approve a 16 h shift that was not corrected',
    $$SELECT * FROM review_timesheet({A.att_long}, 'approve')$$, ARRAY['22023'])
FROM unnest(ARRAY['A.payroll_admin', 'A.manager']) AS w;
SELECT sec_test.deny('A.manager', 'cannot approve it with a direct update either',
    $$UPDATE daily_attendance SET verified_by = auth.uid(), verified_at = now() WHERE id = {A.att_long}$$, ARRAY['22023']);
SELECT sec_test.allow('A.payroll_admin', 'can still reject it so it gets fixed',
    $$SELECT * FROM review_timesheet({A.att_long}, 'reject', 'forgot to check out')$$);
SELECT sec_test.allow('A.manager', 'corrects it (corrected_at)',
    $$UPDATE daily_attendance SET check_out = check_in + interval '15 hours', corrected_at = now(),
        corrected_by = auth.uid(), correction_reason = 'real long day' WHERE id = {A.att_long}$$);
UPDATE public.daily_attendance SET corrected_at = now(), correction_reason = 'real long day'
WHERE id = sec_test.id_of('A.att_long');
SELECT sec_test.returns('A.payroll_admin', 'approves it once corrected',
    $$SELECT (verified_by = auth.uid())::text FROM review_timesheet({A.att_long}, 'approve')$$, 'true');
SELECT sec_test.returns('A.payroll_admin', 'a normal 8 h shift is approved as before',
    $$SELECT (verified_by = auth.uid())::text FROM review_timesheet({A.att_runner}, 'approve')$$, 'true');

SELECT sec_test.finish();
ROLLBACK;
