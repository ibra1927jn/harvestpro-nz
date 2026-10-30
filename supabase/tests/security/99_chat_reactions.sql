-- =============================================================================
-- Chat: reacciones, respuestas y canal privado (migración 20261023070000)
--   · chat_messages.reply_to_id: solo mensajes de la misma conversación
--   · chat_message_reactions: ven las de la conversación sus participantes; cada
--     uno pone y quita solo las suyas; una por persona, mensaje y emoji; 2FA
--   · Aviso en vivo por Broadcast desde la base (realtime.send al canal «chat:<id>»)
--   · can_use_chat_topic() y políticas de realtime.messages del canal privado
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- Otra conversación del runner A (con el runner2 A), con un mensaje
DO $$
DECLARE v_id uuid;
BEGIN
    INSERT INTO public.conversations (type, participant_ids, created_by)
    VALUES ('direct', ARRAY[sec_test.id_of('A.runner')::text, sec_test.id_of('A.runner2')::text], sec_test.id_of('A.runner'))
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.conv2', v_id);
    INSERT INTO public.chat_messages (conversation_id, sender_id, content)
    VALUES (v_id, sec_test.id_of('A.runner2'), 'SecTest other conversation')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.chat2', v_id);
    -- Reacción ya puesta por el manager A en su mensaje de A.conv
    INSERT INTO public.chat_message_reactions (message_id, user_id, emoji)
    VALUES (sec_test.id_of('A.chat'), sec_test.id_of('A.manager'), '👍');
END $$;

-- ── Responder ────────────────────────────────────────────────────────────────
SELECT sec_test.allow('A.runner', 'replies quoting a message of the same conversation',
    $$INSERT INTO chat_messages (conversation_id, sender_id, content, reply_to_id) VALUES ({A.conv}, auth.uid(), 'ok', {A.chat})$$);
SELECT sec_test.deny('A.runner', 'cannot quote a message of another conversation it is in',
    $$INSERT INTO chat_messages (conversation_id, sender_id, content, reply_to_id) VALUES ({A.conv}, auth.uid(), 'x', {A.chat2})$$, ARRAY['23514']);
SELECT sec_test.deny('A.runner', 'cannot quote a message of a conversation it is not in',
    $$INSERT INTO chat_messages (conversation_id, sender_id, content, reply_to_id) VALUES ({A.conv}, auth.uid(), 'x', {B.chat})$$, ARRAY['23514']);
SELECT sec_test.deny('A.runner', 'cannot quote a made-up message',
    $$INSERT INTO chat_messages (conversation_id, sender_id, content, reply_to_id) VALUES ({A.conv}, auth.uid(), 'x', gen_random_uuid())$$, ARRAY['23514']);
SELECT sec_test.deny('A.runner', 'a message cannot quote itself',
    $$INSERT INTO chat_messages (id, conversation_id, sender_id, content, reply_to_id)
      VALUES ('99999999-9999-4999-8999-999999999999', {A.conv}, auth.uid(), 'x', '99999999-9999-4999-8999-999999999999')$$, ARRAY['23514']);
SELECT sec_test.record(
    (SELECT count(*) = 0 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_messages' AND cmd IN ('UPDATE', 'ALL') AND permissive = 'PERMISSIVE'),
    'chat_messages: nobody can change a message (reply_to_id included)', 'there is an UPDATE policy');

-- ── Reacciones: poner ──────────────────────────────────────────────────────────
SELECT sec_test.allow(w, 'reacts to a message of its conversation',
    $$INSERT INTO chat_message_reactions (message_id, emoji) VALUES ({A.chat}, '❤️')$$)
FROM unnest(ARRAY['A.runner', 'A.manager']) AS w;
SELECT sec_test.returns('A.runner', 'conversation_id comes from the message, not from the phone',
    $$INSERT INTO chat_message_reactions (message_id, emoji, conversation_id) VALUES ({A.chat}, '🙏', {A.conv2}) RETURNING (conversation_id = {A.conv})::text$$, 'true');
SELECT sec_test.deny(w, 'cannot react in a conversation it is not in',
    $$INSERT INTO chat_message_reactions (message_id, emoji) VALUES ({A.chat}, '❤️')$$)
FROM unnest(ARRAY['A.runner2', 'A.team_leader', 'A.admin', 'A.hr_admin', 'B.manager']) AS w;
SELECT sec_test.deny('anon', 'cannot react', $$INSERT INTO chat_message_reactions (message_id, user_id, emoji) VALUES ({A.chat}, {A.runner}, '❤️')$$);
SELECT sec_test.deny('A.runner', 'cannot react in someone else''s name',
    $$INSERT INTO chat_message_reactions (message_id, user_id, emoji) VALUES ({A.chat}, {A.manager}, '😂')$$);
SELECT sec_test.deny('A.manager', 'one reaction per person, message and emoji',
    $$INSERT INTO chat_message_reactions (message_id, emoji) VALUES ({A.chat}, '👍')$$, ARRAY['23505']);
SELECT sec_test.allow('A.manager', 'repeating a reaction with ON CONFLICT DO NOTHING is harmless',
    $$INSERT INTO chat_message_reactions (message_id, emoji) VALUES ({A.chat}, '👍') ON CONFLICT DO NOTHING$$, 0);
SELECT sec_test.deny('A.runner', 'only the short emoji set',
    $$INSERT INTO chat_message_reactions (message_id, emoji) VALUES ({A.chat}, '💩')$$, ARRAY['23514']);
SELECT sec_test.deny('A.runner', 'rejects a made-up message',
    $$INSERT INTO chat_message_reactions (message_id, emoji) VALUES (gen_random_uuid(), '👍')$$, ARRAY['23503']);
SELECT sec_test.deny('A.manager@aal1', 'aal1: privileged role cannot react without 2FA',
    $$INSERT INTO chat_message_reactions (message_id, emoji) VALUES ({A.chat}, '😮')$$);

-- ── Reacciones: ver ────────────────────────────────────────────────────────────
SELECT sec_test.sees(w, 'sees the reactions of its conversation', $$SELECT 1 FROM chat_message_reactions WHERE message_id = {A.chat}$$, 1)
FROM unnest(ARRAY['A.runner', 'A.manager']) AS w;
SELECT sec_test.sees(w, 'cannot see reactions of other conversations', $$SELECT 1 FROM chat_message_reactions$$, 0)
FROM unnest(ARRAY['anon', 'A.runner2', 'A.admin', 'A.hr_admin', 'B.manager', 'B.admin']) AS w;
SELECT sec_test.sees('A.manager@aal1', 'aal1: privileged role sees no reactions without 2FA', $$SELECT 1 FROM chat_message_reactions$$, 0);

-- ── Reacciones: quitar / cambiar ───────────────────────────────────────────────
SELECT sec_test.allow('A.manager', 'removes its own reaction',
    $$DELETE FROM chat_message_reactions WHERE message_id = {A.chat} AND user_id = auth.uid() AND emoji = '👍'$$);
SELECT sec_test.deny(w, 'cannot remove someone else''s reaction', $$DELETE FROM chat_message_reactions WHERE message_id = {A.chat}$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.admin', 'B.manager']) AS w;
SELECT sec_test.deny(w, 'cannot change a reaction', $$UPDATE chat_message_reactions SET emoji = '😢' WHERE message_id = {A.chat}$$)
FROM unnest(ARRAY['A.runner', 'A.manager']) AS w;

-- ── Aviso en vivo (Broadcast desde la base) ────────────────────────────────────
DO $$
BEGIN
    INSERT INTO public.chat_message_reactions (message_id, user_id, emoji)
    VALUES (sec_test.id_of('A.chat'), sec_test.id_of('A.runner'), '😂');
    DELETE FROM public.chat_message_reactions
    WHERE message_id = sec_test.id_of('A.chat') AND user_id = sec_test.id_of('A.runner') AND emoji = '😂';
END $$;
SELECT sec_test.record(
    (SELECT count(*) = 2 FROM realtime.messages
     WHERE topic = 'chat:' || sec_test.id_of('A.conv')::text AND event = 'reaction' AND private
       AND payload->>'emoji' = '😂' AND payload->>'op' IN ('add', 'remove')),
    'adding and removing a reaction is broadcast to the private channel chat:<conversation>', 'no broadcast rows');

-- ── Canal privado «chat:<id>» ──────────────────────────────────────────────────
SELECT sec_test.returns(w, 'can use the channel of its conversation',
    $$SELECT can_use_chat_topic('chat:' || {A.conv}::text)::text$$, 'true')
FROM unnest(ARRAY['A.runner', 'A.manager']) AS w;
SELECT sec_test.returns(w, 'cannot use the channel of a conversation it is not in',
    $$SELECT can_use_chat_topic('chat:' || {A.conv}::text)::text$$, 'false')
FROM unnest(ARRAY['A.runner2', 'A.admin', 'B.manager']) AS w;
SELECT sec_test.returns('A.manager@aal1', 'aal1: privileged role cannot use the channel without 2FA',
    $$SELECT can_use_chat_topic('chat:' || {A.conv}::text)::text$$, 'false');
SELECT sec_test.returns('A.runner', 'other topics are not chat channels',
    $$SELECT (can_use_chat_topic('orchard:' || {A.conv}::text) OR can_use_chat_topic('chat:' || {A.conv}::text || 'x') OR can_use_chat_topic(NULL) IS TRUE)::text$$, 'false');
SELECT sec_test.deny('anon', 'cannot ask about a channel', $$SELECT can_use_chat_topic('chat:' || {A.conv}::text)$$);
SELECT sec_test.record(
    (SELECT count(*) = 2 FROM pg_policies WHERE schemaname = 'realtime' AND tablename = 'messages'
       AND policyname IN ('Chat participants receive', 'Chat participants send')
       AND roles = '{authenticated}'),
    'realtime.messages: receive and send policies for chat channels (authenticated only)', 'missing');

SELECT sec_test.finish();
ROLLBACK;
