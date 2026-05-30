-- ============================================================================
-- Close open RLS policies on 10 tables (audit 2026-04-22 CRIT-1)
-- ============================================================================
-- Audit 2026-04-19 flagged 14 tables with fully-open RLS
-- (`FOR ALL USING(true) WITH CHECK(true)`).
-- Migration `2026030101_rls_consolidation.sql` closed 7 of them.
-- This migration closes the remaining 10:
--
--   From 20260227_rls_hierarchy_tables.sql (open policy "Managers can manage X"):
--     - harvest_seasons
--     - orchard_blocks
--     - block_rows
--
--   Created directly on the remote DB (open policy "Allow all for X"), no
--   schema in this repo — all DROP POLICY + ALTER TABLE + CREATE POLICY
--   statements on these 7 tables are guarded with `IF EXISTS` / pg_tables
--   lookups so the migration succeeds even if a table is missing locally:
--     - teams
--     - break_logs
--     - session_signatures
--     - bucket_runners
--     - tractor_fleet
--     - performance_metrics
--     - sync_queue
--
-- Postgres RLS permissive policies OR together, so we MUST drop the existing
-- open policy BEFORE creating the scoped replacements. All replacements target
-- `TO authenticated` (not `TO public`) and rely on the SECURITY DEFINER
-- helpers `is_manager()`, `is_role(text[])`, `get_auth_orchard_id()` created
-- in 20260217 / 2026030101.
--
-- Roles model (from schema_v3_consolidated.sql users.role CHECK):
--   admin, manager, team_leader, runner, qc_inspector, hr_admin,
--   payroll_admin, logistics
-- Note: `picker` is NOT a user role — pickers live in public.pickers and are
-- identified by picker_id (not auth.uid()). Picker-owned tables scope by the
-- picker's orchard via a JOIN to public.pickers.
-- ============================================================================
-- -----------------------------------------------------------------
-- 1. harvest_seasons
--    SELECT: any authenticated same-orchard user (seasons drive enrolments)
--    INSERT/UPDATE/DELETE: manager/admin only
-- -----------------------------------------------------------------
ALTER TABLE public.harvest_seasons ENABLE ROW LEVEL SECURITY;
-- Drop the two open policies installed by 20260227_rls_hierarchy_tables.sql
DROP POLICY IF EXISTS "Managers can manage seasons" ON public.harvest_seasons;
DROP POLICY IF EXISTS "Users can read seasons for their orchard" ON public.harvest_seasons;
CREATE POLICY "harvest_seasons_select" ON public.harvest_seasons FOR
SELECT TO authenticated USING (
        is_manager()
        OR orchard_id = get_auth_orchard_id()
    );
CREATE POLICY "harvest_seasons_insert" ON public.harvest_seasons FOR
INSERT TO authenticated WITH CHECK (is_manager());
CREATE POLICY "harvest_seasons_update" ON public.harvest_seasons FOR
UPDATE TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY "harvest_seasons_delete" ON public.harvest_seasons FOR DELETE TO authenticated USING (is_manager());
-- -----------------------------------------------------------------
-- 2. orchard_blocks
--    SELECT: any authenticated same-orchard user
--    INSERT/UPDATE/DELETE: manager/admin only
-- -----------------------------------------------------------------
ALTER TABLE public.orchard_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Managers can manage blocks" ON public.orchard_blocks;
DROP POLICY IF EXISTS "Users can read blocks" ON public.orchard_blocks;
CREATE POLICY "orchard_blocks_select" ON public.orchard_blocks FOR
SELECT TO authenticated USING (
        is_manager()
        OR orchard_id = get_auth_orchard_id()
    );
CREATE POLICY "orchard_blocks_insert" ON public.orchard_blocks FOR
INSERT TO authenticated WITH CHECK (is_manager());
CREATE POLICY "orchard_blocks_update" ON public.orchard_blocks FOR
UPDATE TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY "orchard_blocks_delete" ON public.orchard_blocks FOR DELETE TO authenticated USING (is_manager());
-- -----------------------------------------------------------------
-- 3. block_rows
--    block_rows has no orchard_id column; scope via parent orchard_blocks.
--    SELECT: same-orchard via block join
--    INSERT/UPDATE/DELETE: manager/admin only
-- -----------------------------------------------------------------
ALTER TABLE public.block_rows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Managers can manage rows" ON public.block_rows;
DROP POLICY IF EXISTS "Users can read rows" ON public.block_rows;
CREATE POLICY "block_rows_select" ON public.block_rows FOR
SELECT TO authenticated USING (
        is_manager()
        OR EXISTS (
            SELECT 1
            FROM public.orchard_blocks b
            WHERE b.id = block_rows.block_id
                AND b.orchard_id = get_auth_orchard_id()
        )
    );
CREATE POLICY "block_rows_insert" ON public.block_rows FOR
INSERT TO authenticated WITH CHECK (is_manager());
CREATE POLICY "block_rows_update" ON public.block_rows FOR
UPDATE TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY "block_rows_delete" ON public.block_rows FOR DELETE TO authenticated USING (is_manager());
-- ============================================================================
-- Tables without schema in this repo (exist on remote DB only).
-- Each block checks pg_tables so the migration doesn't explode locally.
-- ============================================================================
-- -----------------------------------------------------------------
-- 4. teams
--    SELECT: any authenticated same-orchard user
--    INSERT/UPDATE/DELETE: manager/admin/team_leader
-- -----------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'teams') THEN
        EXECUTE 'ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Allow all for teams" ON public.teams';
        EXECUTE 'DROP POLICY IF EXISTS "teams_select" ON public.teams';
        EXECUTE 'DROP POLICY IF EXISTS "teams_insert" ON public.teams';
        EXECUTE 'DROP POLICY IF EXISTS "teams_update" ON public.teams';
        EXECUTE 'DROP POLICY IF EXISTS "teams_delete" ON public.teams';
        EXECUTE $p$CREATE POLICY "teams_select" ON public.teams FOR SELECT TO authenticated
                   USING (is_manager() OR orchard_id = get_auth_orchard_id())$p$;
        EXECUTE $p$CREATE POLICY "teams_insert" ON public.teams FOR INSERT TO authenticated
                   WITH CHECK (is_role(ARRAY['manager','admin','team_leader']))$p$;
        EXECUTE $p$CREATE POLICY "teams_update" ON public.teams FOR UPDATE TO authenticated
                   USING (is_role(ARRAY['manager','admin','team_leader']))
                   WITH CHECK (is_role(ARRAY['manager','admin','team_leader']))$p$;
        EXECUTE $p$CREATE POLICY "teams_delete" ON public.teams FOR DELETE TO authenticated
                   USING (is_manager())$p$;
    END IF;
END $$;
-- -----------------------------------------------------------------
-- 5. break_logs
--    Immutable time log owned by a picker (picker_id -> public.pickers.id).
--    SELECT: manager/admin of same orchard, or the picker's team_leader
--    INSERT: manager/admin/team_leader (they log breaks on picker's behalf)
--    UPDATE/DELETE: none — append-only audit trail
-- -----------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'break_logs') THEN
        EXECUTE 'ALTER TABLE public.break_logs ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Allow all for break_logs" ON public.break_logs';
        EXECUTE 'DROP POLICY IF EXISTS "break_logs_select" ON public.break_logs';
        EXECUTE 'DROP POLICY IF EXISTS "break_logs_insert" ON public.break_logs';
        EXECUTE 'DROP POLICY IF EXISTS "break_logs_update" ON public.break_logs';
        EXECUTE 'DROP POLICY IF EXISTS "break_logs_delete" ON public.break_logs';
        EXECUTE $p$CREATE POLICY "break_logs_select" ON public.break_logs FOR SELECT TO authenticated
                   USING (
                       is_manager()
                       OR picker_id IN (
                           SELECT id FROM public.pickers
                           WHERE orchard_id = get_auth_orchard_id()
                       )
                   )$p$;
        EXECUTE $p$CREATE POLICY "break_logs_insert" ON public.break_logs FOR INSERT TO authenticated
                   WITH CHECK (is_role(ARRAY['manager','admin','team_leader']))$p$;
        -- Intentionally no UPDATE/DELETE policy: immutable log.
    END IF;
END $$;
-- -----------------------------------------------------------------
-- 6. session_signatures
--    Also immutable — signature of a work session by a picker.
--    SELECT: manager/admin of same orchard
--    INSERT: manager/admin/team_leader
--    UPDATE/DELETE: none
-- -----------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'session_signatures') THEN
        EXECUTE 'ALTER TABLE public.session_signatures ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Allow all for session_signatures" ON public.session_signatures';
        EXECUTE 'DROP POLICY IF EXISTS "session_signatures_select" ON public.session_signatures';
        EXECUTE 'DROP POLICY IF EXISTS "session_signatures_insert" ON public.session_signatures';
        EXECUTE 'DROP POLICY IF EXISTS "session_signatures_update" ON public.session_signatures';
        EXECUTE 'DROP POLICY IF EXISTS "session_signatures_delete" ON public.session_signatures';
        EXECUTE $p$CREATE POLICY "session_signatures_select" ON public.session_signatures FOR SELECT TO authenticated
                   USING (
                       is_manager()
                       OR picker_id IN (
                           SELECT id FROM public.pickers
                           WHERE orchard_id = get_auth_orchard_id()
                       )
                   )$p$;
        EXECUTE $p$CREATE POLICY "session_signatures_insert" ON public.session_signatures FOR INSERT TO authenticated
                   WITH CHECK (is_role(ARRAY['manager','admin','team_leader']))$p$;
        -- Intentionally no UPDATE/DELETE policy: immutable signature.
    END IF;
END $$;
-- -----------------------------------------------------------------
-- 7. bucket_runners
--    SELECT: same-orchard users (runners need to see assignments)
--    INSERT/UPDATE/DELETE: manager/admin/team_leader (assign/reassign crews)
-- -----------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bucket_runners') THEN
        EXECUTE 'ALTER TABLE public.bucket_runners ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Allow all for bucket_runners" ON public.bucket_runners';
        EXECUTE 'DROP POLICY IF EXISTS "bucket_runners_select" ON public.bucket_runners';
        EXECUTE 'DROP POLICY IF EXISTS "bucket_runners_insert" ON public.bucket_runners';
        EXECUTE 'DROP POLICY IF EXISTS "bucket_runners_update" ON public.bucket_runners';
        EXECUTE 'DROP POLICY IF EXISTS "bucket_runners_delete" ON public.bucket_runners';
        EXECUTE $p$CREATE POLICY "bucket_runners_select" ON public.bucket_runners FOR SELECT TO authenticated
                   USING (is_manager() OR orchard_id = get_auth_orchard_id())$p$;
        EXECUTE $p$CREATE POLICY "bucket_runners_insert" ON public.bucket_runners FOR INSERT TO authenticated
                   WITH CHECK (is_role(ARRAY['manager','admin','team_leader']))$p$;
        EXECUTE $p$CREATE POLICY "bucket_runners_update" ON public.bucket_runners FOR UPDATE TO authenticated
                   USING (is_role(ARRAY['manager','admin','team_leader']))
                   WITH CHECK (is_role(ARRAY['manager','admin','team_leader']))$p$;
        EXECUTE $p$CREATE POLICY "bucket_runners_delete" ON public.bucket_runners FOR DELETE TO authenticated
                   USING (is_manager())$p$;
    END IF;
END $$;
-- -----------------------------------------------------------------
-- 8. tractor_fleet
--    Shared fleet; all same-orchard users SELECT, only manager/admin write.
-- -----------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tractor_fleet') THEN
        EXECUTE 'ALTER TABLE public.tractor_fleet ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Allow all for tractor_fleet" ON public.tractor_fleet';
        EXECUTE 'DROP POLICY IF EXISTS "tractor_fleet_select" ON public.tractor_fleet';
        EXECUTE 'DROP POLICY IF EXISTS "tractor_fleet_insert" ON public.tractor_fleet';
        EXECUTE 'DROP POLICY IF EXISTS "tractor_fleet_update" ON public.tractor_fleet';
        EXECUTE 'DROP POLICY IF EXISTS "tractor_fleet_delete" ON public.tractor_fleet';
        EXECUTE $p$CREATE POLICY "tractor_fleet_select" ON public.tractor_fleet FOR SELECT TO authenticated
                   USING (is_manager() OR orchard_id = get_auth_orchard_id())$p$;
        EXECUTE $p$CREATE POLICY "tractor_fleet_insert" ON public.tractor_fleet FOR INSERT TO authenticated
                   WITH CHECK (is_role(ARRAY['manager','admin','logistics']))$p$;
        EXECUTE $p$CREATE POLICY "tractor_fleet_update" ON public.tractor_fleet FOR UPDATE TO authenticated
                   USING (is_role(ARRAY['manager','admin','logistics']))
                   WITH CHECK (is_role(ARRAY['manager','admin','logistics']))$p$;
        EXECUTE $p$CREATE POLICY "tractor_fleet_delete" ON public.tractor_fleet FOR DELETE TO authenticated
                   USING (is_manager())$p$;
    END IF;
END $$;
-- -----------------------------------------------------------------
-- 9. performance_metrics
--    System-computed metrics; regular users read-only (own + same-orchard for
--    managers), writes restricted to service_role (bypasses RLS) or admin.
-- -----------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'performance_metrics') THEN
        EXECUTE 'ALTER TABLE public.performance_metrics ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Allow all for performance_metrics" ON public.performance_metrics';
        EXECUTE 'DROP POLICY IF EXISTS "performance_metrics_select" ON public.performance_metrics';
        EXECUTE 'DROP POLICY IF EXISTS "performance_metrics_insert" ON public.performance_metrics';
        EXECUTE 'DROP POLICY IF EXISTS "performance_metrics_update" ON public.performance_metrics';
        EXECUTE 'DROP POLICY IF EXISTS "performance_metrics_delete" ON public.performance_metrics';
        EXECUTE $p$CREATE POLICY "performance_metrics_select" ON public.performance_metrics FOR SELECT TO authenticated
                   USING (
                       is_manager()
                       OR picker_id IN (
                           SELECT id FROM public.pickers
                           WHERE orchard_id = get_auth_orchard_id()
                       )
                   )$p$;
        -- Writes reserved to service_role (bypasses RLS) / admin. No INSERT
        -- or UPDATE policy for regular authenticated users.
        EXECUTE $p$CREATE POLICY "performance_metrics_admin_write" ON public.performance_metrics FOR ALL TO authenticated
                   USING (is_role(ARRAY['admin']))
                   WITH CHECK (is_role(ARRAY['admin']))$p$;
    END IF;
END $$;
-- -----------------------------------------------------------------
-- 10. sync_queue
--    Per-user offline sync queue. Strict owner-only, no cross-user access.
--    Assumes column user_id = auth.uid() (per audit + harvest convention).
-- -----------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sync_queue') THEN
        EXECUTE 'ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Allow all for sync_queue" ON public.sync_queue';
        EXECUTE 'DROP POLICY IF EXISTS "sync_queue_select" ON public.sync_queue';
        EXECUTE 'DROP POLICY IF EXISTS "sync_queue_insert" ON public.sync_queue';
        EXECUTE 'DROP POLICY IF EXISTS "sync_queue_update" ON public.sync_queue';
        EXECUTE 'DROP POLICY IF EXISTS "sync_queue_delete" ON public.sync_queue';
        EXECUTE $p$CREATE POLICY "sync_queue_select" ON public.sync_queue FOR SELECT TO authenticated
                   USING (user_id = auth.uid())$p$;
        EXECUTE $p$CREATE POLICY "sync_queue_insert" ON public.sync_queue FOR INSERT TO authenticated
                   WITH CHECK (user_id = auth.uid())$p$;
        EXECUTE $p$CREATE POLICY "sync_queue_update" ON public.sync_queue FOR UPDATE TO authenticated
                   USING (user_id = auth.uid())
                   WITH CHECK (user_id = auth.uid())$p$;
        EXECUTE $p$CREATE POLICY "sync_queue_delete" ON public.sync_queue FOR DELETE TO authenticated
                   USING (user_id = auth.uid())$p$;
    END IF;
END $$;
-- ============================================================================
-- END
-- ============================================================================
COMMENT ON SCHEMA public IS 'RLS open-policy cleanup 2026-04-22: all 14 originally-open tables now scoped. Audit 2026-04-22 CRIT-1 CLOSED.';
