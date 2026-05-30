-- ============================================================================
-- Lock down harvest_settings RLS — close the wage-theft vector
-- Audit ref: harvest_nz/review/_sintesis.md §11 (RLS USING(true) residual) +
--            payroll_compliance.md line 162-167
--
-- Problem:
--   `20260227_rls_hierarchy_tables.sql` left two permissive policies on
--   harvest_settings:
--     - "Users can read settings" FOR SELECT USING (true)
--     - "Managers can manage settings" FOR ALL USING (true) WITH CHECK (true)
--   Subsequent consolidation (2026030101_rls_consolidation.sql) added
--   scoped `settings_view_policy` / `settings_update_policy` but did NOT
--   drop the permissive ones — Postgres permissive policies OR together,
--   so the `FOR ALL USING(true)` still grants every authenticated user
--   full read + write, including UPDATE to `min_wage_rate` and
--   `piece_rate`. Any JWT = wage theft.
--
--   `Users can read settings USING(true)` additionally leaks the wage
--   rates of every other orchard in the system — a minor info
--   disclosure on top of the write vector.
--
-- Fix:
--   Drop the 20260227 permissive policies and rewrite the consolidated
--   ones to scope reads by orchard and to keep writes gated on
--   is_manager() within the caller's orchard. WITH CHECK enforces the
--   orchard scope on UPDATEs so a manager of orchard A can't write
--   orchard B's rates.
--
-- Note: also close the analogous INSERT path — harvest_settings rows are
-- created by the `provision-orchard` Edge Function under service_role,
-- which bypasses RLS, so the INSERT policy is intentionally restrictive
-- (admins only) for any direct client inserts.
-- ============================================================================

-- 1. Drop the permissive policies from 20260227_rls_hierarchy_tables.sql
--    and 20260101000000_schema_v3.sql (Read settings / Manage settings).
DROP POLICY IF EXISTS "Users can read settings" ON public.harvest_settings;
DROP POLICY IF EXISTS "Managers can manage settings" ON public.harvest_settings;
DROP POLICY IF EXISTS "Read settings" ON public.harvest_settings;
DROP POLICY IF EXISTS "Manage settings" ON public.harvest_settings;

-- 2. Drop the consolidated (but under-scoped) policies so we can
--    recreate them with orchard scoping.
DROP POLICY IF EXISTS "settings_view_policy" ON public.harvest_settings;
DROP POLICY IF EXISTS "settings_update_policy" ON public.harvest_settings;
DROP POLICY IF EXISTS "settings_insert_policy" ON public.harvest_settings;
DROP POLICY IF EXISTS "settings_delete_policy" ON public.harvest_settings;
DROP POLICY IF EXISTS "harvest_settings_select" ON public.harvest_settings;
DROP POLICY IF EXISTS "harvest_settings_insert" ON public.harvest_settings;
DROP POLICY IF EXISTS "harvest_settings_update" ON public.harvest_settings;
DROP POLICY IF EXISTS "harvest_settings_delete" ON public.harvest_settings;

-- 3. Recreate scoped policies.
-- SELECT: authenticated users in the same orchard + admin cross-orchard.
CREATE POLICY "harvest_settings_select" ON public.harvest_settings
    FOR SELECT TO authenticated
    USING (
        orchard_id = public.get_auth_orchard_id()
        OR public.get_auth_role() = 'admin'
    );

-- INSERT: admin only (normal provisioning happens via service_role in
-- the provision-orchard Edge Function, which bypasses RLS).
CREATE POLICY "harvest_settings_insert" ON public.harvest_settings
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_auth_role() = 'admin'
    );

-- UPDATE: manager within the caller's orchard, or admin anywhere. The
-- WITH CHECK mirrors USING so a manager cannot rewrite orchard_id to
-- reach another orchard's row.
CREATE POLICY "harvest_settings_update" ON public.harvest_settings
    FOR UPDATE TO authenticated
    USING (
        public.get_auth_role() = 'admin'
        OR (
            public.is_manager()
            AND orchard_id = public.get_auth_orchard_id()
        )
    )
    WITH CHECK (
        public.get_auth_role() = 'admin'
        OR (
            public.is_manager()
            AND orchard_id = public.get_auth_orchard_id()
        )
    );

-- DELETE: admin only. Orchards are typically soft-deleted elsewhere.
CREATE POLICY "harvest_settings_delete" ON public.harvest_settings
    FOR DELETE TO authenticated
    USING (public.get_auth_role() = 'admin');

COMMENT ON POLICY "harvest_settings_update" ON public.harvest_settings IS
    'Manager of the caller orchard can update rates; admin can update any orchard. WITH CHECK mirrors USING to block cross-orchard writes.';
