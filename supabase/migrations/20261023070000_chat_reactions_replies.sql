-- =============================================================================
-- Chat: reacciones, respuestas y «Escribiendo…» (las tres maquetas del chat)
--
-- 1) chat_messages.reply_to_id: el mensaje al que responde. Siempre de la misma
--    conversación (trigger: un CHECK no puede mirar otra fila).
-- 2) chat_message_reactions: una fila por persona, mensaje y emoji (la clave
--    primaria son los tres). conversation_id lo pone el trigger a partir del
--    mensaje (lo que mande el móvil se ignora): así la RLS mira una sola tabla
--    y el aviso en vivo sabe a qué conversación va.
--    RLS: ven las de una conversación quienes participan en ella; cada uno pone
--    y quita solo las suyas; sin UPDATE. Y la restrictiva de 2FA, como todas.
-- 3) Aviso en vivo de las reacciones por *Broadcast* desde la base de datos
--    (realtime.send) al canal privado de la conversación «chat:<id>», el mismo
--    que ya abre la conversación para los mensajes nuevos. No se usa
--    postgres_changes: los DELETE no se pueden filtrar ni pasan la RLS, y cada
--    cambio publicado cuesta ~45 ms de base de datos por cada suscriptor
--    (docs/audits/2026-10-21-load-test.md).
-- 4) realtime.messages: el canal «chat:<id>» es privado. Lo escuchan y emiten
--    en él (el «Escribiendo…», que no se guarda en ninguna tabla) solo quienes
--    participan en la conversación, con la 2FA cumplida.
-- =============================================================================

-- 1) Responder a un mensaje -------------------------------------------------
ALTER TABLE public.chat_messages
    ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.chat_messages.reply_to_id IS
    'Mensaje al que responde (misma conversación, lo comprueba trg_chat_reply_same_conversation). NULL = no es respuesta.';
CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to ON public.chat_messages (reply_to_id) WHERE reply_to_id IS NOT NULL;

-- SECURITY DEFINER: comprueba el original aunque la RLS no lo deje ver; el error
-- es el mismo si no existe o es de otra conversación (no dice nada de los demás)
CREATE OR REPLACE FUNCTION public.chat_reply_same_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.reply_to_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF NEW.reply_to_id = NEW.id OR NOT EXISTS (
        SELECT 1 FROM public.chat_messages m
        WHERE m.id = NEW.reply_to_id AND m.conversation_id = NEW.conversation_id
    ) THEN
        RAISE EXCEPTION 'A reply must quote a message of the same conversation'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_reply_same_conversation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_chat_reply_same_conversation ON public.chat_messages;
CREATE TRIGGER trg_chat_reply_same_conversation
    BEFORE INSERT OR UPDATE OF reply_to_id, conversation_id ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.chat_reply_same_conversation();

-- 2) Reacciones ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
    message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE CASCADE,
    emoji text NOT NULL,
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, user_id, emoji),
    -- El mismo conjunto corto que enseña la app (REACTION_EMOJIS en messagingHelpers.ts)
    CONSTRAINT chat_message_reactions_emoji_check
        CHECK (emoji IN ('👍', '❤️', '😂', '😮', '😢', '🙏'))
);
COMMENT ON TABLE public.chat_message_reactions IS
    'Reacciones a mensajes del chat: una por persona, mensaje y emoji. conversation_id lo pone el trigger.';
CREATE INDEX IF NOT EXISTS idx_chat_reactions_conversation ON public.chat_message_reactions (conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_user ON public.chat_message_reactions (user_id);

CREATE OR REPLACE FUNCTION public.chat_reaction_set_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    SELECT m.conversation_id INTO NEW.conversation_id
    FROM public.chat_messages m WHERE m.id = NEW.message_id;
    -- Mensaje inexistente (o borrado mientras la reacción esperaba en la cola):
    -- el mismo código que la FK, antes de que la RLS lo convierta en un 42501
    IF NEW.conversation_id IS NULL THEN
        RAISE EXCEPTION 'Message % does not exist', NEW.message_id USING ERRCODE = '23503';
    END IF;
    NEW.created_at := now();
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_reaction_set_conversation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_chat_reaction_set_conversation ON public.chat_message_reactions;
CREATE TRIGGER trg_chat_reaction_set_conversation
    BEFORE INSERT ON public.chat_message_reactions
    FOR EACH ROW EXECUTE FUNCTION public.chat_reaction_set_conversation();

ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_reactions_select ON public.chat_message_reactions;
CREATE POLICY chat_reactions_select ON public.chat_message_reactions
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = chat_message_reactions.conversation_id
          AND (SELECT auth.uid())::text = ANY (c.participant_ids)
    ));

DROP POLICY IF EXISTS chat_reactions_insert ON public.chat_message_reactions;
CREATE POLICY chat_reactions_insert ON public.chat_message_reactions
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = (SELECT auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = chat_message_reactions.conversation_id
              AND (SELECT auth.uid())::text = ANY (c.participant_ids)
        )
    );

-- Quitar: solo las propias (también si ya no está en el grupo)
DROP POLICY IF EXISTS chat_reactions_delete ON public.chat_message_reactions;
CREATE POLICY chat_reactions_delete ON public.chat_message_reactions
    FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Require 2FA for privileged roles" ON public.chat_message_reactions;
CREATE POLICY "Require 2FA for privileged roles" ON public.chat_message_reactions
    AS RESTRICTIVE FOR ALL TO public
    USING ((SELECT public.mfa_satisfied()))
    WITH CHECK ((SELECT public.mfa_satisfied()));

REVOKE ALL ON public.chat_message_reactions FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.chat_message_reactions TO authenticated;
GRANT ALL ON public.chat_message_reactions TO service_role;

-- 3) Aviso en vivo por Broadcast desde la base de datos -------------------------
-- Si realtime no está (una instalación sin él) o falla, la reacción se guarda
-- igual: el aviso es lo de menos, al abrir la conversación se leen de la tabla.
CREATE OR REPLACE FUNCTION public.chat_reaction_broadcast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r public.chat_message_reactions%ROWTYPE;
BEGIN
    IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
    IF to_regprocedure('realtime.send(jsonb, text, text, boolean)') IS NULL THEN
        RETURN NULL;
    END IF;
    BEGIN
        PERFORM realtime.send(
            jsonb_build_object(
                'op', CASE WHEN TG_OP = 'DELETE' THEN 'remove' ELSE 'add' END,
                'message_id', r.message_id,
                'user_id', r.user_id,
                'emoji', r.emoji,
                'created_at', r.created_at
            ),
            'reaction',
            'chat:' || r.conversation_id::text,
            true
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'chat_reaction_broadcast: %', SQLERRM;
    END;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_reaction_broadcast() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_chat_reaction_broadcast ON public.chat_message_reactions;
CREATE TRIGGER trg_chat_reaction_broadcast
    AFTER INSERT OR DELETE ON public.chat_message_reactions
    FOR EACH ROW EXECUTE FUNCTION public.chat_reaction_broadcast();

-- 4) Canal privado de la conversación -------------------------------------------
-- ¿Puede la persona con sesión usar el canal «chat:<id>»? Participa y cumple la
-- 2FA. SECURITY DEFINER: no depende de la RLS de conversations (que además
-- lleva la restrictiva de 2FA: aquí se pide explícitamente).
CREATE OR REPLACE FUNCTION public.can_use_chat_topic(p_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
        AND EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = substr(p_topic, 6)::uuid
              AND v_uid::text = ANY (c.participant_ids)
        );
END;
$$;
COMMENT ON FUNCTION public.can_use_chat_topic(text) IS
    'Canal privado de realtime «chat:<conversation_id>»: solo participantes con la 2FA cumplida.';
REVOKE ALL ON FUNCTION public.can_use_chat_topic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_use_chat_topic(text) TO authenticated;

-- realtime.messages pertenece a supabase_realtime_admin: si el rol de las
-- migraciones no puede, se avisa (sin estas políticas nadie entra al canal
-- privado y el chat sigue funcionando, solo sin reacciones ni «Escribiendo…» en vivo).
DO $$
BEGIN
    DROP POLICY IF EXISTS "Chat participants receive" ON realtime.messages;
    DROP POLICY IF EXISTS "Chat participants send" ON realtime.messages;
    CREATE POLICY "Chat participants receive" ON realtime.messages
        FOR SELECT TO authenticated
        USING (
            realtime.messages.extension IN ('broadcast', 'presence')
            AND (SELECT public.can_use_chat_topic((SELECT realtime.topic())))
        );
    CREATE POLICY "Chat participants send" ON realtime.messages
        FOR INSERT TO authenticated
        WITH CHECK (
            realtime.messages.extension IN ('broadcast', 'presence')
            AND (SELECT public.can_use_chat_topic((SELECT realtime.topic())))
        );
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE WARNING 'Realtime policies for chat channels NOT created (no permission on realtime.messages)';
    WHEN undefined_table OR invalid_schema_name THEN
        RAISE WARNING 'realtime.messages does not exist: chat channels stay without live reactions/typing';
END $$;
