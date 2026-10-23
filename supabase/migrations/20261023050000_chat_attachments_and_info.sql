-- =============================================================================
-- Chat: adjuntos (fotos, PDF, notas de voz), info de la conversación y silenciar
--
-- 1) chat_messages: columnas del adjunto. El texto puede ir vacío si hay
--    adjunto (una foto o una nota de voz sin texto). La ruta del archivo tiene
--    que estar dentro de la carpeta de SU conversación: <conversation_id>/<uuid>.<ext>
-- 2) Almacén privado "chat-attachments" (10 MB, fotos/PDF/audio): sube y lee
--    quien participa en la conversación de la carpeta; borra quien subió.
--    Enlaces firmados, como hr-documents y avatars.
-- 3) conversations.muted_by: quién la ha silenciado (cada uno lo suyo, por RPC).
-- 4) update_conversation(): renombrar un grupo y añadir / quitar personas.
--    Solo quien lo creó, un manager o un admin, y siempre participando en él
--    (conversations no tiene política UPDATE: todo pasa por aquí).
-- 5) last_messages(): devuelve también el tipo de adjunto (vista previa
--    «📷 Foto» en la lista de chats cuando el mensaje no tiene texto).
-- =============================================================================

-- 1) Columnas del adjunto -----------------------------------------------------
ALTER TABLE public.chat_messages
    ADD COLUMN IF NOT EXISTS attachment_path text,
    ADD COLUMN IF NOT EXISTS attachment_type text,
    ADD COLUMN IF NOT EXISTS attachment_name text,
    ADD COLUMN IF NOT EXISTS attachment_size integer,
    ADD COLUMN IF NOT EXISTS duration_ms integer;

ALTER TABLE public.chat_messages ALTER COLUMN content SET DEFAULT '';

COMMENT ON COLUMN public.chat_messages.attachment_path IS
    'Ruta en el almacén privado "chat-attachments": <conversation_id>/<uuid>.<ext>. NULL = sin adjunto.';
COMMENT ON COLUMN public.chat_messages.attachment_type IS 'image | pdf | audio (nota de voz)';
COMMENT ON COLUMN public.chat_messages.attachment_name IS 'Nombre original del archivo (máx. 200)';
COMMENT ON COLUMN public.chat_messages.attachment_size IS 'Bytes (máx. 10 MB)';
COMMENT ON COLUMN public.chat_messages.duration_ms IS 'Duración de la nota de voz (máx. 2 min)';

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_attachment_check;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_attachment_check CHECK (
    (attachment_path IS NULL
        AND attachment_type IS NULL AND attachment_name IS NULL
        AND attachment_size IS NULL AND duration_ms IS NULL)
    OR (
        attachment_type IN ('image', 'pdf', 'audio')
        AND attachment_path ~ ('^' || conversation_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp|pdf|webm|ogg|m4a|mp4)$')
        AND (attachment_name IS NULL OR char_length(attachment_name) BETWEEN 1 AND 200)
        AND attachment_size BETWEEN 1 AND 10485760
        AND (duration_ms IS NULL OR (attachment_type = 'audio' AND duration_ms BETWEEN 0 AND 125000))
    )
);

-- Texto vacío solo con adjunto (las filas antiguas tienen texto: NOT VALID por si
-- alguna instalación guardó alguna vacía; las nuevas se comprueban siempre)
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_content_or_attachment;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_content_or_attachment
    CHECK (btrim(content) <> '' OR attachment_path IS NOT NULL) NOT VALID;
DO $$
BEGIN
    ALTER TABLE public.chat_messages VALIDATE CONSTRAINT chat_messages_content_or_attachment;
EXCEPTION WHEN check_violation THEN
    RAISE WARNING 'chat_messages has old empty messages: chat_messages_content_or_attachment stays NOT VALID';
END $$;

-- 2) Almacén "chat-attachments" ----------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-attachments', 'chat-attachments', false, 10485760, ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
    'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/x-m4a'
])
ON CONFLICT (id) DO UPDATE
    SET public = false,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

-- storage.objects pertenece a supabase_storage_admin: en una instalación nueva
-- el rol de migraciones puede no tener permiso. Mismo contenido que
-- supabase/storage_policies.sql (scripts/apply-storage-policies.sh).
-- OJO: dentro de la subconsulta hay que escribir objects.name; «name» a secas
-- sería conversations.name (el nombre del grupo) y la política no dejaría nada.
DO $$
BEGIN
    DROP POLICY IF EXISTS "Chat attachments read" ON storage.objects;
    DROP POLICY IF EXISTS "Chat attachments upload" ON storage.objects;
    DROP POLICY IF EXISTS "Chat attachments delete own" ON storage.objects;
    CREATE POLICY "Chat attachments read" ON storage.objects FOR SELECT TO authenticated
        USING (bucket_id = 'chat-attachments' AND EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id::text = (storage.foldername(objects.name))[1]
              AND (SELECT auth.uid())::text = ANY (c.participant_ids)));
    CREATE POLICY "Chat attachments upload" ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'chat-attachments' AND EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id::text = (storage.foldername(objects.name))[1]
              AND (SELECT auth.uid())::text = ANY (c.participant_ids)));
    CREATE POLICY "Chat attachments delete own" ON storage.objects FOR DELETE TO authenticated
        USING (bucket_id = 'chat-attachments' AND owner_id = (SELECT auth.uid())::text);
EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'Chat attachment storage policies NOT created (no permission on storage.objects). Run scripts/apply-storage-policies.sh';
END $$;

-- 3) Silenciar ----------------------------------------------------------------
ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS muted_by text[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.conversations.muted_by IS
    'Usuarios que han silenciado la conversación (sin notificación ni contador en la pestaña). Cada uno cambia solo lo suyo con set_conversation_muted().';

CREATE OR REPLACE FUNCTION public.set_conversation_muted(p_conversation_id uuid, p_muted boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid text := (SELECT auth.uid())::text;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
    END IF;
    UPDATE public.conversations
    SET muted_by = CASE
            WHEN p_muted THEN array_append(array_remove(muted_by, v_uid), v_uid)
            ELSE array_remove(muted_by, v_uid)
        END
    WHERE id = p_conversation_id AND v_uid = ANY (participant_ids);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
    END IF;
    RETURN p_muted;
END;
$$;

COMMENT ON FUNCTION public.set_conversation_muted(uuid, boolean) IS
    'Silencia (true) o vuelve a activar (false) una conversación para la persona con sesión. Solo participantes.';
REVOKE ALL ON FUNCTION public.set_conversation_muted(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_conversation_muted(uuid, boolean) TO authenticated;

-- 4) Gestionar un grupo -------------------------------------------------------
-- NULL = no tocar. Devuelve la conversación como queda.
CREATE OR REPLACE FUNCTION public.update_conversation(
    p_conversation_id uuid,
    p_name text DEFAULT NULL,
    p_add uuid[] DEFAULT NULL,
    p_remove uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := (SELECT auth.uid());
    v_conv public.conversations%ROWTYPE;
    v_name text;
    v_ids text[];
    v_bad int;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
    END IF;
    -- Una cuenta dada de baja no gestiona nada
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_uid AND is_active IS DISTINCT FROM false) THEN
        RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id FOR UPDATE;
    IF NOT FOUND OR NOT (v_uid::text = ANY (v_conv.participant_ids)) THEN
        RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_conv.type <> 'group' THEN
        RAISE EXCEPTION 'Only group chats can be changed' USING ERRCODE = '22023';
    END IF;
    IF v_conv.created_by IS DISTINCT FROM v_uid AND NOT (SELECT public.is_role(ARRAY['manager', 'admin'])) THEN
        RAISE EXCEPTION 'Only the group creator or a manager can change the group' USING ERRCODE = '42501';
    END IF;

    v_name := v_conv.name;
    IF p_name IS NOT NULL THEN
        v_name := btrim(p_name);
        IF char_length(v_name) NOT BETWEEN 1 AND 80 THEN
            RAISE EXCEPTION 'Group name must be 1-80 characters' USING ERRCODE = '22023';
        END IF;
    END IF;

    v_ids := v_conv.participant_ids;
    IF p_add IS NOT NULL AND cardinality(p_add) > 0 THEN
        -- Solo cuentas que existen y siguen activas
        SELECT count(*) INTO v_bad
        FROM unnest(p_add) AS a(id)
        WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.id AND u.is_active IS DISTINCT FROM false);
        IF v_bad > 0 THEN
            RAISE EXCEPTION 'Some people cannot be added' USING ERRCODE = '22023';
        END IF;
        SELECT array_agg(DISTINCT x ORDER BY x) INTO v_ids
        FROM unnest(v_ids || p_add::text[]) AS x;
    END IF;
    IF p_remove IS NOT NULL AND cardinality(p_remove) > 0 THEN
        SELECT COALESCE(array_agg(x ORDER BY x), '{}') INTO v_ids
        FROM unnest(v_ids) AS x
        WHERE x <> ALL (p_remove::text[]);
    END IF;
    IF cardinality(v_ids) < 2 THEN
        RAISE EXCEPTION 'A group needs at least two people' USING ERRCODE = '22023';
    END IF;
    IF cardinality(v_ids) > 500 THEN
        RAISE EXCEPTION 'Too many people in the group' USING ERRCODE = '22023';
    END IF;

    UPDATE public.conversations
    SET name = v_name,
        participant_ids = v_ids,
        -- quien sale deja de tenerla silenciada
        muted_by = ARRAY(SELECT m FROM unnest(muted_by) AS m WHERE m = ANY (v_ids)),
        updated_at = now()
    WHERE id = p_conversation_id
    RETURNING * INTO v_conv;

    RETURN jsonb_build_object(
        'id', v_conv.id,
        'name', v_conv.name,
        'type', v_conv.type,
        'participant_ids', to_jsonb(v_conv.participant_ids),
        'created_by', v_conv.created_by
    );
END;
$$;

COMMENT ON FUNCTION public.update_conversation(uuid, text, uuid[], uuid[]) IS
    'Grupo de chat: renombrar y añadir / quitar personas. Solo participantes que lo crearon, managers o admins. NULL = no tocar.';
REVOKE ALL ON FUNCTION public.update_conversation(uuid, text, uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_conversation(uuid, text, uuid[], uuid[]) TO authenticated;

-- 5) Último mensaje con el tipo de adjunto -------------------------------------
-- Cambia el tipo de retorno: hay que borrarla y crearla (sigue SECURITY INVOKER,
-- el RLS de chat_messages decide qué se ve).
DROP FUNCTION IF EXISTS public.last_messages(uuid[]);
CREATE FUNCTION public.last_messages(p_conversation_ids uuid[])
RETURNS TABLE(conversation_id uuid, content text, created_at timestamp with time zone, attachment_type text)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
    SELECT c.id, m.content, m.created_at, m.attachment_type
    FROM unnest(p_conversation_ids) AS c(id)
    CROSS JOIN LATERAL (
        SELECT cm.content, cm.created_at, cm.attachment_type
        FROM public.chat_messages cm
        WHERE cm.conversation_id = c.id
        ORDER BY cm.created_at DESC
        LIMIT 1
    ) m
$function$;
REVOKE ALL ON FUNCTION public.last_messages(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.last_messages(uuid[]) TO authenticated, service_role;
