-- =============================================================================
-- Comprobaciones del catálogo: valen para TODA tabla / función, también para
-- las que se creen en el futuro (así un fallo nuevo sale solo).
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- 1) Toda tabla de public tiene RLS activado
SELECT sec_test.record(c.relrowsecurity, 'catalog: RLS enabled on public.' || c.relname, 'RLS is OFF')
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
ORDER BY c.relname;

-- 2) Las vistas de public respetan el RLS de quien consulta (security_invoker)
SELECT sec_test.record(
    COALESCE('security_invoker=true' = ANY (c.reloptions), false)
        OR NOT has_table_privilege('anon', c.oid, 'select') AND NOT has_table_privilege('authenticated', c.oid, 'select'),
    'catalog: view public.' || c.relname || ' is security_invoker',
    'view runs as its owner and bypasses RLS')
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('v', 'm')
ORDER BY c.relname;

-- 3) Toda función SECURITY DEFINER fija search_path (si no, se puede secuestrar
--    con objetos en otro esquema)
SELECT sec_test.record(
    EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) cfg WHERE cfg LIKE 'search_path=%'),
    'catalog: SECURITY DEFINER ' || p.proname || '() sets search_path',
    'no SET search_path')
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
ORDER BY p.proname;

-- 4) Sin sesión (anon) solo se pueden llamar las funciones SECURITY DEFINER
--    necesarias antes de entrar y las que usan las políticas RLS.
SELECT sec_test.record(
    NOT has_function_privilege('anon', p.oid, 'execute')
        OR p.prorettype = 'trigger'::regtype
        OR p.proname = ANY (ARRAY[
            -- antes de iniciar sesión / registrarse
            'check_registration', 'is_account_locked', 'get_failed_login_count', 'check_rate_limit',
            -- usadas dentro de políticas RLS (devuelven NULL/false sin sesión)
            'is_role', 'is_manager', 'is_admin', 'is_manager_or_leader', 'is_logistics_or_manager',
            'is_hr_manager_or_admin', 'can_read_company_payroll', 'is_active_member',
            'get_my_orchard_id', 'get_auth_orchard_id', 'get_auth_role', 'is_pay_day_closed', 'mfa_satisfied']),
    'catalog: anon cannot execute SECURITY DEFINER ' || p.proname || '()',
    'anon has EXECUTE')
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
ORDER BY p.proname;

-- 5) Funciones de mantenimiento / heredadas: solo el servidor (service_role)
SELECT sec_test.record(
    NOT has_function_privilege('authenticated', p.oid, 'execute'),
    'catalog: authenticated cannot execute ' || p.proname || '()',
    'any signed-in user can run it')
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('check_in_picker', 'check_out_picker', 'correct_attendance', 'get_record_audit_trail',
                    'cleanup_old_audit_logs', 'cleanup_old_account_locks', 'cleanup_old_login_attempts',
                    'close_payroll_period', 'health_check')
ORDER BY p.proname;

-- 6) Una política PERMISSIVE se suma (OR) a las demás: una que se llame
--    "no_..." / "Block ..." pensada para RESTRINGIR en realidad abre la tabla.
SELECT sec_test.record(false,
    'catalog: restriction policy "' || policyname || '" on ' || tablename || ' is RESTRICTIVE',
    'it is PERMISSIVE, so it GRANTS access instead of restricting it')
FROM pg_policies
WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
  AND (policyname ILIKE 'no\_%' OR policyname ILIKE 'block %' OR policyname ILIKE 'deny%');

-- 7) Ninguna política de escritura abierta del todo (true) salvo las previstas
SELECT sec_test.record(false,
    'catalog: write policy "' || policyname || '" on ' || tablename || ' is not open to everyone',
    cmd || ' with ' || COALESCE('USING ' || qual, '') || COALESCE(' CHECK ' || with_check, ''))
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  AND (COALESCE(with_check, qual) = 'true' OR qual = 'true')
  -- intentos de acceso: se registran antes de tener sesión
  AND NOT (tablename = 'login_attempts' AND cmd = 'INSERT');

-- 8) 2FA en el servidor: toda tabla de public lleva la política RESTRICTIVE
--    "Require 2FA for privileged roles" (también las que se creen después;
--    si no, una cuenta privilegiada sin código la leería)
SELECT sec_test.record(
    EXISTS (SELECT 1 FROM pg_policies p
            WHERE p.schemaname = 'public' AND p.tablename = c.relname
              AND p.permissive = 'RESTRICTIVE' AND p.policyname LIKE 'Require 2FA for privileged roles%'
              AND (p.qual LIKE '%mfa_satisfied()%' OR p.with_check LIKE '%mfa_satisfied()%')),
    'catalog: public.' || c.relname || ' requires 2FA for privileged roles',
    'no RESTRICTIVE mfa_satisfied() policy: run the loop of 20261014000000_server_side_mfa.sql for it')
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
ORDER BY c.relname;

SELECT sec_test.record(true, 'catalog: scan finished', NULL);

SELECT sec_test.finish();
ROLLBACK;
