-- =============================================================================
-- Funciones SECURITY DEFINER: quién puede llamarlas y con qué rol
-- (huecos encontrados por supabase/tests/security, ver scripts/test-db-security.sh)
--
-- 1) Las comprobaciones de rol (is_role, is_manager…) no miraban si la cuenta
--    está activa: un manager dado de baja seguía con todos sus permisos.
--    Además devolvían NULL sin sesión, y `IF NOT is_role(...)` con NULL no
--    entra: sin sesión (clave anon, pública) se podía llamar a
--    setup_orchard_atomic() y crear huertos.
-- 2) Funciones antiguas sin control de rol y sin search_path, que cualquiera
--    (incluso sin sesión) podía llamar: check_in_picker / check_out_picker
--    (crear o cerrar fichajes de cualquier persona de cualquier huerto),
--    correct_attendance, get_record_audit_trail (leer la auditoría),
--    cleanup_old_* (borrar auditoría / registros de seguridad),
--    close_payroll_period (dejaba cerrar a manager y hr_admin) y health_check
--    (recuentos de todas las tablas). La app no usa ninguna: solo servidor.
-- 3) unlock_account tenía search_path vacío y tablas sin esquema: fallaba
--    siempre ("relation users does not exist").
-- 4) El disparador de auditoría usaba NEW.id y fallaba en tablas sin id
--    (harvest_settings): los cambios de tarifa no quedaban auditados.
-- =============================================================================

-- 1) Comprobaciones de rol: solo cuentas activas; nunca NULL
CREATE OR REPLACE FUNCTION public.is_role(allowed_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE((SELECT role = ANY (allowed_roles) FROM public.users
                     WHERE id = auth.uid() AND is_active), false);
$$;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE((SELECT role IN ('manager', 'admin') FROM public.users
                     WHERE id = auth.uid() AND is_active), false);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_leader()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.users
                   WHERE id = auth.uid() AND is_active AND role IN ('manager', 'team_leader'));
$$;

CREATE OR REPLACE FUNCTION public.is_logistics_or_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.users
                   WHERE id = auth.uid() AND is_active AND role IN ('manager', 'logistics', 'admin'));
$$;

CREATE OR REPLACE FUNCTION public.is_hr_manager_or_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.users
                   WHERE id = auth.uid() AND is_active AND role IN ('manager', 'hr_admin', 'admin'));
$$;

-- Rol de la sesión (políticas de users): sin rol si la cuenta está de baja
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT role FROM public.users WHERE id = auth.uid() AND is_active;
$$;

-- 2) Funciones antiguas / de mantenimiento: solo el servidor (service_role)
ALTER FUNCTION public.check_in_picker(uuid, uuid, uuid) SET search_path = public;
ALTER FUNCTION public.check_out_picker(uuid) SET search_path = public;
ALTER FUNCTION public.correct_attendance(uuid, text, text, text, uuid) SET search_path = public;
ALTER FUNCTION public.get_record_audit_trail(text, uuid) SET search_path = public;
ALTER FUNCTION public.cleanup_old_audit_logs() SET search_path = public;

REVOKE EXECUTE ON FUNCTION
    public.check_in_picker(uuid, uuid, uuid),
    public.check_out_picker(uuid),
    public.correct_attendance(uuid, text, text, text, uuid),
    public.get_record_audit_trail(text, uuid),
    public.cleanup_old_audit_logs(),
    public.cleanup_old_account_locks(),
    public.cleanup_old_login_attempts(),
    public.close_payroll_period(uuid, date, date),
    public.health_check()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
    public.check_in_picker(uuid, uuid, uuid),
    public.check_out_picker(uuid),
    public.correct_attendance(uuid, text, text, text, uuid),
    public.get_record_audit_trail(text, uuid),
    public.cleanup_old_audit_logs(),
    public.cleanup_old_account_locks(),
    public.cleanup_old_login_attempts(),
    public.close_payroll_period(uuid, date, date),
    public.health_check()
TO service_role;

-- Funciones de la app que exigen sesión: fuera de anon
REVOKE EXECUTE ON FUNCTION
    public.acknowledge_broadcast(uuid),
    public.mark_conversation_read(uuid),
    public.my_unread_counts(),
    public.setup_orchard_atomic(text, text, text, integer, text, numeric, text, numeric),
    public.unlock_account(text, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
    public.acknowledge_broadcast(uuid),
    public.mark_conversation_read(uuid),
    public.my_unread_counts(),
    public.setup_orchard_atomic(text, text, text, integer, text, numeric, text, numeric),
    public.unlock_account(text, text)
TO authenticated, service_role;

-- 3) Desbloquear una cuenta (pantalla de seguridad del manager)
CREATE OR REPLACE FUNCTION public.unlock_account(target_email text, unlock_reason_text text DEFAULT 'Unlocked by manager')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    lock_record RECORD;
BEGIN
    IF NOT public.is_role(ARRAY['manager', 'admin']) THEN
        RAISE EXCEPTION 'Only managers can unlock accounts' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO lock_record
    FROM public.account_locks
    WHERE email = target_email AND locked_until > now() AND unlocked_at IS NULL
    ORDER BY locked_at DESC
    LIMIT 1;
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    UPDATE public.account_locks
    SET unlocked_at = now(), unlocked_by = auth.uid(), unlock_reason = unlock_reason_text
    WHERE id = lock_record.id;

    -- Borrar los fallos recientes para que no se vuelva a bloquear al momento
    DELETE FROM public.login_attempts
    WHERE email = target_email AND success = false AND attempt_time > now() - interval '15 minutes';

    INSERT INTO public.audit_logs (user_id, user_email, action, table_name, record_id, new_values)
    VALUES (auth.uid(), target_email, 'CUSTOM', 'account_locks', lock_record.id,
            jsonb_build_object('event', 'manual_unlock', 'locked_user_id', lock_record.user_id,
                               'reason', unlock_reason_text));
    RETURN true;
END;
$$;

-- 4) Auditoría automática: el id del registro sin exigir columna id
CREATE OR REPLACE FUNCTION public.log_audit_trail()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row jsonb := to_jsonb(COALESCE(NEW, OLD));
    v_email text;
    v_record uuid;
BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
    -- id del registro; en tablas por huerto sin id (harvest_settings) el huerto
    BEGIN
        v_record := COALESCE(v_row ->> 'id', v_row ->> 'orchard_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
        v_record := NULL;
    END;

    INSERT INTO public.audit_logs (user_id, user_email, action, table_name, record_id, old_values, new_values)
    VALUES (
        auth.uid(), v_email, TG_OP, TG_TABLE_NAME, v_record,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
    );
    RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
    -- La auditoría no debe impedir el cambio
    RAISE WARNING 'Audit logging failed: %', SQLERRM;
    RETURN COALESCE(NEW, OLD);
END;
$$;
