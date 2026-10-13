-- =============================================================================
-- Seguridad: cerrar permisos demasiado abiertos
--
-- 1) Ajustes de pago, temporadas, bloques y filas: había políticas
--    "ALL true" que dejaban a cualquier usuario con sesión cambiarlos en
--    cualquier huerto. Se quitan; quedan las que exigen admin o manager del
--    propio huerto. La lectura no cambia.
-- 2) Chat: se podía escribir en una conversación sin ser participante.
-- 3) Usuarios:
--    - cualquiera podía crear un perfil con el rol que quisiera;
--    - cualquiera podía cambiarse su propio rol (hacerse admin);
--    - un manager podía cambiar el rol de cualquiera.
--    Ahora un disparador controla rol, estado activo y huerto.
-- 4) Invitaciones: cualquier usuario veía todos los emails invitados.
-- 5) Crear huertos: solo admin.
-- =============================================================================

-- 1) Configuración del huerto
DROP POLICY IF EXISTS "Managers can manage settings" ON public.harvest_settings;
DROP POLICY IF EXISTS "settings_update_policy" ON public.harvest_settings;
DROP POLICY IF EXISTS "Managers can manage seasons" ON public.harvest_seasons;
DROP POLICY IF EXISTS "Managers can manage blocks" ON public.orchard_blocks;
DROP POLICY IF EXISTS "Managers can manage rows" ON public.block_rows;

-- Admin gestiona la configuración de cualquier huerto (crea huertos nuevos)
DROP POLICY IF EXISTS "Admin manages settings" ON public.harvest_settings;
CREATE POLICY "Admin manages settings" ON public.harvest_settings FOR ALL TO authenticated
    USING (public.is_role(ARRAY['admin'])) WITH CHECK (public.is_role(ARRAY['admin']));

-- "Manage settings/seasons/blocks/rows" (manager o admin del propio huerto)
-- no tenían WITH CHECK explícito: se rehacen para que tampoco se pueda
-- mover un registro a otro huerto.
DROP POLICY IF EXISTS "Manage settings" ON public.harvest_settings;
CREATE POLICY "Manage settings" ON public.harvest_settings FOR ALL TO authenticated
    USING (orchard_id = public.get_my_orchard_id() AND public.is_role(ARRAY['manager', 'admin']))
    WITH CHECK (orchard_id = public.get_my_orchard_id() AND public.is_role(ARRAY['manager', 'admin']));

DROP POLICY IF EXISTS "Manage seasons" ON public.harvest_seasons;
CREATE POLICY "Manage seasons" ON public.harvest_seasons FOR ALL TO authenticated
    USING (orchard_id = public.get_my_orchard_id() AND public.is_role(ARRAY['manager', 'admin']))
    WITH CHECK (orchard_id = public.get_my_orchard_id() AND public.is_role(ARRAY['manager', 'admin']));

DROP POLICY IF EXISTS "Manage blocks" ON public.orchard_blocks;
CREATE POLICY "Manage blocks" ON public.orchard_blocks FOR ALL TO authenticated
    USING (orchard_id = public.get_my_orchard_id() AND public.is_role(ARRAY['manager', 'admin']))
    WITH CHECK (orchard_id = public.get_my_orchard_id() AND public.is_role(ARRAY['manager', 'admin']));

DROP POLICY IF EXISTS "Manage rows" ON public.block_rows;
CREATE POLICY "Manage rows" ON public.block_rows FOR ALL TO authenticated
    USING (public.is_role(ARRAY['manager', 'admin']) AND EXISTS (
        SELECT 1 FROM public.orchard_blocks ob
        WHERE ob.id = block_rows.block_id AND ob.orchard_id = public.get_my_orchard_id()))
    WITH CHECK (public.is_role(ARRAY['manager', 'admin']) AND EXISTS (
        SELECT 1 FROM public.orchard_blocks ob
        WHERE ob.id = block_rows.block_id AND ob.orchard_id = public.get_my_orchard_id()));

-- 2) Solo los participantes escriben en una conversación
DROP POLICY IF EXISTS "send_messages" ON public.chat_messages;
CREATE POLICY "send_messages" ON public.chat_messages FOR INSERT TO authenticated
    WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = chat_messages.conversation_id
              AND auth.uid()::text = ANY (c.participant_ids)
        )
    );

-- 3) Usuarios
DROP POLICY IF EXISTS "users_insert_policy" ON public.users;   -- WITH CHECK (true)
DROP POLICY IF EXISTS "users_update_manager_policy" ON public.users; -- duplicado de "Users update own profile"

-- RRHH activa / desactiva personal (el disparador limita qué columnas)
DROP POLICY IF EXISTS "HR updates staff" ON public.users;
CREATE POLICY "HR updates staff" ON public.users FOR UPDATE TO authenticated
    USING (public.is_role(ARRAY['hr_admin']))
    WITH CHECK (public.is_role(ARRAY['hr_admin']));

CREATE OR REPLACE FUNCTION public.guard_user_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_my_role text;
    v_my_orchard uuid;
    v_reg RECORD;
    v_basic text[] := ARRAY['team_leader', 'runner', 'qc_inspector', 'logistics'];
BEGIN
    -- Funciones del servidor (clave de servicio) y SQL directo: sin límites
    IF v_uid IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT role, orchard_id INTO v_my_role, v_my_orchard FROM public.users WHERE id = v_uid;

    IF v_my_role = 'admin' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- Alta propia: tiene que coincidir con una invitación sin usar
        IF NEW.id IS DISTINCT FROM v_uid THEN
            RAISE EXCEPTION 'Cannot create other users' USING ERRCODE = '42501';
        END IF;
        SELECT * INTO v_reg FROM public.allowed_registrations ar
        WHERE lower(ar.email) = lower((SELECT email FROM auth.users WHERE id = v_uid))
          AND ar.used_at IS NULL
        ORDER BY ar.created_at DESC
        LIMIT 1;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'No invitation for this email' USING ERRCODE = '42501';
        END IF;
        IF NEW.role IS DISTINCT FROM COALESCE(v_reg.role, v_reg.assigned_role) THEN
            RAISE EXCEPTION 'Role does not match the invitation' USING ERRCODE = '42501';
        END IF;
        IF v_reg.orchard_id IS NOT NULL AND NEW.orchard_id IS DISTINCT FROM v_reg.orchard_id THEN
            RAISE EXCEPTION 'Orchard does not match the invitation' USING ERRCODE = '42501';
        END IF;
        UPDATE public.allowed_registrations SET used_at = now() WHERE id = v_reg.id;
        RETURN NEW;
    END IF;

    -- UPDATE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.email IS DISTINCT FROM OLD.email THEN
        RAISE EXCEPTION 'Cannot change user id or email' USING ERRCODE = '42501';
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Only an admin can change roles' USING ERRCODE = '42501';
    END IF;

    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
        -- RRHH; o un manager reactivando a personal de campo al vincularlo
        IF NOT (
            v_my_role = 'hr_admin'
            OR (v_my_role = 'manager' AND OLD.role = ANY (v_basic) AND NEW.is_active)
        ) THEN
            RAISE EXCEPTION 'Not allowed to change active status' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF NEW.orchard_id IS DISTINCT FROM OLD.orchard_id THEN
        -- Uno mismo (cambiar de huerto); RRHH; o un manager vinculando
        -- personal de campo a su huerto o desvinculándolo
        IF NOT (
            OLD.id = v_uid
            OR v_my_role = 'hr_admin'
            OR (v_my_role = 'manager' AND OLD.role = ANY (v_basic)
                AND (NEW.orchard_id IS NULL OR NEW.orchard_id = v_my_orchard))
        ) THEN
            RAISE EXCEPTION 'Not allowed to change this user''s orchard' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Otros datos (nombre, consentimiento…) de otra persona: solo manager o RRHH
    -- (las políticas ya lo limitan; aquí no se toca nada más)
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_user_changes ON public.users;
CREATE TRIGGER trg_guard_user_changes
    BEFORE INSERT OR UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.guard_user_changes();

-- 4) Invitaciones: cada uno solo ve la suya ("Public check registration").
--    El alta (antes de tener sesión) consulta UN email con esta función.
DROP POLICY IF EXISTS "Check own registration" ON public.allowed_registrations;
-- La versión anterior leía auth.users (sin permiso para usuarios normales) y
-- hacía fallar toda la consulta: se usa el email del token.
DROP POLICY IF EXISTS "Public check registration" ON public.allowed_registrations;
CREATE POLICY "Public check registration" ON public.allowed_registrations FOR SELECT TO authenticated
    USING (lower(email) = lower(auth.jwt() ->> 'email'));

CREATE OR REPLACE FUNCTION public.check_registration(p_email text)
RETURNS TABLE (id uuid, role text, orchard_id uuid, used_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT ar.id, COALESCE(ar.role, ar.assigned_role), ar.orchard_id, ar.used_at
    FROM public.allowed_registrations ar
    WHERE lower(ar.email) = lower(trim(p_email))
    ORDER BY ar.used_at NULLS FIRST, ar.created_at DESC
    LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.check_registration(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_registration(text) TO anon, authenticated;

-- 5) Crear huertos: solo admin
DROP POLICY IF EXISTS "orchards_insert_policy" ON public.orchards;
CREATE POLICY "orchards_insert_policy" ON public.orchards FOR INSERT TO authenticated
    WITH CHECK (public.is_role(ARRAY['admin']));
