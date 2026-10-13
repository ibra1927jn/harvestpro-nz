-- =============================================================================
-- Aprobar / rechazar hojas de horas: public.review_timesheet (migración
-- 20261014001000). Nómina (payroll_admin) y admin en cualquier huerto;
-- manager en el suyo; quien revisa = quien llama; nunca lo propio; semana de
-- pago cerrada intocable; corregir un rechazo lo devuelve a pendiente.
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- El manager de A también ficha (persona de campo con fichaje propio)
DO $$
DECLARE v_id uuid;
BEGIN
    INSERT INTO public.pickers (id, picker_id, name, orchard_id, role, status)
    VALUES (sec_test.id_of('A.manager'), 'SECTEST-MGR', 'SecTest manager as picker', sec_test.id_of('A'), 'picker', 'active')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.daily_attendance (picker_id, orchard_id, date, check_in, check_out, status)
    VALUES (sec_test.id_of('A.manager'), sec_test.id_of('A'), (now() AT TIME ZONE 'Pacific/Auckland')::date - 2,
            now() - interval '2 days 8 hours', now() - interval '2 days', 'present')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.att_manager', v_id);
    -- Un fichaje ya rechazado por nómina
    UPDATE public.daily_attendance SET rejected_at = now(), rejected_by = sec_test.id_of('A.payroll_admin'),
        rejection_reason = 'SecTest rejected' WHERE id = sec_test.id_of('A.att');
END $$;

-- ── Quién puede ─────────────────────────────────────────────────────────────
SELECT sec_test.returns(w, 'approves a timesheet of ANY orchard and is the approver',
    $$SELECT (verified_by = auth.uid() AND rejected_by IS NULL)::text FROM review_timesheet({A.att}, 'approve')$$, 'true')
FROM unnest(ARRAY['A.payroll_admin', 'B.payroll_admin', 'A.admin', 'B.admin']) AS w;
SELECT sec_test.returns(w, 'rejects a timesheet of ANY orchard and is the rejecter',
    $$SELECT (rejected_by = auth.uid() AND verified_by IS NULL)::text FROM review_timesheet({B.att}, 'reject', 'fix check-out')$$, 'true')
FROM unnest(ARRAY['A.payroll_admin', 'B.payroll_admin']) AS w;
SELECT sec_test.returns('A.payroll_admin', 'reject keeps the reason',
    $$SELECT rejection_reason FROM review_timesheet({B.att}, 'reject', '  fix check-out  ')$$,
    'fix check-out');
SELECT sec_test.returns('A.manager', 'manager approves in own orchard',
    $$SELECT (verified_by = auth.uid())::text FROM review_timesheet({A.att}, 'approve')$$, 'true');
SELECT sec_test.deny('B.manager', 'manager cannot review another orchard',
    $$SELECT review_timesheet({A.att}, 'approve')$$);
SELECT sec_test.deny(w, 'cannot approve timesheets',
    $$SELECT review_timesheet({A.att}, 'approve')$$)
FROM unnest(ARRAY['A.team_leader', 'A.runner', 'A.qc_inspector', 'A.logistics', 'A.hr_admin', 'A.inactive_manager',
                  'A.payroll_admin@aal1', 'A.admin@aal1']) AS w;
SELECT sec_test.deny(w, 'cannot reject timesheets',
    $$SELECT review_timesheet({A.att}, 'reject')$$)
FROM unnest(ARRAY['A.team_leader', 'A.runner', 'A.hr_admin', 'A.payroll_admin@aal1']) AS w;
SELECT sec_test.deny('anon', 'cannot call review_timesheet', $$SELECT review_timesheet({A.att}, 'approve')$$);
SELECT sec_test.deny('A.manager', 'cannot approve own timesheet', $$SELECT review_timesheet({A.att_manager}, 'approve')$$);
SELECT sec_test.deny('A.payroll_admin', 'unknown decision is refused',
    $$SELECT review_timesheet({A.att}, 'delete')$$, ARRAY['22023']);

-- ── Semana de pago cerrada ──────────────────────────────────────────────────
SELECT sec_test.deny(w, 'cannot review a timesheet of a closed pay week',
    $$SELECT review_timesheet({A.att_closed_week}, d) FROM unnest(ARRAY['approve', 'reject']) d$$, ARRAY['P0001'])
FROM unnest(ARRAY['A.payroll_admin', 'A.admin', 'A.manager']) AS w;

-- ── Corregir un rechazo lo devuelve a pendiente ─────────────────────────────
SELECT sec_test.returns('A.team_leader', 'correcting a rejected timesheet clears the rejection',
    $$UPDATE daily_attendance SET check_out = check_in + interval '7 hours' WHERE id = {A.att}
      RETURNING (rejected_at IS NULL AND rejected_by IS NULL AND rejection_reason IS NULL)::text$$, 'true');
SELECT sec_test.returns('A.team_leader', 'a note on a rejected timesheet keeps the rejection',
    $$UPDATE daily_attendance SET notes = 'seen' WHERE id = {A.att} RETURNING (rejected_at IS NOT NULL)::text$$, 'true');

SELECT sec_test.finish();
ROLLBACK;
