-- ============================================================================
-- Remove '00000000-0000-0000-0000-000000000000' ghost user from public.users
-- Audit ref: AUDIT_2026_04_19_DEEP_REVIEW.md (ghost user) +
--            harvest_nz/review/_sintesis.md §11 misc items
--
-- Problem:
--   An archived fix-script `supabase/archive/fix_schema_divergence.sql`
--   inserted a synthetic "System" user with id = zero-uuid and
--   role = 'manager'. On environments where that script was applied,
--   this row is a privileged shadow account:
--     - It has `role = 'manager'`, so the `Users update own profile`
--       RLS policy treated anyone authenticating as this uuid as a
--       manager (pre-#14 fix).
--     - It has no matching auth.users row in principle — the FK would
--       forbid the insert today — but earlier schemas lacked the
--       constraint, so prod may hold an orphaned row.
--     - It complicates later FK additions and upsets RLS policies
--       that JOIN through public.users.id.
--
-- Fix:
--   Delete the row if present. Foreign keys across the schema are a
--   mix of `ON DELETE CASCADE`, `SET NULL`, `RESTRICT`, and no-action.
--   Nullable/cascading refs resolve cleanly. If a RESTRICT FK still
--   points at this id, the migration aborts — that is the correct
--   behaviour: an operator must decide what to do with the referencing
--   row (usually reassign created_by/recorded_by to NULL or to the
--   current admin user) before re-running.
-- ============================================================================

DO $$
DECLARE
    ghost_uuid CONSTANT UUID := '00000000-0000-0000-0000-000000000000';
    present BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM public.users WHERE id = ghost_uuid) INTO present;
    IF NOT present THEN
        RAISE NOTICE 'ghost user not present — nothing to do';
        RETURN;
    END IF;

    -- Proactively null-out the most common "actor" FKs that reference
    -- the ghost user. These columns are all nullable in the schema, so
    -- we're preserving the row but detaching it from the ghost. RESTRICT
    -- FKs (e.g. contracts.employee_id) will still block deletion if they
    -- exist — that's the intent: force operator review.
    UPDATE public.pickers         SET team_leader_id = NULL WHERE team_leader_id = ghost_uuid;
    UPDATE public.audit_logs      SET created_by     = NULL WHERE created_by     = ghost_uuid;
    UPDATE public.bucket_records  SET scanned_by     = NULL WHERE scanned_by     = ghost_uuid;

    DELETE FROM public.users WHERE id = ghost_uuid;

    RAISE NOTICE 'ghost user removed (role=manager, id=%)', ghost_uuid;
END $$;
