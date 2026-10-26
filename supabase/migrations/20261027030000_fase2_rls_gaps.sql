-- =============================================================================
-- Fase 2 (seguridad): huecos que encontró la matriz de acceso
-- (supabase/tests/security/99_rls_matrix.sql, 99_rls_gaps_fase2.sql)
--
-- 1. day_closures: seguía la política de lectura de 20260210_day_closures,
--    "authenticated_select_day_closures" USING (auth.role() = 'authenticated'):
--    lo mismo que USING (true) para cualquier sesión. Cualquiera (también una
--    cuenta de baja con el token aún vivo, o alguien de otro huerto) leía los
--    cierres de todos los huertos, con sus totales de cubetas, coste y horas.
--    Queda "Read day closures" (su huerto) y "Managers close days" (admin).
--
-- 2. Cuentas de baja (A1): el token vale hasta 1 hora después de la baja. Estas
--    tablas no miraban si la cuenta sigue activa, porque solo comparan con
--    auth.uid(): el chat (leer y escribir en sus conversaciones, reacciones,
--    adjuntos y el canal en vivo chat:<id>), sus avisos push, el registro de
--    auditoría, el consentimiento de privacidad, y su propio contrato y sus
--    documentos de RRHH. Una restrictiva «solo cuentas activas» en cada una (y
--    en storage.objects), y can_use_chat_topic() también lo exige.
--    users no: la app necesita leer la propia fila para saber que está de baja.
--    allowed_registrations no: la persona invitada aún no tiene fila en users.
--
-- 3. leave_requests: runner, QC y logística leían todas las ausencias del
--    huerto, con el tipo (enfermedad, violencia doméstica…) y el motivo. Desde
--    20261024021000_attendance_privacy_presence ven «de permiso» con
--    presence_today() (SECURITY DEFINER), que no necesita esta lectura.
--
-- 4. bins: cualquiera del huerto (RRHH, nómina, QC) podía crear bins. Ahora:
--    runner (también sin red, cola BIN), logística, team leader, manager y admin.
--
-- 5. pickers: un team leader podía dar de alta a alguien en otro huerto (la
--    política solo miraba que el equipo fuera el suyo). Ahora, en su huerto.
--
-- 6. users: un manager podía cambiar el perfil (nombre, teléfono, foto, idioma)
--    de cualquier cuenta, también de admin, RRHH, nómina u otros managers. El
--    rol, la baja y el huerto ya los vigilaba guard_user_changes. Ahora el
--    manager edita su perfil y el del personal de campo (team leader, runner,
--    QC, logística), que es lo que hace la app (vincular personal, E5).
--
-- Funciones envueltas en (SELECT ...) (20261021000100_rls_initplan). No se toca
-- ninguna migración anterior.
-- =============================================================================

-- 1) day_closures ------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_select_day_closures" ON public.day_closures;

-- 2) Solo cuentas activas ----------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['audit_logs', 'conversations', 'chat_messages', 'chat_message_reactions',
                             'push_subscriptions', 'privacy_consent_log', 'contracts', 'hr_documents'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Active accounts only" ON public.%I', t);
        EXECUTE format(
            'CREATE POLICY "Active accounts only" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
            'USING ((SELECT public.is_active_member())) WITH CHECK ((SELECT public.is_active_member()))', t);
    END LOOP;
END $$;

-- Canal en vivo del chat (realtime.messages): participante, con 2FA y activo
CREATE OR REPLACE FUNCTION public.can_use_chat_topic(p_topic text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := (SELECT auth.uid());
BEGIN
    IF v_uid IS NULL OR p_topic IS NULL
       OR p_topic !~ '^chat:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN false;
    END IF;
    RETURN (SELECT public.mfa_satisfied())
        AND (SELECT public.is_active_member())
        AND EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = substr(p_topic, 6)::uuid
              AND v_uid::text = ANY (c.participant_ids)
        );
END;
$$;

-- Ficheros (adjuntos del chat, fotos, documentos): nada para una cuenta de baja.
-- Mismo texto en supabase/storage_policies.sql.
DO $$
BEGIN
    DROP POLICY IF EXISTS "Active accounts only" ON storage.objects;
    CREATE POLICY "Active accounts only" ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
        USING ((SELECT public.is_active_member()))
        WITH CHECK ((SELECT public.is_active_member()));
EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'storage.objects "Active accounts only" NOT created (no permission). Run scripts/apply-storage-policies.sh';
END $$;

-- 3) leave_requests: lectura sin runner, QC ni logística ----------------------
DROP POLICY IF EXISTS "Read leave requests" ON public.leave_requests;
CREATE POLICY "Read leave requests" ON public.leave_requests
    FOR SELECT TO authenticated
    USING (
        (
            orchard_id = (SELECT public.get_my_orchard_id())
            AND (SELECT public.is_role(ARRAY['manager', 'team_leader']))
        )
        OR (SELECT public.is_role(ARRAY['hr_admin', 'payroll_admin', 'admin']))
    );

-- 4) bins: quién crea ----------------------------------------------------------
DROP POLICY IF EXISTS "Runners insert bins" ON public.bins;
CREATE POLICY "Runners insert bins" ON public.bins
    FOR INSERT TO authenticated
    WITH CHECK (
        orchard_id = (SELECT public.get_my_orchard_id())
        AND (SELECT public.is_role(ARRAY['runner', 'logistics', 'team_leader', 'manager', 'admin']))
    );

-- 5) pickers: el team leader da de alta en su huerto ----------------------------
DROP POLICY IF EXISTS "Team leader adds to own team" ON public.pickers;
CREATE POLICY "Team leader adds to own team" ON public.pickers
    FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT public.is_role(ARRAY['team_leader']))
        AND team_leader_id = (SELECT auth.uid())
        AND orchard_id = (SELECT public.get_my_orchard_id())
        AND COALESCE(role, 'picker') = 'picker'
        AND COALESCE(status, 'active') = 'active'
        AND archived_at IS NULL
        AND deleted_at IS NULL
    );

-- 6) users: el manager edita su perfil y el del personal de campo ---------------
DROP POLICY IF EXISTS "Managers edit own profile and field staff" ON public.users;
CREATE POLICY "Managers edit own profile and field staff" ON public.users
    AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (
        id = (SELECT auth.uid())
        OR (SELECT public.get_auth_role()) IS DISTINCT FROM 'manager'
        OR role = ANY (ARRAY['team_leader', 'runner', 'qc_inspector', 'logistics'])
    )
    WITH CHECK (
        id = (SELECT auth.uid())
        OR (SELECT public.get_auth_role()) IS DISTINCT FROM 'manager'
        OR role = ANY (ARRAY['team_leader', 'runner', 'qc_inspector', 'logistics'])
    );
