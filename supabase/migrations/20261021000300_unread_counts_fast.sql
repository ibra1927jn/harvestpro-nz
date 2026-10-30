-- =============================================================================
-- my_unread_counts: quién soy y si cumplo el 2FA, una vez por llamada
--
-- La versión anterior evaluaba auth.uid() (3 veces) y mfa_satisfied() por cada
-- mensaje de cada conversación del usuario. Cada mensaje nuevo de un grupo
-- dispara esta función en todos los móviles del grupo, y el grupo de un huerto
-- acumula ~3.000 mensajes en la temporada: en la prueba de carga (2026-10-21)
-- era la 3.ª consulta que más tiempo de base de datos gastaba (46 ms de media).
-- Mismo resultado; las conversaciones se filtran primero por el índice GIN de
-- participant_ids y los mensajes por (conversation_id, created_at).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.my_unread_counts()
RETURNS TABLE (conversation_id uuid, unread integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    WITH me AS (
        SELECT auth.uid()::text AS uid, public.mfa_satisfied() AS ok
    ),
    convs AS (
        SELECT c.id
        FROM public.conversations c, me
        WHERE me.ok
          AND me.uid IS NOT NULL
          AND c.participant_ids @> ARRAY[me.uid]
    )
    SELECT m.conversation_id, count(*)::integer
    FROM public.chat_messages m
    JOIN convs ON convs.id = m.conversation_id
    CROSS JOIN me
    WHERE m.sender_id::text <> me.uid
      AND NOT (COALESCE(m.read_by, '{}') @> ARRAY[me.uid])
    GROUP BY m.conversation_id;
$$;
COMMENT ON FUNCTION public.my_unread_counts() IS
    'Mensajes sin leer por conversación del usuario (2FA exigido a roles privilegiados).';
