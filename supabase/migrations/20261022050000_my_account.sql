-- =============================================================================
-- «Mi cuenta» (revisión 2026-10-21, punto 10): zona personal para los 8 roles
--
-- 1) users: foto (avatar_url), teléfono y idioma preferido de la app.
-- 2) update_my_profile(): cada persona edita SOLO esas columnas (y su nombre a
--    mostrar) de su propia fila, con validación, sin abrir más la tabla.
--    Se elige la función (opción a) y no privilegios por columna (opción b):
--      · authenticated tiene hoy UPDATE de tabla entera sobre users y lo usan
--        flujos existentes por PostgREST (cambio de huerto propio, RRHH con
--        is_active, manager vinculando orchard_id, consentimiento de
--        privacidad). Un GRANT por columnas obliga a REVOCAR el de tabla y
--        volver a conceder cada columna que usan esos flujos: no se puede
--        comprobar sin la base levantada y rompería algo en silencio.
--      · La política RESTRICTIVE "Require 2FA for privileged roles" de users
--        (20261014000000) deja pasar la fila propia sin aal2, igual para a y b.
--      · La función valida longitudes y que la foto esté en la carpeta propia
--        del almacén; con la opción b eso exigiría un CHECK o un trigger más.
--    La política "Users update own profile" (id = auth.uid()) se queda como
--    está: el trigger guard_user_changes sigue protegiendo rol, baja, email y
--    huerto; recortarla es tarea aparte.
-- 3) Almacén privado "avatars": cada uno sube / cambia / borra en
--    avatars/<auth.uid()>/…; lee cualquier cuenta con sesión (las fotos se ven
--    en los cajones de perfil de todo el huerto). Enlaces firmados, como
--    hr-documents.
-- =============================================================================

-- 1) Columnas ------------------------------------------------------------------
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS avatar_url text,
    ADD COLUMN IF NOT EXISTS phone text,
    ADD COLUMN IF NOT EXISTS preferred_locale text;

COMMENT ON COLUMN public.users.avatar_url IS
    'Ruta de la foto dentro del almacén privado "avatars": <user_id>/avatar-<ts>.jpg. NULL = iniciales.';
COMMENT ON COLUMN public.users.phone IS
    'Teléfono de contacto que escribe la propia persona (formato libre, máx. 30).';
COMMENT ON COLUMN public.users.preferred_locale IS
    'Código de idioma de la app (hoy en|es|mi|sm|hi|to|tl). Sin CHECK a propósito: los idiomas cambian.';

-- 2) Edición de lo propio ------------------------------------------------------
-- Convención de parámetros: NULL = no tocar; '' (vacío) = borrar el valor.
-- El nombre a mostrar no se puede borrar (2–80 caracteres).
CREATE OR REPLACE FUNCTION public.update_my_profile(
    p_full_name text DEFAULT NULL,
    p_phone text DEFAULT NULL,
    p_preferred_locale text DEFAULT NULL,
    p_avatar_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_name text;
    v_phone text;
    v_locale text;
    v_avatar text;
    v_row public.users%ROWTYPE;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
    END IF;

    -- Solo cuentas activas (una cuenta dada de baja no edita nada)
    SELECT * INTO v_row FROM public.users WHERE id = v_uid AND is_active IS DISTINCT FROM false;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
    END IF;

    -- Nombre a mostrar
    v_name := v_row.full_name;
    IF p_full_name IS NOT NULL THEN
        v_name := btrim(p_full_name);
        IF length(v_name) < 2 OR length(v_name) > 80 THEN
            RAISE EXCEPTION 'Display name must be 2 to 80 characters' USING ERRCODE = '22023';
        END IF;
    END IF;

    -- Teléfono (formato libre)
    v_phone := v_row.phone;
    IF p_phone IS NOT NULL THEN
        v_phone := nullif(btrim(p_phone), '');
        IF length(v_phone) > 30 THEN
            RAISE EXCEPTION 'Phone must be 30 characters or fewer' USING ERRCODE = '22023';
        END IF;
    END IF;

    -- Idioma de la app
    v_locale := v_row.preferred_locale;
    IF p_preferred_locale IS NOT NULL THEN
        v_locale := nullif(btrim(p_preferred_locale), '');
        IF v_locale IS NOT NULL AND v_locale !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,4})?$' THEN
            RAISE EXCEPTION 'Invalid locale code' USING ERRCODE = '22023';
        END IF;
    END IF;

    -- Foto: solo rutas dentro de la carpeta propia del almacén "avatars"
    v_avatar := v_row.avatar_url;
    IF p_avatar_url IS NOT NULL THEN
        v_avatar := nullif(btrim(p_avatar_url), '');
        IF v_avatar IS NOT NULL
           AND v_avatar !~ ('^' || v_uid::text || '/[A-Za-z0-9._-]{1,120}$') THEN
            RAISE EXCEPTION 'Avatar path must be inside your own folder' USING ERRCODE = '22023';
        END IF;
    END IF;

    UPDATE public.users
    SET full_name = v_name,
        phone = v_phone,
        preferred_locale = v_locale,
        avatar_url = v_avatar
    WHERE id = v_uid
    RETURNING * INTO v_row;

    RETURN jsonb_build_object(
        'id', v_row.id,
        'full_name', v_row.full_name,
        'phone', v_row.phone,
        'preferred_locale', v_row.preferred_locale,
        'avatar_url', v_row.avatar_url
    );
END;
$$;

COMMENT ON FUNCTION public.update_my_profile(text, text, text, text) IS
    'Mi cuenta: la persona con sesión cambia su nombre a mostrar, teléfono, idioma y foto. NULL = no tocar, vacío = borrar. Nunca rol, huerto, email ni baja.';

REVOKE ALL ON FUNCTION public.update_my_profile(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text, text, text) TO authenticated;

-- 3) Almacén "avatars" ---------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
    SET public = false,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

-- storage.objects pertenece a supabase_storage_admin. En una instalación nueva
-- con Supabase CLI el rol de migraciones no puede crear políticas ahí: se
-- intenta y, si no hay permiso, se avisa y hay que aplicar
-- supabase/storage_policies.sql como supabase_admin
-- (scripts/apply-storage-policies.sh). Mismo contenido que ese archivo.
DO $$
BEGIN
    DROP POLICY IF EXISTS "Avatars read" ON storage.objects;
    DROP POLICY IF EXISTS "Avatars upload own" ON storage.objects;
    DROP POLICY IF EXISTS "Avatars update own" ON storage.objects;
    DROP POLICY IF EXISTS "Avatars delete own" ON storage.objects;
    CREATE POLICY "Avatars read" ON storage.objects FOR SELECT TO authenticated
        USING (bucket_id = 'avatars');
    CREATE POLICY "Avatars upload own" ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
    CREATE POLICY "Avatars update own" ON storage.objects FOR UPDATE TO authenticated
        USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
        WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
    CREATE POLICY "Avatars delete own" ON storage.objects FOR DELETE TO authenticated
        USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'Avatar storage policies NOT created (no permission on storage.objects). Run scripts/apply-storage-policies.sh';
END $$;
