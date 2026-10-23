-- =============================================================================
-- Datos que deciden la paga: cubetas, fichajes, semanas de pago, tarifas,
-- configuración del día, cierres de día y contratos.
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- ── bucket_records (escaneos = paga a destajo) ──────────────────────────────
SELECT sec_test.sees('anon', 'cannot read bucket records', $$SELECT 1 FROM bucket_records$$, 0);
SELECT sec_test.sees('A.runner', 'reads own orchard bucket', $$SELECT 1 FROM bucket_records WHERE id = {A.bucket}$$, 1);
SELECT sec_test.sees('B.runner', 'cannot read other orchard bucket', $$SELECT 1 FROM bucket_records WHERE id = {A.bucket}$$, 0);
SELECT sec_test.sees('B.team_leader', 'cannot read other orchard bucket', $$SELECT 1 FROM bucket_records WHERE id = {A.bucket}$$, 0);
SELECT sec_test.sees('B.payroll_admin', 'reads company buckets (payroll)', $$SELECT 1 FROM bucket_records WHERE id = {A.bucket}$$, 1);

-- Alta: los que escanean (runner, jefe de equipo, manager, admin) en su huerto
SELECT sec_test.allow(w, 'scans a bucket in own orchard',
    $$INSERT INTO bucket_records (orchard_id, picker_id, scanned_by, quality_grade) VALUES ({A}, {A.picker}, auth.uid(), 'A')$$)
FROM unnest(ARRAY['A.runner', 'A.team_leader', 'A.manager']) AS w;
SELECT sec_test.deny(w, 'cannot create bucket records',
    $$INSERT INTO bucket_records (orchard_id, picker_id, scanned_by, quality_grade) VALUES ({A}, {A.picker}, auth.uid(), 'A')$$)
FROM unnest(ARRAY['anon', 'A.qc_inspector', 'A.logistics', 'A.hr_admin', 'A.payroll_admin', 'A.inactive_manager']) AS w;
SELECT sec_test.deny('B.runner', 'cannot scan into another orchard',
    $$INSERT INTO bucket_records (orchard_id, picker_id, scanned_by, quality_grade) VALUES ({A}, {A.picker}, auth.uid(), 'A')$$);
SELECT sec_test.deny('A.runner', 'cannot scan for an archived picker',
    $$INSERT INTO bucket_records (orchard_id, picker_id, scanned_by, quality_grade) VALUES ({A}, {A.archived_picker}, auth.uid(), 'A')$$);

-- Cambios: solo manager/admin del huerto
SELECT sec_test.allow('A.manager', 'corrects a bucket grade', $$UPDATE bucket_records SET quality_grade = 'B' WHERE id = {A.bucket}$$);
SELECT sec_test.allow('A.admin', 'corrects a bucket grade', $$UPDATE bucket_records SET quality_grade = 'B' WHERE id = {A.bucket}$$);
SELECT sec_test.deny(w, 'cannot edit bucket records', $$UPDATE bucket_records SET quality_grade = 'C' WHERE id = {A.bucket}$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'A.qc_inspector', 'A.logistics', 'A.hr_admin',
                  'A.payroll_admin', 'A.inactive_manager', 'B.manager', 'B.runner']) AS w;
SELECT sec_test.deny('A.runner', 'cannot reassign a bucket to another picker', $$UPDATE bucket_records SET picker_id = {A.archived_picker} WHERE id = {A.bucket}$$);
SELECT sec_test.deny('A.manager', 'cannot move a bucket to another orchard', $$UPDATE bucket_records SET orchard_id = {B} WHERE id = {A.bucket}$$);
SELECT sec_test.deny('A.manager', 'cannot edit a bucket of a closed day', $$UPDATE bucket_records SET quality_grade = 'C' WHERE id = {A.bucket_closed_day}$$);

SELECT sec_test.allow('A.manager', 'deletes a wrong scan', $$DELETE FROM bucket_records WHERE id = {A.bucket}$$);
SELECT sec_test.deny(w, 'cannot delete bucket records', $$DELETE FROM bucket_records WHERE id = {A.bucket}$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'A.qc_inspector', 'A.logistics', 'A.hr_admin',
                  'A.payroll_admin', 'B.manager']) AS w;
SELECT sec_test.deny('A.manager', 'cannot delete a bucket of a closed day', $$DELETE FROM bucket_records WHERE id = {A.bucket_closed_day}$$);

-- ── daily_attendance (fichajes = horas pagadas) ─────────────────────────────
SELECT sec_test.sees('anon', 'cannot read attendance', $$SELECT 1 FROM daily_attendance$$, 0);
SELECT sec_test.sees('B.runner', 'cannot read other orchard attendance', $$SELECT 1 FROM daily_attendance WHERE id = {A.att}$$, 0);
SELECT sec_test.sees('B.payroll_admin', 'reads company attendance (payroll)', $$SELECT 1 FROM daily_attendance WHERE id = {A.att}$$, 1);

SELECT sec_test.allow(w, 'checks in a picker of own orchard',
    $$INSERT INTO daily_attendance (picker_id, orchard_id, date, check_in, check_out, status)
      VALUES ({A.picker}, {A}, current_date - 3, now() - interval '3 days 8 hours', now() - interval '3 days', 'present')$$)
FROM unnest(ARRAY['A.team_leader', 'A.manager', 'A.hr_admin', 'A.admin']) AS w;
SELECT sec_test.deny(w, 'cannot create attendance',
    $$INSERT INTO daily_attendance (picker_id, orchard_id, date, check_in, check_out, status)
      VALUES ({A.picker}, {A}, current_date - 3, now() - interval '3 days 8 hours', now() - interval '3 days', 'present')$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.qc_inspector', 'A.logistics', 'A.payroll_admin', 'A.inactive_manager']) AS w;
SELECT sec_test.deny('A.team_leader', 'cannot create attendance in another orchard',
    $$INSERT INTO daily_attendance (picker_id, orchard_id, date, check_in, check_out, status)
      VALUES ({B.picker}, {B}, current_date - 3, now() - interval '3 days 8 hours', now() - interval '3 days', 'present')$$);
SELECT sec_test.deny('A.team_leader', 'cannot create own attendance (self-approval)',
    $$INSERT INTO daily_attendance (picker_id, orchard_id, date, check_in, check_out, status)
      VALUES ({A.team_leader}, {A}, current_date - 3, now() - interval '3 days 12 hours', now() - interval '3 days', 'present')$$);

SELECT sec_test.allow(w, 'corrects hours of a picker', $$UPDATE daily_attendance SET hours_worked = 7 WHERE id = {A.att}$$)
FROM unnest(ARRAY['A.team_leader', 'A.manager', 'A.hr_admin']) AS w;
SELECT sec_test.deny(w, 'cannot change hours', $$UPDATE daily_attendance SET hours_worked = 12 WHERE id = {A.att}$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.qc_inspector', 'A.logistics', 'A.payroll_admin', 'A.inactive_manager', 'B.runner']) AS w;
SELECT sec_test.deny('A.team_leader', 'cannot change own hours (self-approval)', $$UPDATE daily_attendance SET hours_worked = 12 WHERE id = {A.att_tl}$$);
SELECT sec_test.deny('A.team_leader', 'cannot verify own timesheet (self-approval)', $$UPDATE daily_attendance SET verified_by = auth.uid(), verified_at = now() WHERE id = {A.att_tl}$$);
SELECT sec_test.deny('A.team_leader', 'cannot delete own timesheet', $$DELETE FROM daily_attendance WHERE id = {A.att_tl}$$);
SELECT sec_test.allow('A.manager', 'corrects a team leader timesheet', $$UPDATE daily_attendance SET hours_worked = 7.5 WHERE id = {A.att_tl}$$);
SELECT sec_test.deny('A.manager', 'cannot change a timesheet of a closed pay week',
    $$UPDATE daily_attendance SET hours_worked = 9 WHERE id = {A.att_closed_week}$$, ARRAY['42501', 'P0001']);
-- manage-attendance cierra el turno abierto del huerto anterior con la clave de
-- servicio; con la sesión del team leader no se toca otro huerto (20261023011000)
SELECT sec_test.deny('B.team_leader', 'cannot close a shift of another orchard with own session',
    $$UPDATE daily_attendance SET check_out = now(), notes = 'Auto-closed' WHERE id = {A.att_rotated}$$);
SELECT sec_test.deny('B.team_leader', 'cannot move a timesheet to another orchard',
    $$UPDATE daily_attendance SET orchard_id = {B} WHERE id = {A.att_rotated}$$);
-- approve-timesheet (manager/admin)
SELECT sec_test.allow(w, 'approves a timesheet', $$UPDATE daily_attendance SET verified_by = auth.uid() WHERE id = {A.att}$$)
FROM unnest(ARRAY['A.manager', 'A.admin']) AS w;
SELECT sec_test.deny('A.runner', 'cannot delete attendance', $$DELETE FROM daily_attendance WHERE id = {A.att}$$);

-- RPCs antiguas de fichaje (SECURITY DEFINER, sin control de rol): solo servidor
SELECT sec_test.deny(w, 'cannot call check_in_picker()', $$SELECT check_in_picker({B.picker}, {B}, NULL)$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader']) AS w;
SELECT sec_test.deny(w, 'cannot call check_out_picker()', $$SELECT check_out_picker({A.att})$$)
FROM unnest(ARRAY['anon', 'A.runner']) AS w;
SELECT sec_test.deny(w, 'cannot call correct_attendance()', $$SELECT correct_attendance({A.att}, NULL, (now() + interval '6 hours')::text, 'x', NULL)$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader']) AS w;

-- ── pay_weeks (cierre de semana: solo Edge Function close-pay-week) ─────────
SELECT sec_test.sees(w, 'reads closed pay weeks', $$SELECT 1 FROM pay_weeks WHERE id = {payweek}$$, 1)
FROM unnest(ARRAY['A.payroll_admin', 'A.admin']) AS w;
SELECT sec_test.sees(w, 'cannot read pay weeks', $$SELECT 1 FROM pay_weeks WHERE id = {payweek}$$, 0)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'A.qc_inspector', 'A.logistics']) AS w;
SELECT sec_test.deny(w, 'cannot reopen a pay week directly', $$UPDATE pay_weeks SET status = 'reopened' WHERE id = {payweek}$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'A.manager', 'A.hr_admin', 'A.payroll_admin', 'A.admin']) AS w;
SELECT sec_test.deny(w, 'cannot close a pay week directly',
    $$INSERT INTO pay_weeks (week_start, week_end, status, snapshot) VALUES (DATE '2020-02-03', DATE '2020-02-09', 'closed', '{}')$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.manager', 'A.hr_admin', 'A.payroll_admin']) AS w;
SELECT sec_test.deny(w, 'cannot delete a pay week', $$DELETE FROM pay_weeks WHERE id = {payweek}$$)
FROM unnest(ARRAY['A.manager', 'A.payroll_admin', 'A.admin']) AS w;
-- close_payroll_period(): permitía cerrar a manager y hr_admin (regla: solo payroll/admin)
SELECT sec_test.deny(w, 'cannot call close_payroll_period()', $$SELECT close_payroll_period({A}, DATE '2020-01-06', DATE '2020-01-12')$$)
FROM unnest(ARRAY['anon', 'A.manager', 'A.hr_admin']) AS w;

-- ── Tarifas: wage_rates (por hora), variety_rates (a destajo), ajustes ───────
SELECT sec_test.allow(w, 'updates a wage rate', $$UPDATE wage_rates SET hourly_rate = 25 WHERE id = {A.wage}$$)
FROM unnest(ARRAY['A.manager', 'A.hr_admin', 'A.payroll_admin', 'A.admin']) AS w;
SELECT sec_test.deny(w, 'cannot change wage rates', $$UPDATE wage_rates SET hourly_rate = 99 WHERE id = {A.wage}$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'A.qc_inspector', 'A.logistics', 'A.inactive_manager', 'B.payroll_admin', 'B.manager']) AS w;
SELECT sec_test.deny('A.team_leader', 'cannot create a wage rate', $$INSERT INTO wage_rates (orchard_id, job_type, hourly_rate) VALUES ({A}, 'x', 99)$$);

SELECT sec_test.allow(w, 'updates a piece rate', $$UPDATE variety_rates SET piece_rate = 7.5 WHERE id = {A.vrate}$$)
FROM unnest(ARRAY['A.manager', 'A.admin']) AS w;
SELECT sec_test.deny(w, 'cannot change piece rates', $$UPDATE variety_rates SET piece_rate = 99 WHERE id = {A.vrate}$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'A.qc_inspector', 'A.logistics', 'A.payroll_admin', 'A.inactive_manager']) AS w;

SELECT sec_test.allow('A.manager', 'updates orchard piece rate', $$UPDATE harvest_settings SET piece_rate = 6.75 WHERE orchard_id = {A}$$);
-- Cambiar la tarifa queda auditado (el disparador fallaba en tablas sin columna id)
SELECT sec_test.allow('A.manager', 'piece rate change is written to the audit log', $q$
    DO $x$ BEGIN
        UPDATE harvest_settings SET piece_rate = 6.81 WHERE orchard_id = {A};
        IF NOT EXISTS (SELECT 1 FROM audit_logs WHERE table_name = 'harvest_settings'
                       AND record_id = {A} AND new_values ->> 'piece_rate' = '6.81') THEN
            RAISE EXCEPTION 'no audit entry for the piece rate change';
        END IF;
    END $x$$q$, 0);
SELECT sec_test.deny(w, 'cannot change orchard pay settings', $$UPDATE harvest_settings SET piece_rate = 99 WHERE orchard_id = {A}$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'A.qc_inspector', 'A.logistics', 'A.hr_admin', 'A.inactive_manager', 'B.manager']) AS w;

SELECT sec_test.allow('A.manager', 'updates the day setup', $$UPDATE day_setups SET piece_rate = 6.75 WHERE id = {A.setup}$$);
SELECT sec_test.allow('A.admin', 'creates a day setup', $$INSERT INTO day_setups (orchard_id, date, piece_rate) VALUES ({B}, current_date + 301, 6.5)$$);
SELECT sec_test.deny(w, 'cannot change the day piece rate', $$UPDATE day_setups SET piece_rate = 99 WHERE id = {A.setup}$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'A.qc_inspector', 'A.logistics', 'A.inactive_manager', 'B.manager']) AS w;
SELECT sec_test.deny('A.team_leader', 'cannot create a day setup', $$INSERT INTO day_setups (orchard_id, date, piece_rate) VALUES ({A}, current_date + 302, 99)$$);

-- ── day_closures (cerrar el día bloquea escaneos) ───────────────────────────
SELECT sec_test.allow('A.manager', 'closes a day in own orchard',
    $$INSERT INTO day_closures (orchard_id, date, status, closed_by, closed_at) VALUES ({A}, current_date + 400, 'closed', auth.uid(), now())$$);
SELECT sec_test.deny(w, 'cannot close a day',
    $$INSERT INTO day_closures (orchard_id, date, status, closed_by, closed_at) VALUES ({A}, current_date + 400, 'closed', auth.uid(), now())$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'A.qc_inspector', 'A.inactive_manager', 'B.manager']) AS w;
SELECT sec_test.deny(w, 'cannot reopen a closed day', $$UPDATE day_closures SET status = 'open' WHERE id = {A.closure}$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'B.manager']) AS w;

-- ── contracts (tarifa por hora del empleado) ────────────────────────────────
SELECT sec_test.sees('A.runner', 'reads own contract', $$SELECT 1 FROM contracts WHERE id = {A.contract}$$, 1);
SELECT sec_test.sees(w, 'cannot read someone else''s contract', $$SELECT 1 FROM contracts WHERE id = {A.contract}$$, 0)
FROM unnest(ARRAY['anon', 'A.runner2', 'A.team_leader', 'A.qc_inspector', 'A.logistics', 'B.runner']) AS w;
SELECT sec_test.allow(w, 'updates a contract rate', $$UPDATE contracts SET hourly_rate = 26 WHERE id = {A.contract}$$)
FROM unnest(ARRAY['A.hr_admin', 'B.hr_admin', 'A.admin']) AS w;
SELECT sec_test.deny(w, 'cannot change a contract rate', $$UPDATE contracts SET hourly_rate = 99 WHERE id = {A.contract}$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.team_leader', 'A.manager', 'A.payroll_admin', 'A.qc_inspector']) AS w;
SELECT sec_test.deny(w, 'cannot create a contract',
    $$INSERT INTO contracts (employee_id, orchard_id, type, start_date, hourly_rate) VALUES ({A.runner}, {A}, 'casual', current_date, 99)$$)
FROM unnest(ARRAY['A.runner', 'A.manager', 'A.team_leader']) AS w;

SELECT sec_test.finish();
ROLLBACK;
