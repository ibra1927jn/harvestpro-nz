-- =============================================================================
-- Auditoría y bloqueo de cuentas (huecos encontrados por
-- supabase/tests/security/40_audit_auth.sql)
--
-- 1) audit_logs: "system_insert_audit_logs" era WITH CHECK (true) para todos,
--    también sin sesión: cualquiera podía escribir entradas falsas en nombre
--    de otra persona (p. ej. "timesheet_approved" por un manager) y con la
--    fecha que quisiera. Ahora cada usuario solo escribe entradas propias
--    (lo que hacen submit-audit-log y writeAudit) y la hora la pone el
--    servidor. Las funciones del servidor y los disparadores no cambian.
--    Leer: manager y ahora también admin (la pantalla Admin tiene el visor
--    de auditoría y no veía nada).
-- 2) account_locks: "system_insert_account_locks" dejaba a cualquiera, sin
--    sesión, bloquear la cuenta de otra persona (locked_by_system = true).
--    Los bloqueos los crea el disparador de login_attempts.
-- 3) Lectura de bloqueos e intentos: solo cuentas activas (manager / admin).
-- =============================================================================

-- 1) Auditoría
DROP POLICY IF EXISTS "system_insert_audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Users write own audit entries" ON public.audit_logs;
CREATE POLICY "Users write own audit entries" ON public.audit_logs FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "managers_view_audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Managers and admins read audit logs" ON public.audit_logs;
CREATE POLICY "Managers and admins read audit logs" ON public.audit_logs FOR SELECT TO authenticated
    USING (public.is_role(ARRAY['manager', 'admin']));

-- Hora del servidor para lo que llega desde una sesión de usuario
CREATE OR REPLACE FUNCTION public.audit_logs_server_time()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NOT NULL THEN
        NEW.created_at := now();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_server_time ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_server_time
    BEFORE INSERT ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.audit_logs_server_time();

-- 2) Bloqueos: solo el disparador (SECURITY DEFINER) los crea
DROP POLICY IF EXISTS "system_insert_account_locks" ON public.account_locks;

DROP POLICY IF EXISTS "managers_full_access_account_locks" ON public.account_locks;
CREATE POLICY "managers_full_access_account_locks" ON public.account_locks FOR ALL TO authenticated
    USING (public.is_role(ARRAY['manager', 'admin']))
    WITH CHECK (public.is_role(ARRAY['manager', 'admin']));

-- 3) Intentos de acceso: se registran sin sesión (antes de entrar); los leen
--    manager y admin activos
DROP POLICY IF EXISTS "managers_view_login_attempts" ON public.login_attempts;
CREATE POLICY "managers_view_login_attempts" ON public.login_attempts FOR SELECT TO authenticated
    USING (public.is_role(ARRAY['manager', 'admin']));
