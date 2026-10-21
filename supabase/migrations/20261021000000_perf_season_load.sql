-- =============================================================================
-- Rendimiento para una temporada entera (prueba de carga 2026-10-21)
--
-- La simulación de una empresa con 3 huertos, 31 móviles y 240 pickers
-- (≈10.000 cubetas al día, ≈700.000 en la temporada) sacó esto:
--
-- 1. bucket_records tenía 12 índices; 6 no los usa ninguna consulta (0 lecturas
--    en un día completo) o los cubre otro. Cada cubeta los mantenía todos.
--    Falta el que sí hace falta: (orchard_id, scanned_at) — "cubetas de hoy de
--    este huerto" lo piden todos los móviles en cada arranque y desbloqueo.
-- 2. daily_attendance tenía 3 índices repetidos exactamente.
-- 3. Chat: sin índice (conversation_id, created_at) y sin forma de pedir solo el
--    último mensaje de cada conversación (se bajaban todos cada 15 s).
-- 4. La publicación de realtime incluía users y conversations: nadie se
--    suscribe a ellas, pero cada cambio se decodificaba del WAL igual.
--
-- (Los avisos solo de manager/admin y Logística por huerto son decisiones de
-- seguridad con pruebas en supabase/tests/security: no se cambian aquí; la app
-- deja de intentar lo que el RLS no permite.)
-- =============================================================================

-- 1. bucket_records ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bucket_records_orchard_scanned
    ON public.bucket_records (orchard_id, scanned_at);

-- Cubiertos por idx_bucket_records_orchard_scanned (orchard_id, ...)
DROP INDEX IF EXISTS public.idx_bucket_records_orchard;
-- Cubiertos por la clave única (picker_id, scanned_at)
DROP INDEX IF EXISTS public.idx_bucket_records_picker;
DROP INDEX IF EXISTS public.idx_bucket_records_picker_orchard;
-- Ninguna consulta filtra por nota, por created_at ni por (season_id, created_at)
DROP INDEX IF EXISTS public.idx_bucket_records_quality;
DROP INDEX IF EXISTS public.idx_bucket_records_created;
DROP INDEX IF EXISTS public.idx_bucket_records_sync;

-- 2. daily_attendance: duplicados exactos de idx_daily_attendance_* ------------
DROP INDEX IF EXISTS public.idx_attendance_picker_date;   -- = idx_daily_attendance_picker_date
DROP INDEX IF EXISTS public.idx_attendance_orchard_date;  -- = idx_daily_attendance_orchard_date
DROP INDEX IF EXISTS public.idx_attendance_date;          -- = idx_daily_attendance_date

-- 3. Chat ----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created
    ON public.chat_messages (conversation_id, created_at DESC);
DROP INDEX IF EXISTS public.idx_chat_messages_conversation; -- cubierto por el anterior

-- Último mensaje de cada conversación (vista previa de la lista de chats).
-- SECURITY INVOKER: el RLS de chat_messages decide qué conversaciones se ven.
CREATE OR REPLACE FUNCTION public.last_messages(p_conversation_ids uuid[])
RETURNS TABLE (conversation_id uuid, content text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT c.id, m.content, m.created_at
    FROM unnest(p_conversation_ids) AS c(id)
    CROSS JOIN LATERAL (
        SELECT cm.content, cm.created_at
        FROM public.chat_messages cm
        WHERE cm.conversation_id = c.id
        ORDER BY cm.created_at DESC
        LIMIT 1
    ) m
$$;
COMMENT ON FUNCTION public.last_messages(uuid[]) IS
    'Último mensaje de cada conversación pedida (una fila por conversación). RLS de chat_messages.';
REVOKE ALL ON FUNCTION public.last_messages(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.last_messages(uuid[]) TO authenticated;

-- 4. Realtime: fuera las tablas a las que nadie se suscribe ----------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'users') THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE public.users;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations') THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE public.conversations;
    END IF;
END $$;
