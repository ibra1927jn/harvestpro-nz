-- ============================================================================
-- Prevent role self-escalation on public.users
-- Audit ref: audits/2026_04_22/02_rls_auth_security.md CRIT-7
--            harvest_nz/review/_sintesis.md §7 "Role escalation via sync processor"
--
-- Problem:
--   `Users update own profile` policy allows UPDATE on all columns when
--   `id = auth.uid()` or caller role in ('manager','admin'). Since `role`
--   is a column on public.users, this means:
--     - Any authenticated user can escalate their own role to 'admin' or
--       'manager' via a direct Supabase client update.
--     - A manager can change any user's role to 'admin', exceeding their
--       intended scope (managers should manage team data, not grant admin).
--
-- Fix:
--   BEFORE UPDATE trigger that rejects role changes unless the caller is
--   an admin or the query is running under the service_role key (Edge
--   Functions, server-side provisioning). SECURITY DEFINER so it can read
--   public.users to resolve the caller's current role independently of the
--   RLS policy being enforced on the UPDATE itself.
--
-- We do NOT narrow the existing RLS policy: legitimate self-updates
-- (full_name, phone, avatar_url, etc.) continue to work. The trigger is
-- orthogonal and column-specific.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_role TEXT;
    caller_jwt_role TEXT;
BEGIN
    -- Early-return when the role column is not changing (most UPDATEs).
    IF NEW.role IS NOT DISTINCT FROM OLD.role THEN
        RETURN NEW;
    END IF;

    -- Service-role (Edge Functions, Admin API, provision-orchard) bypasses
    -- the check: it is trusted by design and already gated at the function
    -- boundary.
    caller_jwt_role := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
    IF caller_jwt_role = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- Resolve caller's app-level role from public.users.
    SELECT role INTO caller_role FROM public.users WHERE id = auth.uid();

    IF caller_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION
            'Role change is restricted to admins (caller=%, attempted % -> %)',
            COALESCE(caller_role, '<anonymous>'), OLD.role, NEW.role
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_role_self_escalation() IS
    'BEFORE UPDATE OF role trigger guard: only admin (or service_role) may change public.users.role.';

DROP TRIGGER IF EXISTS users_prevent_role_escalation ON public.users;
CREATE TRIGGER users_prevent_role_escalation
    BEFORE UPDATE OF role ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_role_self_escalation();

-- Defense-in-depth: also narrow the existing UPDATE policy so a manager can
-- still update users in their orchard (e.g. full_name, phone) but the RLS
-- layer does not advertise a role-editing capability. Actual role change is
-- now gated by the trigger above.
DROP POLICY IF EXISTS "Users update own profile" ON public.users;
CREATE POLICY "Users update own profile" ON public.users
    FOR UPDATE TO authenticated
    USING (
        id = auth.uid()
        OR get_auth_role() = 'admin'
        OR (get_auth_role() = 'manager' AND orchard_id = get_auth_orchard_id())
    );
