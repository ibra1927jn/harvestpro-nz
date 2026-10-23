-- =============================================================================
-- Revisión del PR #86 (migración 20261024022000):
--   · una corrección anterior a la salida no da por revisado un tramo largo;
--   · el desfase del reloj del móvil cabe aunque sea de meses (bigint);
--   · presence_today solo enseña gente de ese huerto y cuenta el turno de noche.
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

DO $$
DECLARE
    v_id uuid;
    v_att uuid;
    v_today date := (now() AT TIME ZONE 'Pacific/Auckland')::date;
BEGIN
    -- El TL corrige la ENTRADA por la mañana; la salida se olvida y se cierra
    -- con un check_out normal 25,5 h después de la entrada
    INSERT INTO public.daily_attendance (picker_id, orchard_id, date, check_in, status, corrected_at, correction_reason)
    VALUES (sec_test.id_of('A.picker'), sec_test.id_of('A'), v_today - 5,
            now() - interval '5 days 25 hours 30 minutes', 'present',
            now() - interval '5 days 22 hours', 'check-in fixed in the morning')
    RETURNING id INTO v_att;
    UPDATE public.daily_attendance SET check_out = check_in + interval '25 hours 30 minutes' WHERE id = v_att;
    INSERT INTO sec_test.ids VALUES ('A.att_early_fix', v_att);

    -- Persona solo de B, de permiso hoy, y otra solo de B con turno abierto en B
    INSERT INTO public.pickers (picker_id, name, orchard_id, role, status)
    VALUES ('SECTEST-BLEAVE-' || substr(gen_random_uuid()::text, 1, 6), 'SecTest B leave', sec_test.id_of('B'), 'picker', 'active')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('B.leave_picker', v_id);
    INSERT INTO public.leave_requests (orchard_id, picker_id, type, start_date, end_date, status)
    VALUES (sec_test.id_of('B'), v_id, 'annual', v_today, v_today, 'approved');

    INSERT INTO public.pickers (picker_id, name, orchard_id, role, status)
    VALUES ('SECTEST-BOPEN-' || substr(gen_random_uuid()::text, 1, 6), 'SecTest B open', sec_test.id_of('B'), 'picker', 'active')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('B.open_picker', v_id);
    INSERT INTO public.daily_attendance (picker_id, orchard_id, date, check_in, status)
    VALUES (v_id, sec_test.id_of('B'), v_today, now() - interval '1 hour', 'present');

    -- Persona de A con un turno de noche: empezó ayer y sigue abierto
    INSERT INTO public.pickers (picker_id, name, orchard_id, role, status)
    VALUES ('SECTEST-NIGHT-' || substr(gen_random_uuid()::text, 1, 6), 'SecTest night', sec_test.id_of('A'), 'picker', 'active')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.night_picker', v_id);
    INSERT INTO public.daily_attendance (picker_id, orchard_id, date, check_in, status)
    VALUES (v_id, sec_test.id_of('A'), v_today - 1, now() - interval '9 hours', 'present');
END $$;

-- ── 1. La corrección tiene que ser posterior a la salida ───────────────────
SELECT sec_test.returns('A.payroll_admin', 'a correction made before the check-out does not count as review',
    $$SELECT public.shift_needs_review(check_in, check_out, corrected_at)::text FROM daily_attendance WHERE id = {A.att_early_fix}$$, 'true');
SELECT sec_test.deny(w, 'cannot approve a 25.5 h shift whose only correction was before the check-out',
    $$SELECT * FROM review_timesheet({A.att_early_fix}, 'approve')$$, ARRAY['22023'])
FROM unnest(ARRAY['A.payroll_admin', 'A.manager']) AS w;
UPDATE public.daily_attendance SET corrected_at = now(), correction_reason = 'long day confirmed after check-out'
WHERE id = sec_test.id_of('A.att_early_fix');
SELECT sec_test.returns('A.payroll_admin', 'corrected after the check-out: approvable',
    $$SELECT (verified_by = auth.uid())::text FROM review_timesheet({A.att_early_fix}, 'approve')$$, 'true');

-- ── 2. Desfase del reloj de meses ──────────────────────────────────────────
SELECT sec_test.returns('A.team_leader', 'clock skew columns are bigint',
    $$SELECT string_agg(data_type, ',' ORDER BY column_name) FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name IN ('clock_skew_ms', 'check_in_clock_skew_ms', 'check_out_clock_skew_ms')$$,
    'bigint,bigint,bigint');
SELECT sec_test.allow('A.runner', 'a scan from a phone 40 days off is stored with its skew',
    $$INSERT INTO bucket_records (orchard_id, picker_id, scanned_by, scanned_at, quality_grade, clock_skew_ms)
      VALUES ({A}, {A.picker}, auth.uid(), now() - interval '20 minutes', 'A', 3456000000)$$);

-- ── 3. presence_today: solo gente de este huerto ───────────────────────────
SELECT sec_test.returns('A.runner', 'does not show a B-only person on leave',
    $$SELECT count(*)::text FROM presence_today({A}) WHERE picker_id = {B.leave_picker}$$, '0');
SELECT sec_test.returns('A.runner', 'does not show a B-only person working in B as "elsewhere"',
    $$SELECT count(*)::text FROM presence_today({A}) WHERE picker_id = {B.open_picker}$$, '0');
SELECT sec_test.returns('B.runner', 'B still sees its own person on leave',
    $$SELECT on_leave::text FROM presence_today({B}) WHERE picker_id = {B.leave_picker}$$, 'true');
SELECT sec_test.returns('A.runner', 'a person of B checked in here today is shown as present here',
    $$SELECT present::text FROM presence_today({A}) WHERE picker_id = {B.rotated_picker}$$, 'true');
SELECT sec_test.returns('B.runner', 'B sees its person working now in A as elsewhere',
    $$SELECT (elsewhere_orchard_id = {A})::text FROM presence_today({B}) WHERE picker_id = {B.rotated_picker}$$, 'true');
SELECT sec_test.returns('A.runner', 'a night shift opened yesterday and still open counts as present',
    $$SELECT (present AND since IS NOT NULL)::text FROM presence_today({A}) WHERE picker_id = {A.night_picker}$$, 'true');

SELECT sec_test.finish();
ROLLBACK;
