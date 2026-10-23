-- =============================================================================
-- Limpieza: tablas y vista muertas (auditoría 2026-10-23, docs/audits/2026-10-23-wiring/code-audit.md)
--
--   messages            → sustituida por chat_messages (nadie la lee ni escribe)
--   quality_inspections → sustituida por qc_inspections (sin políticas: siempre 0 filas)
--   wage_rates          → solo la usaba wage-rates.service.ts, muerto (columna effective_from inexistente)
--   sync_conflicts      → los conflictos van a Dexie (IndexedDB), nunca a la base
--   login_attempts,
--   account_locks       → el bloqueo por intentos se quitó; authHardening.service.ts estaba muerto
--   pickers_performance_today (vista) → filtraba users.role='picker' (no existe): siempre vacía
--
-- Comprobado antes: ninguna referencia en src/ ni en supabase/functions, sin
-- vistas, claves foráneas, triggers ni publicaciones que dependan de ellas, y
-- 0 filas en la base local. Se quitan también las funciones que solo servían a
-- login_attempts / account_locks, y health_check deja de contarlas.
-- =============================================================================

DROP VIEW IF EXISTS public.pickers_performance_today;

-- Funciones del bloqueo de cuentas por intentos fallidos (sin uso desde la app)
DROP FUNCTION IF EXISTS public.is_account_locked(text);
DROP FUNCTION IF EXISTS public.get_failed_login_count(text);
DROP FUNCTION IF EXISTS public.check_rate_limit(text);
DROP FUNCTION IF EXISTS public.unlock_account(text, text);
DROP FUNCTION IF EXISTS public.cleanup_old_login_attempts();
DROP FUNCTION IF EXISTS public.cleanup_old_account_locks();
DROP FUNCTION IF EXISTS public.lock_account_on_failures();

-- health_check: igual que antes, sin las dos tablas que desaparecen
CREATE OR REPLACE FUNCTION public.health_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    table_counts jsonb;
    rls_status jsonb;
BEGIN
    SELECT jsonb_build_object(
        'users', (SELECT count(*) FROM users),
        'contracts', (SELECT count(*) FROM contracts),
        'daily_attendance', (SELECT count(*) FROM daily_attendance),
        'bucket_records', (SELECT count(*) FROM bucket_records),
        'orchards', (SELECT count(*) FROM orchards),
        'audit_logs', (SELECT count(*) FROM audit_logs)
    ) INTO table_counts;

    SELECT jsonb_agg(jsonb_build_object('table', c.relname, 'rls_enabled', c.relrowsecurity))
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname IN ('users', 'contracts', 'daily_attendance', 'bucket_records', 'orchards', 'audit_logs')
    INTO rls_status;

    RETURN jsonb_build_object(
        'status', 'healthy',
        'timestamp', now(),
        'database', jsonb_build_object('connected', true, 'version', version()),
        'tables', table_counts,
        'rls', COALESCE(rls_status, '[]'::jsonb)
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('status', 'unhealthy', 'timestamp', now(), 'error', SQLERRM);
END;
$function$;

DROP TABLE IF EXISTS public.messages;
DROP TABLE IF EXISTS public.quality_inspections;
DROP TABLE IF EXISTS public.wage_rates;
DROP TABLE IF EXISTS public.sync_conflicts;
DROP TABLE IF EXISTS public.login_attempts;
DROP TABLE IF EXISTS public.account_locks;
