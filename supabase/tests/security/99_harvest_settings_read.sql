-- =============================================================================
-- harvest_settings: lectura (migraciones 20261027010000_harvest_settings_read_own_orchard
-- y 20261027050000_piece_rates_read_own_orchard)
-- Cada miembro activo lee la configuración de SU huerto; admin, nómina y RRHH
-- (con 2FA) la de todos los huertos. Lleva el precio por cubeta guardado: el
-- manager ya no lee la de otro huerto. No queda ninguna política de lectura abierta.
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- ── Su propio huerto: todos los roles activos ───────────────────────────────
SELECT sec_test.sees(w, 'reads own orchard settings',
    $$SELECT 1 FROM harvest_settings WHERE orchard_id = {A}$$, 1)
FROM unnest(ARRAY['A.manager', 'A.team_leader', 'A.runner', 'A.qc_inspector', 'A.logistics',
                  'A.hr_admin', 'A.payroll_admin', 'A.admin']) AS w;
SELECT sec_test.sees(w, 'reads own orchard settings',
    $$SELECT 1 FROM harvest_settings WHERE orchard_id = {B}$$, 1)
FROM unnest(ARRAY['B.team_leader', 'B.runner', 'B.qc_inspector', 'B.logistics']) AS w;

-- ── Otro huerto: solo los roles de empresa ──────────────────────────────────
SELECT sec_test.sees(w, 'cannot read another orchard''s settings',
    $$SELECT 1 FROM harvest_settings WHERE orchard_id = {B}$$, 0)
FROM unnest(ARRAY['A.manager', 'A.team_leader', 'A.runner', 'A.qc_inspector', 'A.logistics', 'A.team_leader2']) AS w;
SELECT sec_test.sees(w, 'cannot read another orchard''s settings',
    $$SELECT 1 FROM harvest_settings WHERE orchard_id = {A}$$, 0)
FROM unnest(ARRAY['B.manager', 'B.team_leader', 'B.runner', 'B.qc_inspector', 'B.logistics']) AS w;
SELECT sec_test.sees(w, 'sees no settings but its own orchard''s',
    $$SELECT 1 FROM harvest_settings WHERE orchard_id <> {A}$$, 0)
FROM unnest(ARRAY['A.runner', 'A.team_leader', 'A.manager']) AS w;
SELECT sec_test.sees(w, 'company role reads another orchard''s settings (company payroll)',
    $$SELECT 1 FROM harvest_settings WHERE orchard_id = {B}$$, 1)
FROM unnest(ARRAY['A.hr_admin', 'A.payroll_admin', 'A.admin']) AS w;

-- ── Sin sesión, de baja o sin 2FA ───────────────────────────────────────────
SELECT sec_test.sees(w, 'cannot read settings',
    $$SELECT 1 FROM harvest_settings WHERE orchard_id IN ({A}, {B})$$, 0)
FROM unnest(ARRAY['anon', 'A.inactive_manager', 'A.inactive_hr_admin', 'A.inactive_admin']) AS w;
SELECT sec_test.sees(w, 'without 2FA cannot read another orchard''s settings',
    $$SELECT 1 FROM harvest_settings WHERE orchard_id = {B}$$, 0)
FROM unnest(ARRAY['A.manager@aal1', 'A.payroll_admin@aal1', 'A.hr_admin@aal1', 'A.admin@aal1']) AS w;

-- ── Catálogo: no queda ninguna política de lectura abierta ──────────────────
SELECT sec_test.record(
    NOT EXISTS (SELECT 1 FROM pg_policies
                WHERE schemaname = 'public' AND tablename = 'harvest_settings'
                  AND policyname IN ('Users can read settings', 'settings_view_policy')),
    'harvest_settings: the old open read policies are gone', NULL);
SELECT sec_test.record(
    NOT EXISTS (SELECT 1 FROM pg_policies
                WHERE schemaname = 'public' AND tablename = 'harvest_settings'
                  AND permissive = 'PERMISSIVE' AND cmd IN ('SELECT', 'ALL')
                  AND (qual = 'true' OR qual ILIKE '%auth.uid() IS NOT NULL%')),
    'harvest_settings: no permissive read policy open to every session', NULL);

SELECT sec_test.finish();
ROLLBACK;
