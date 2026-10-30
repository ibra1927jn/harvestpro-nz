-- =============================================================================
-- piece_rates (precio por cubeta por día, huerto y variedad; auditoría 23-10 A4)
-- Lectura (decisión del dueño 2026-10-27, migración 20261027050000): cada uno
-- solo los precios de SU huerto (manager, team leader, runner, QC, logística);
-- admin, RRHH y nómina (con 2FA) los de todos los huertos. Escritura: manager de SU huerto y de hoy en adelante (no reescribe
-- el pasado); admin cualquier huerto y día. Nadie toca días de una semana de pago
-- cerrada. 2FA para roles privilegiados. variety_rates (obsoleta): el manager
-- solo escribe las de su huerto; las de la empresa (sin huerto), solo admin.
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- Precios de prueba: general y Braeburn de A hace 5 días, general de B hace 5 días,
-- uno de A en la semana cerrada (2020-01-06..12) y uno de A de hoy
INSERT INTO sec_test.ids VALUES
    ('A.rate_old', gen_random_uuid()), ('A.rate_old_v', gen_random_uuid()),
    ('B.rate_old', gen_random_uuid()), ('A.rate_closed', gen_random_uuid()), ('A.rate_today', gen_random_uuid());
INSERT INTO public.piece_rates (id, orchard_id, variety, effective_date, piece_rate) VALUES
    (sec_test.id_of('A.rate_old'), sec_test.id_of('A'), NULL, ((now() AT TIME ZONE 'Pacific/Auckland')::date - 5), 6.5),
    (sec_test.id_of('A.rate_old_v'), sec_test.id_of('A'), 'SecTest Braeburn', ((now() AT TIME ZONE 'Pacific/Auckland')::date - 5), 8.1),
    (sec_test.id_of('B.rate_old'), sec_test.id_of('B'), NULL, ((now() AT TIME ZONE 'Pacific/Auckland')::date - 5), 7),
    (sec_test.id_of('A.rate_closed'), sec_test.id_of('A'), 'SecTest Closed', DATE '2020-01-08', 5.5),
    (sec_test.id_of('A.rate_today'), sec_test.id_of('A'), 'SecTest Today', (now() AT TIME ZONE 'Pacific/Auckland')::date, 9);

-- ── Lectura ─────────────────────────────────────────────────────────────────
-- Su huerto: todos los roles activos
SELECT sec_test.sees(w, 'reads the piece rates of own orchard',
    $$SELECT 1 FROM piece_rates WHERE id IN ({A.rate_old}, {A.rate_old_v})$$, 2)
FROM unnest(ARRAY['A.manager', 'A.team_leader', 'A.team_leader2', 'A.runner', 'A.qc_inspector', 'A.logistics',
                  'A.hr_admin', 'A.payroll_admin', 'A.admin']) AS w;
SELECT sec_test.sees(w, 'reads the piece rates of own orchard',
    $$SELECT 1 FROM piece_rates WHERE id = {B.rate_old}$$, 1)
FROM unnest(ARRAY['B.manager', 'B.team_leader', 'B.runner', 'B.qc_inspector', 'B.logistics']) AS w;
-- Otro huerto: nadie salvo admin, RRHH y nómina
SELECT sec_test.sees(w, 'cannot read the piece rates of another orchard',
    $$SELECT 1 FROM piece_rates WHERE id = {B.rate_old}$$, 0)
FROM unnest(ARRAY['A.manager', 'A.team_leader', 'A.team_leader2', 'A.runner', 'A.qc_inspector', 'A.logistics']) AS w;
SELECT sec_test.sees(w, 'cannot read the piece rates of another orchard',
    $$SELECT 1 FROM piece_rates WHERE id IN ({A.rate_old}, {A.rate_old_v})$$, 0)
FROM unnest(ARRAY['B.manager', 'B.team_leader', 'B.runner', 'B.qc_inspector', 'B.logistics']) AS w;
SELECT sec_test.sees(w, 'sees no piece rate but its own orchard''s',
    $$SELECT 1 FROM piece_rates WHERE orchard_id <> {A}$$, 0)
FROM unnest(ARRAY['A.manager', 'A.team_leader', 'A.runner', 'A.qc_inspector', 'A.logistics']) AS w;
SELECT sec_test.sees(w, 'reads the piece rates of every orchard',
    $$SELECT 1 FROM piece_rates WHERE id IN ({A.rate_old}, {A.rate_old_v}, {B.rate_old})$$, 3)
FROM unnest(ARRAY['A.hr_admin', 'A.payroll_admin', 'A.admin', 'B.hr_admin', 'B.payroll_admin', 'B.admin']) AS w;
-- Lo que pinta el día: piece_rates_as_of respeta la misma regla (SECURITY INVOKER)
SELECT sec_test.returns(w, 'piece_rates_as_of gives nothing of another orchard',
    $$SELECT count(*)::text FROM piece_rates_as_of((now() AT TIME ZONE 'Pacific/Auckland')::date, ARRAY[{B}])$$, '0')
FROM unnest(ARRAY['A.manager', 'A.team_leader', 'A.runner', 'A.qc_inspector', 'A.logistics']) AS w;
SELECT sec_test.returns(w, 'piece_rates_as_of gives the other orchard''s prices',
    $$SELECT count(*)::text FROM piece_rates_as_of((now() AT TIME ZONE 'Pacific/Auckland')::date, ARRAY[{B}])
      WHERE id = {B.rate_old}$$, '1')
FROM unnest(ARRAY['A.hr_admin', 'A.payroll_admin', 'A.admin']) AS w;
SELECT sec_test.sees(w, 'cannot read piece rates', $$SELECT 1 FROM piece_rates WHERE id = {A.rate_old}$$, 0)
FROM unnest(ARRAY['anon', 'A.inactive_manager', 'A.inactive_hr_admin', 'A.inactive_admin']) AS w;
SELECT sec_test.sees(w, 'without 2FA cannot read piece rates', $$SELECT 1 FROM piece_rates WHERE id = {A.rate_old}$$, 0)
FROM unnest(ARRAY['A.manager@aal1', 'A.admin@aal1', 'A.payroll_admin@aal1', 'A.hr_admin@aal1']) AS w;
SELECT sec_test.sees(w, 'without 2FA cannot read another orchard''s piece rates',
    $$SELECT 1 FROM piece_rates WHERE id = {B.rate_old}$$, 0)
FROM unnest(ARRAY['A.admin@aal1', 'A.payroll_admin@aal1', 'A.hr_admin@aal1']) AS w;
-- Catálogo: no queda la política de lectura abierta a toda la empresa
SELECT sec_test.record(
    NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                AND tablename IN ('piece_rates', 'variety_rates')
                AND policyname IN ('Members read piece rates', 'Members read variety rates')),
    'piece_rates / variety_rates: the company-wide read policies are gone', NULL);
SELECT sec_test.returns('A.runner', 'piece_rates_as_of gives the last price of each variety up to a date',
    $$SELECT piece_rate::text FROM piece_rates_as_of((now() AT TIME ZONE 'Pacific/Auckland')::date, ARRAY[{A}])
      WHERE variety = 'SecTest Braeburn'$$, '8.10');
SELECT sec_test.returns('A.runner', 'piece_rates_as_of before the first price returns nothing for it',
    $$SELECT count(*)::text FROM piece_rates_as_of((now() AT TIME ZONE 'Pacific/Auckland')::date - 6, ARRAY[{A}])
      WHERE variety = 'SecTest Braeburn'$$, '0');
SELECT sec_test.deny('anon', 'cannot call piece_rates_as_of',
    $$SELECT * FROM piece_rates_as_of(current_date)$$);

-- ── Escritura: manager ──────────────────────────────────────────────────────
SELECT sec_test.allow('A.manager', 'sets today''s price of own orchard',
    $$INSERT INTO piece_rates (orchard_id, variety, effective_date, piece_rate)
      VALUES ({A}, 'SecTest Fuji', (now() AT TIME ZONE 'Pacific/Auckland')::date, 7.75)$$);
SELECT sec_test.allow('A.manager', 'changes today''s price of own orchard',
    $$UPDATE piece_rates SET piece_rate = 9.5 WHERE id = {A.rate_today}$$);
SELECT sec_test.allow('A.manager', 'removes today''s price of own orchard (the previous one applies again)',
    $$DELETE FROM piece_rates WHERE id = {A.rate_today}$$);
SELECT sec_test.deny('A.manager', 'cannot set a price for a past day (it would rewrite paid days)',
    $$INSERT INTO piece_rates (orchard_id, variety, effective_date, piece_rate)
      VALUES ({A}, 'SecTest Fuji', (now() AT TIME ZONE 'Pacific/Auckland')::date - 1, 7.75)$$);
SELECT sec_test.deny('A.manager', 'cannot change a past day''s price',
    $$UPDATE piece_rates SET piece_rate = 12 WHERE id = {A.rate_old}$$);
SELECT sec_test.deny('A.manager', 'cannot move a past price to today',
    $$UPDATE piece_rates SET effective_date = (now() AT TIME ZONE 'Pacific/Auckland')::date WHERE id = {A.rate_old}$$);
SELECT sec_test.deny('A.manager', 'cannot remove a past day''s price',
    $$DELETE FROM piece_rates WHERE id = {A.rate_old}$$);
SELECT sec_test.deny('A.manager', 'cannot move today''s price to a past day',
    $$UPDATE piece_rates SET effective_date = (now() AT TIME ZONE 'Pacific/Auckland')::date - 3 WHERE id = {A.rate_today}$$);
SELECT sec_test.deny('A.manager', 'cannot set the price of another orchard',
    $$INSERT INTO piece_rates (orchard_id, variety, effective_date, piece_rate)
      VALUES ({B}, NULL, (now() AT TIME ZONE 'Pacific/Auckland')::date, 9)$$);
SELECT sec_test.deny('A.manager', 'cannot move own price to another orchard',
    $$UPDATE piece_rates SET orchard_id = {B} WHERE id = {A.rate_today}$$);
SELECT sec_test.deny('A.manager@aal1', 'without 2FA cannot set prices',
    $$INSERT INTO piece_rates (orchard_id, variety, effective_date, piece_rate)
      VALUES ({A}, 'SecTest Fuji', (now() AT TIME ZONE 'Pacific/Auckland')::date, 7.75)$$);
SELECT sec_test.deny(w, 'cannot set prices',
    $$INSERT INTO piece_rates (orchard_id, variety, effective_date, piece_rate)
      VALUES ({A}, 'SecTest Fuji', (now() AT TIME ZONE 'Pacific/Auckland')::date, 7.75)$$)
FROM unnest(ARRAY['anon', 'A.team_leader', 'A.runner', 'A.qc_inspector', 'A.logistics',
                  'A.hr_admin', 'A.payroll_admin', 'A.inactive_manager']) AS w;
SELECT sec_test.deny(w, 'cannot change prices', $$UPDATE piece_rates SET piece_rate = 1 WHERE id = {A.rate_today}$$)
FROM unnest(ARRAY['A.team_leader', 'A.runner', 'A.hr_admin', 'A.payroll_admin', 'B.manager']) AS w;

-- ── Escritura: admin ────────────────────────────────────────────────────────
SELECT sec_test.allow('A.admin', 'corrects a past day of any orchard',
    $$UPDATE piece_rates SET piece_rate = 7.1 WHERE id = {B.rate_old}$$);
SELECT sec_test.allow('A.admin', 'sets a price on a past day of another orchard',
    $$INSERT INTO piece_rates (orchard_id, variety, effective_date, piece_rate)
      VALUES ({B}, 'SecTest Envy', (now() AT TIME ZONE 'Pacific/Auckland')::date - 2, 11.35)$$);
SELECT sec_test.deny('A.admin@aal1', 'without 2FA cannot set prices',
    $$UPDATE piece_rates SET piece_rate = 7.1 WHERE id = {B.rate_old}$$);

-- ── Semana de pago cerrada: congelada para todos ────────────────────────────
SELECT sec_test.deny('A.admin', 'cannot change the price of a day in a closed pay week',
    $$UPDATE piece_rates SET piece_rate = 9 WHERE id = {A.rate_closed}$$);
SELECT sec_test.deny('A.admin', 'cannot add a price in a closed pay week',
    $$INSERT INTO piece_rates (orchard_id, variety, effective_date, piece_rate)
      VALUES ({A}, 'SecTest Closed 2', DATE '2020-01-09', 9)$$);
SELECT sec_test.deny('A.admin', 'cannot remove a price of a closed pay week',
    $$DELETE FROM piece_rates WHERE id = {A.rate_closed}$$);
SELECT sec_test.deny('A.admin', 'cannot move a price into a closed pay week',
    $$UPDATE piece_rates SET effective_date = DATE '2020-01-10' WHERE id = {B.rate_old}$$);

-- ── Restricciones de la tabla ───────────────────────────────────────────────
SELECT sec_test.deny('A.manager', 'negative price is rejected',
    $$INSERT INTO piece_rates (orchard_id, variety, effective_date, piece_rate)
      VALUES ({A}, 'SecTest Neg', (now() AT TIME ZONE 'Pacific/Auckland')::date, -1)$$, ARRAY['23514']);
SELECT sec_test.deny('A.manager', 'blank variety is rejected (NULL is the general price)',
    $$INSERT INTO piece_rates (orchard_id, variety, effective_date, piece_rate)
      VALUES ({A}, '  ', (now() AT TIME ZONE 'Pacific/Auckland')::date, 7)$$, ARRAY['23514']);
SELECT sec_test.deny('A.admin', 'one price per orchard, variety (any case) and day',
    $$INSERT INTO piece_rates (orchard_id, variety, effective_date, piece_rate)
      VALUES ({A}, 'sectest braeburn', (now() AT TIME ZONE 'Pacific/Auckland')::date - 5, 8.2)$$, ARRAY['23505']);

-- ── Primer precio general de un huerto sin historial ────────────────────────
-- Queda el precio que tenía (harvest_settings.piece_rate) como general desde
-- siempre: los días anteriores no se recalculan con el precio nuevo
DO $$
BEGIN
    INSERT INTO sec_test.ids VALUES ('C', gen_random_uuid());
    INSERT INTO public.orchards (id, code, name) VALUES (sec_test.id_of('C'), 'SECTEST-C', 'SecTest Orchard C');
    INSERT INTO public.harvest_settings (orchard_id, piece_rate, min_wage_rate) VALUES (sec_test.id_of('C'), 6.25, 23.95);
    INSERT INTO public.piece_rates (orchard_id, variety, effective_date, piece_rate)
    VALUES (sec_test.id_of('C'), NULL, (now() AT TIME ZONE 'Pacific/Auckland')::date, 7.5);
END $$;
SELECT sec_test.record(
    COALESCE((SELECT piece_rate = 6.25 FROM public.piece_rates
              WHERE orchard_id = sec_test.id_of('C') AND variety IS NULL AND effective_date = DATE '2000-01-01'), false),
    'first general price of an orchard keeps the previous one for earlier days', NULL);
SELECT sec_test.record(
    (SELECT count(*) = 2 FROM public.piece_rates WHERE orchard_id = sec_test.id_of('C')),
    'the baseline is added only once', NULL);

-- ── variety_rates (obsoleta): el manager solo escribe las de su huerto ──────
SELECT sec_test.allow('A.manager', 'variety_rates: writes own orchard',
    $$INSERT INTO variety_rates (orchard_id, variety, piece_rate) VALUES ({A}, 'SecTest VR', 7)$$);
SELECT sec_test.deny('A.manager', 'variety_rates: cannot write another orchard',
    $$INSERT INTO variety_rates (orchard_id, variety, piece_rate) VALUES ({B}, 'SecTest VR', 7)$$);
SELECT sec_test.deny('A.manager', 'variety_rates: cannot write the company price (no orchard)',
    $$INSERT INTO variety_rates (orchard_id, variety, piece_rate) VALUES (NULL, 'SecTest VR', 7)$$);
SELECT sec_test.allow('A.admin', 'variety_rates: admin writes the company price',
    $$INSERT INTO variety_rates (orchard_id, variety, piece_rate) VALUES (NULL, 'SecTest VR co', 7)$$);
-- Lectura de variety_rates: igual que piece_rates; la de la empresa (sin huerto), solo admin, RRHH y nómina
DO $$
BEGIN
    INSERT INTO sec_test.ids VALUES ('A.vr', gen_random_uuid()), ('B.vr', gen_random_uuid()), ('co.vr', gen_random_uuid());
    INSERT INTO public.variety_rates (id, orchard_id, variety, piece_rate) VALUES
        (sec_test.id_of('A.vr'), sec_test.id_of('A'), 'SecTest VR read', 7),
        (sec_test.id_of('B.vr'), sec_test.id_of('B'), 'SecTest VR read', 8),
        (sec_test.id_of('co.vr'), NULL, 'SecTest VR read co', 9);
END $$;
SELECT sec_test.sees(w, 'variety_rates: reads only own orchard''s',
    $$SELECT 1 FROM variety_rates WHERE id IN ({A.vr}, {B.vr}, {co.vr})$$, 1)
FROM unnest(ARRAY['A.manager', 'A.team_leader', 'A.runner', 'A.qc_inspector', 'A.logistics', 'B.runner']) AS w;
SELECT sec_test.sees(w, 'variety_rates: cannot read another orchard''s',
    $$SELECT 1 FROM variety_rates WHERE id = {B.vr}$$, 0)
FROM unnest(ARRAY['A.manager', 'A.team_leader', 'A.runner', 'A.qc_inspector', 'A.logistics']) AS w;
SELECT sec_test.sees(w, 'variety_rates: reads every orchard''s and the company''s',
    $$SELECT 1 FROM variety_rates WHERE id IN ({A.vr}, {B.vr}, {co.vr})$$, 3)
FROM unnest(ARRAY['A.hr_admin', 'A.payroll_admin', 'A.admin']) AS w;

-- day_setups.piece_rate (precio del día): su huerto; admin, RRHH y nómina todos
SELECT sec_test.sees(w, 'day_setups: cannot read another orchard''s day price',
    $$SELECT 1 FROM day_setups WHERE orchard_id = {B}$$, 0)
FROM unnest(ARRAY['A.manager', 'A.team_leader', 'A.runner', 'A.qc_inspector', 'A.logistics']) AS w;
SELECT sec_test.sees(w, 'day_setups: reads every orchard''s day price',
    $$SELECT 1 FROM day_setups WHERE orchard_id = {B} LIMIT 1$$, 1)
FROM unnest(ARRAY['A.hr_admin', 'A.payroll_admin', 'A.admin']) AS w;

SELECT sec_test.deny('A.team_leader', 'variety_rates: cannot write',
    $$INSERT INTO variety_rates (orchard_id, variety, piece_rate) VALUES ({A}, 'SecTest VR', 7)$$);

SELECT sec_test.finish();
ROLLBACK;
