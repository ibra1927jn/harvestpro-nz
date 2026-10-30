-- =============================================================================
-- A1 (auditoría 2026-10-23): una cuenta dada de baja seguía entrando y leyendo
--
-- 1) get_my_orchard_id() y get_auth_orchard_id() devolvían el huerto aunque la
--    cuenta estuviera de baja (is_active = false). Las políticas de lectura por
--    huerto ("Read orchard pickers", "Read bucket records", "Read attendance",
--    pickers_view_policy, attendance_view_policy, …) dejaban leer con un token
--    aún válido (hasta 1 h). Ahora devuelven NULL si la cuenta no está activa:
--    `orchard_id = NULL` no casa con nada. Se ha revisado que ninguna política
--    ni función dependa de lo contrario: is_role(), is_manager(),
--    is_active_member(), get_auth_role() y can_read_company_payroll() ya exigen
--    is_active; la fila propia de users se sigue leyendo (id = auth.uid()), que
--    es lo que usa la app para saber que la cuenta está de baja.
--
-- 2) Bloqueo en Auth: al pasar users.is_active a false se banea la cuenta en
--    GoTrue (auth.users.banned_until, lo mismo que hace
--    auth.admin.updateUserById({ ban_duration })) y se borran sus sesiones
--    (auth.sessions; los refresh tokens caen en cascada): no puede volver a
--    entrar ni renovar el token. Al reactivar se quita el ban.
--    Se hace con un trigger y no en manage-admin porque hay varias vías que
--    cambian is_active (manage-admin, RRHH con setEmployeeActive →
--    users.is_active por PostgREST, el manager vinculando personal de campo,
--    la clave de servicio): el trigger cubre todas sin depender de que cada
--    pantalla llame a la Edge Function. Si el ban falla, falla también la baja
--    (más seguro que una baja a medias).
-- =============================================================================

-- 1) Huerto propio solo para cuentas activas --------------------------------
CREATE OR REPLACE FUNCTION public.get_my_orchard_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT orchard_id FROM public.users WHERE id = auth.uid() AND is_active LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_orchard_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT orchard_id FROM public.users WHERE id = auth.uid() AND is_active LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_my_orchard_id() IS
    'Huerto de la sesión; NULL si la cuenta está de baja (is_active = false) — las políticas por huerto no dejan leer nada.';
COMMENT ON FUNCTION public.get_auth_orchard_id() IS
    'Igual que get_my_orchard_id() (nombre antiguo que usan algunas políticas): NULL si la cuenta está de baja.';

-- 2) Baja = ban en Auth + sesiones cerradas; alta = sin ban -------------------
CREATE OR REPLACE FUNCTION public.sync_auth_ban_with_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.is_active IS NOT DISTINCT FROM OLD.is_active THEN
        RETURN NULL;
    END IF;

    IF NEW.is_active THEN
        UPDATE auth.users SET banned_until = NULL WHERE id = NEW.id;
    ELSE
        -- ~100 años (= ban_duration '876000h' de la API de Auth)
        UPDATE auth.users SET banned_until = now() + interval '876000 hours' WHERE id = NEW.id;
        DELETE FROM auth.sessions WHERE user_id = NEW.id;
    END IF;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.sync_auth_ban_with_active() IS
    'users.is_active → Auth: baja = banned_until a ~100 años y sesiones borradas; alta = sin ban. Cubre todas las vías (manage-admin, RRHH, clave de servicio).';

REVOKE ALL ON FUNCTION public.sync_auth_ban_with_active() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_auth_ban_with_active ON public.users;
CREATE TRIGGER trg_sync_auth_ban_with_active
    AFTER UPDATE OF is_active ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.sync_auth_ban_with_active();

-- Cuentas que ya están de baja: mismo estado que si se dieran de baja hoy
UPDATE auth.users au SET banned_until = now() + interval '876000 hours'
FROM public.users u
WHERE u.id = au.id AND u.is_active = false
  AND (au.banned_until IS NULL OR au.banned_until < now());
DELETE FROM auth.sessions s USING public.users u
WHERE u.id = s.user_id AND u.is_active = false;
