-- ============================================================================
-- harvest_settings.meal_break_paid — make meal-break compensation configurable
-- Audit ref: harvest_nz/review/_sintesis.md §10 (Meal break deduction)
--            Wages Protection Act 1983 s.5 (no unauthorised deductions)
--            Employment Relations Act 2000 s.69ZD (meal-break entitlement)
--
-- Problem:
--   supabase/functions/calculate-payroll/index.ts unconditionally subtracts
--   0.5h from `hours_worked` for any shift > 4h. The inline comment claims
--   the break is "paid", but the code treats it as unpaid. Worse, there is
--   no per-orchard config: orchards whose Individual Employment Agreements
--   state the meal break is PAID are still having 30 min deducted from
--   every long shift — an unauthorised deduction under Wages Protection
--   Act 1983 s.5.
--
-- Fix:
--   Add `meal_break_paid BOOLEAN` to harvest_settings. DEFAULT true is
--   chosen deliberately:
--     - Under s.5 we cannot deduct without written consent. Absent an
--       explicit orchard-level setting, the legally safe interpretation
--       is "do not deduct" (= meal break paid).
--     - Orchards whose IEAs explicitly state an unpaid break can flip the
--       flag to false (Admin → Settings) to reinstate the deduction.
--     - This intentionally changes effective behaviour for any orchard
--       that had the implicit unpaid-deduction in place without a
--       matching IEA clause — those were already in violation.
--
-- NOT backfilled to false: doing so would perpetuate the violation.
-- Callers with a paid-break IEA get correct behaviour immediately; callers
-- with an unpaid-break IEA must set the flag explicitly per-orchard.
-- ============================================================================

ALTER TABLE public.harvest_settings
    ADD COLUMN IF NOT EXISTS meal_break_paid BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.harvest_settings.meal_break_paid IS
    'If true, the 30-min meal break is paid (no deduction from hours). If false, the break is unpaid and calculate-payroll subtracts 0.5h from shifts > 4h. Employment Relations Act 2000 s.69ZD defines the entitlement; Wages Protection Act 1983 s.5 requires an IEA clause before deducting. Default true is the legally safe fallback.';
