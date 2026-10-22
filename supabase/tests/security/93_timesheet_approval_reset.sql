-- =============================================================================
-- A3 / B10: corregir un fichaje aprobado lo devuelve a pendiente (por cualquier
-- vía); review_timesheet no aprueba un turno abierto y no rechaza sin motivo
-- (20261023012000_timesheet_approval_reset).
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- A.att_tl (cerrado, de ayer) aprobado por nómina; A.att sigue abierto
UPDATE public.daily_attendance SET verified_by = sec_test.id_of('A.payroll_admin'), verified_at = now()
WHERE id = sec_test.id_of('A.att_tl');

-- ── Corregir quita la aprobación ────────────────────────────────────────────
SELECT sec_test.returns('A.manager', 'correcting the check-out of an approved timesheet clears the approval',
    $$UPDATE daily_attendance SET check_out = check_out + interval '1 hour' WHERE id = {A.att_tl}
      RETURNING (verified_by IS NULL AND verified_at IS NULL)::text$$, 'true');
SELECT sec_test.returns('A.manager', 'correcting the check-in clears the approval',
    $$UPDATE daily_attendance SET check_in = check_in - interval '30 minutes' WHERE id = {A.att_tl}
      RETURNING (verified_by IS NULL)::text$$, 'true');
SELECT sec_test.returns('A.manager', 'adding a break clears the approval',
    $$UPDATE daily_attendance SET break_start = check_in + interval '4 hours' WHERE id = {A.att_tl}
      RETURNING (verified_by IS NULL)::text$$, 'true');
SELECT sec_test.returns('A.manager', 'changing the paid hours clears the approval',
    $$UPDATE daily_attendance SET hours_worked = 9 WHERE id = {A.att_tl} RETURNING (verified_by IS NULL)::text$$, 'true');
SELECT sec_test.returns('A.manager', 'a note keeps the approval',
    $$UPDATE daily_attendance SET notes = 'seen' WHERE id = {A.att_tl} RETURNING (verified_by IS NOT NULL)::text$$, 'true');
-- La clave de servicio (manage-attendance) tampoco se lo salta
DO $$ BEGIN
    UPDATE public.daily_attendance SET check_out = check_out + interval '2 hours' WHERE id = sec_test.id_of('A.att_tl');
END $$;
SELECT sec_test.record((SELECT verified_by IS NULL FROM public.daily_attendance WHERE id = sec_test.id_of('A.att_tl')),
    'server: a correction with the service role also clears the approval', NULL);

-- ── review_timesheet ────────────────────────────────────────────────────────
SELECT sec_test.deny(w, 'cannot approve an open shift (no check-out)',
    $$SELECT review_timesheet({A.att}, 'approve')$$, ARRAY['22023'])
FROM unnest(ARRAY['A.payroll_admin', 'A.manager', 'A.admin']) AS w;
SELECT sec_test.returns('A.payroll_admin', 'approves a closed shift',
    $$SELECT (verified_by = auth.uid())::text FROM review_timesheet({A.att_tl}, 'approve')$$, 'true');
SELECT sec_test.returns('A.payroll_admin', 'can still reject an open shift (with a reason)',
    $$SELECT (rejected_by = auth.uid())::text FROM review_timesheet({A.att}, 'reject', 'No check-out')$$, 'true');
SELECT sec_test.deny('A.payroll_admin', 'cannot reject without a reason',
    $$SELECT review_timesheet({A.att_tl}, 'reject')$$, ARRAY['22023']);
SELECT sec_test.deny('A.payroll_admin', 'cannot reject with a blank reason',
    $$SELECT review_timesheet({A.att_tl}, 'reject', '   ')$$, ARRAY['22023']);
SELECT sec_test.deny('A.payroll_admin', 'cannot reject with a too short reason',
    $$SELECT review_timesheet({A.att_tl}, 'reject', 'no')$$, ARRAY['22023']);
SELECT sec_test.deny('A.payroll_admin', 'cannot reject with a reason over 200 characters',
    $$SELECT review_timesheet({A.att_tl}, 'reject', repeat('x', 201))$$, ARRAY['22023']);
-- Sin permiso sigue siendo 42501 (antes que el motivo)
SELECT sec_test.deny('A.team_leader', 'cannot reject (no permission, even without a reason)',
    $$SELECT review_timesheet({A.att_tl}, 'reject')$$);

SELECT sec_test.finish();
ROLLBACK;
