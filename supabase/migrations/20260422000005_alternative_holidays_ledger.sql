-- ============================================================================
-- alternative_holidays ledger — persistent tracking of Holidays Act s.60 days
-- Audit ref: harvest_nz/review/_sintesis.md §3 (alt-holiday cross-period dedup)
--
-- Problem:
--   `supabase/functions/calculate-payroll/index.ts` counts alt-holidays owed
--   using a per-run `Set<string>` (intra-run dedup only). Nothing persists.
--   - Running payroll twice for overlapping date ranges reports the same
--     alt-day twice across runs; downstream aggregation double-counts.
--   - A payroll reprocess (same range, corrected input) also double-counts.
--   - There is no path to mark an alt-day as taken, so Holidays Act s.60
--     balances are not actually tracked.
--
-- Fix — part 1 (schema):
--   Persist one row per (picker_id, worked_on) and treat the payroll run
--   as idempotent through ON CONFLICT DO NOTHING. `taken_at` + `taken_on`
--   capture redemption, so a future "take alt-day" flow can mark a day
--   used without re-deriving from attendance.
--
-- Part 2 (application): calculate-payroll inserts into this ledger on
-- every run and reports outstanding-owed from `taken_at IS NULL` rather
-- than recomputing from attendance alone. See the function diff.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.alternative_holidays (
    picker_id    UUID         NOT NULL REFERENCES public.pickers(id) ON DELETE CASCADE,
    orchard_id   UUID         NOT NULL REFERENCES public.orchards(id) ON DELETE CASCADE,
    worked_on    DATE         NOT NULL,
    granted_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    granted_by   UUID         REFERENCES auth.users(id),
    taken_at     TIMESTAMPTZ,
    taken_on     DATE,
    notes        TEXT,
    PRIMARY KEY (picker_id, worked_on)
);

COMMENT ON TABLE public.alternative_holidays IS
    'Holidays Act 2003 s.60 alternative holiday ledger. One row per (picker, public-holiday date worked). Idempotent re-derivation via ON CONFLICT (picker_id, worked_on) DO NOTHING.';

COMMENT ON COLUMN public.alternative_holidays.taken_at IS
    'When the alt-day was redeemed (marked taken). NULL = outstanding balance.';
COMMENT ON COLUMN public.alternative_holidays.taken_on IS
    'The calendar date the picker took the alt-day off. NULL while outstanding.';

-- Fast lookup of outstanding balance per orchard.
CREATE INDEX IF NOT EXISTS idx_alt_holidays_orchard_outstanding
    ON public.alternative_holidays (orchard_id)
    WHERE taken_at IS NULL;

-- RLS: scoped by orchard. Read: picker's own record (via public.pickers),
-- or any authed user in the same orchard with an HR/payroll/admin role.
-- Write: admin/payroll_admin/hr_admin in the same orchard. Manager may
-- mark a day taken (UPDATE) but not insert new entries — those must come
-- from calculate-payroll (service_role) or admin.
ALTER TABLE public.alternative_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alt_holidays_select_same_orchard" ON public.alternative_holidays;
CREATE POLICY "alt_holidays_select_same_orchard"
    ON public.alternative_holidays FOR SELECT TO authenticated
    USING (
        orchard_id = public.get_auth_orchard_id()
        OR public.get_auth_role() = 'admin'
    );

DROP POLICY IF EXISTS "alt_holidays_insert_privileged" ON public.alternative_holidays;
CREATE POLICY "alt_holidays_insert_privileged"
    ON public.alternative_holidays FOR INSERT TO authenticated
    WITH CHECK (
        orchard_id = public.get_auth_orchard_id()
        AND public.get_auth_role() IN ('admin', 'payroll_admin', 'hr_admin')
    );

DROP POLICY IF EXISTS "alt_holidays_update_redeem" ON public.alternative_holidays;
CREATE POLICY "alt_holidays_update_redeem"
    ON public.alternative_holidays FOR UPDATE TO authenticated
    USING (
        orchard_id = public.get_auth_orchard_id()
        AND public.get_auth_role() IN ('admin', 'manager', 'payroll_admin', 'hr_admin')
    )
    WITH CHECK (
        orchard_id = public.get_auth_orchard_id()
    );
