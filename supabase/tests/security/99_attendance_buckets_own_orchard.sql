-- =============================================================================
-- Fichajes y cubetas: el manager solo los de SU huerto (migración
-- 20261027070000_attendance_buckets_own_orchard, decisión del dueño 27-10):
--   · ni las filas de otro huerto, ni las de alguien que rota (parte del día en
--     su huerto y parte en otro), ni por presence_today, bucket_daily_grades
--     o la auditoría;
--   · admin, nómina y RRHH siguen leyendo toda la empresa;
--   · el TL sigue viendo a su equipo en otro huerto; cada uno, lo suyo.
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

DO $$
DECLARE
    v_id uuid;
    v_today date := (now() AT TIME ZONE 'Pacific/Auckland')::date;
BEGIN
    -- A.picker (equipo de A.team_leader) rota: hoy ya fichó en A ({A.att}) y
    -- ayer trabajó en B (fichaje cerrado y una cubeta)
    INSERT INTO public.daily_attendance (picker_id, orchard_id, date, check_in, check_out, status)
    VALUES (sec_test.id_of('A.picker'), sec_test.id_of('B'), v_today - 1,
            now() - interval '1 day 6 hours', now() - interval '1 day', 'present')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('B.att_rotating', v_id);
    INSERT INTO public.bucket_records (orchard_id, picker_id, scanned_by, scanned_at, quality_grade)
    VALUES (sec_test.id_of('B'), sec_test.id_of('A.picker'), sec_test.id_of('B.runner'), now() - interval '1 day 2 hours', 'A')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('B.bucket_rotating', v_id);
    -- y ahora: salió de A y tiene un tramo abierto en B (presence_today de A: «en otro huerto»)
    UPDATE public.daily_attendance SET check_out = now() - interval '40 minutes' WHERE id = sec_test.id_of('A.att');
    INSERT INTO public.daily_attendance (picker_id, orchard_id, date, check_in, status)
    VALUES (sec_test.id_of('A.picker'), sec_test.id_of('B'), v_today, now() - interval '30 minutes', 'present')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('B.att_rotating_open', v_id);

    -- Cubeta del propio runner de A (persona de campo) recogida en B
    INSERT INTO public.bucket_records (orchard_id, picker_id, scanned_by, scanned_at, quality_grade)
    VALUES (sec_test.id_of('B'), sec_test.id_of('A.runner'), sec_test.id_of('B.runner'), now() - interval '3 hours', 'A')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('B.bucket_of_A_runner', v_id);

    -- Cubeta borrada (corregida) en A
    INSERT INTO public.bucket_records (orchard_id, picker_id, scanned_by, scanned_at, quality_grade, deleted_at)
    VALUES (sec_test.id_of('A'), sec_test.id_of('A.picker'), sec_test.id_of('A.runner'), now() - interval '1 hour', 'A', now())
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.bucket_deleted', v_id);
END $$;

-- ── El manager: solo su huerto ──────────────────────────────────────────────
SELECT sec_test.sees('A.manager', 'reads attendance and buckets of own orchard',
    $$SELECT 1 FROM daily_attendance WHERE id IN ({A.att}, {A.att_rotated})
      UNION ALL SELECT 1 FROM bucket_records WHERE id IN ({A.bucket}, {A.bucket_deleted})$$, 4);
SELECT sec_test.sees('A.manager', 'does not read the other orchard part of a rotating picker''s day',
    $$SELECT 1 FROM daily_attendance WHERE id IN ({B.att_rotating}, {B.att_rotating_open})
      UNION ALL SELECT 1 FROM bucket_records WHERE id = {B.bucket_rotating}$$, 0);
SELECT sec_test.sees(w, 'reads no attendance row of another orchard',
    $$SELECT 1 FROM daily_attendance WHERE orchard_id IS DISTINCT FROM (SELECT orchard_id FROM users WHERE id = auth.uid())$$, 0)
FROM unnest(ARRAY['A.manager', 'B.manager']) AS w;
SELECT sec_test.sees(w, 'reads no bucket row of another orchard',
    $$SELECT 1 FROM bucket_records WHERE orchard_id IS DISTINCT FROM (SELECT orchard_id FROM users WHERE id = auth.uid())$$, 0)
FROM unnest(ARRAY['A.manager', 'B.manager']) AS w;
SELECT sec_test.sees('B.manager', 'does not read A rows (also a B picker''s shift in A)',
    $$SELECT 1 FROM daily_attendance WHERE id IN ({A.att}, {A.att_rotated})
      UNION ALL SELECT 1 FROM bucket_records WHERE id IN ({A.bucket}, {A.bucket_deleted})$$, 0);
SELECT sec_test.deny('A.manager', 'cannot call presence_today of another orchard',
    $$SELECT * FROM presence_today({B})$$);
SELECT sec_test.returns('A.manager', 'presence_today of own orchard says "elsewhere" with no time from there',
    $$SELECT (NOT present AND elsewhere_orchard_id = {B} AND since IS NULL)::text
      FROM presence_today({A}) WHERE picker_id = {A.picker}$$, 'true');
SELECT sec_test.returns('A.manager', 'bucket_daily_grades of another orchard is empty',
    $$SELECT count(*)::text FROM bucket_daily_grades({B}, now() - interval '7 days')$$, '0');
SELECT sec_test.sees('A.manager', 'reads no audit row of another orchard''s attendance or buckets',
    $$SELECT 1 FROM audit_logs WHERE table_name IN ('daily_attendance', 'bucket_records', 'piece_rates')
      AND (new_values->>'orchard_id' = {B}::text OR old_values->>'orchard_id' = {B}::text)$$, 0);
SELECT sec_test.allow('A.manager', 'still reads the audit of own orchard attendance',
    $$SELECT 1 FROM audit_logs WHERE table_name = 'daily_attendance' AND record_id = {A.att}$$);
SELECT sec_test.allow('A.manager', 'still reads other audit rows (not attendance, buckets or prices)',
    $$SELECT 1 FROM audit_logs WHERE id = {B.audit}$$);

-- ── Oficina de la empresa: todo ─────────────────────────────────────────────
SELECT sec_test.sees(w, 'the office reads every orchard (rotating day included)',
    $$SELECT 1 FROM daily_attendance WHERE id IN ({A.att}, {B.att_rotating})
      UNION ALL SELECT 1 FROM bucket_records WHERE id IN ({A.bucket}, {B.bucket_rotating})$$, 4)
FROM unnest(ARRAY['A.admin', 'A.hr_admin', 'A.payroll_admin', 'B.payroll_admin']) AS w;
SELECT sec_test.allow('A.admin', 'admin reads the audit of B attendance',
    $$SELECT 1 FROM audit_logs WHERE table_name = 'daily_attendance' AND record_id = {B.att_rotating}$$);
SELECT sec_test.returns('A.hr_admin', 'HR still sees presence of another orchard',
    $$SELECT count(*)::text FROM presence_today({B}) WHERE picker_id = {A.picker}$$, '1');

-- ── Team leader y la propia persona ─────────────────────────────────────────
SELECT sec_test.sees('A.team_leader', 'reads own team picker''s shift and bucket in another orchard',
    $$SELECT 1 FROM daily_attendance WHERE id = {B.att_rotating}
      UNION ALL SELECT 1 FROM bucket_records WHERE id = {B.bucket_rotating}$$, 2);
SELECT sec_test.sees('A.team_leader2', 'another team''s leader does not',
    $$SELECT 1 FROM daily_attendance WHERE id = {B.att_rotating}
      UNION ALL SELECT 1 FROM bucket_records WHERE id = {B.bucket_rotating}$$, 0);
SELECT sec_test.sees(w, 'reads no bucket of another orchard',
    $$SELECT 1 FROM bucket_records WHERE id IN ({B.bucket_rotating}, {B.bucket})$$, 0)
FROM unnest(ARRAY['A.qc_inspector', 'A.logistics', 'A.team_leader2']) AS w;
SELECT sec_test.sees('A.runner', 'reads own bucket picked in another orchard, not others there',
    $$SELECT 1 FROM bucket_records WHERE id IN ({B.bucket_of_A_runner}, {B.bucket_rotating}, {B.bucket})$$, 1);

-- ── Ninguna lectura de empresa para el manager queda en estas tablas ────────
SELECT sec_test.returns('A.manager', 'no SELECT policy uses can_read_company_payroll or is_manager',
    $$SELECT count(*)::text FROM pg_policies
      WHERE tablename IN ('daily_attendance', 'bucket_records') AND cmd IN ('SELECT', 'ALL')
        AND (qual ILIKE '%can_read_company_payroll%' OR qual ILIKE '%is_manager()%')$$, '0');

SELECT sec_test.finish();
ROLLBACK;
