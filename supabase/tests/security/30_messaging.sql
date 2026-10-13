-- =============================================================================
-- Mensajería: conversaciones, chat, mensajes directos antiguos, avisos
-- (broadcasts) y suscripciones push.
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- ── conversations / chat_messages (A.conv = manager A ↔ runner A) ────────────
SELECT sec_test.sees(w, 'reads own conversation', $$SELECT 1 FROM chat_messages WHERE id = {A.chat}$$, 1)
FROM unnest(ARRAY['A.manager', 'A.runner']) AS w;
SELECT sec_test.sees(w, 'cannot read a conversation it is not in', $$SELECT 1 FROM chat_messages WHERE id = {A.chat}$$, 0)
FROM unnest(ARRAY['anon', 'A.runner2', 'A.team_leader', 'A.admin', 'A.hr_admin', 'B.manager']) AS w;
SELECT sec_test.sees(w, 'cannot see a conversation it is not in', $$SELECT 1 FROM conversations WHERE id = {A.conv}$$, 0)
FROM unnest(ARRAY['anon', 'A.runner2', 'A.admin']) AS w;
SELECT sec_test.allow('A.runner', 'replies in own conversation',
    $$INSERT INTO chat_messages (conversation_id, sender_id, content) VALUES ({A.conv}, auth.uid(), 'hi')$$);
SELECT sec_test.deny('A.runner2', 'cannot post in someone else''s conversation',
    $$INSERT INTO chat_messages (conversation_id, sender_id, content) VALUES ({A.conv}, auth.uid(), 'hi')$$);
SELECT sec_test.deny('A.runner', 'cannot post as another person',
    $$INSERT INTO chat_messages (conversation_id, sender_id, content) VALUES ({A.conv}, {A.manager}, 'fake')$$);
SELECT sec_test.deny('A.runner2', 'cannot add self to a conversation',
    $$UPDATE conversations SET participant_ids = participant_ids || auth.uid()::text WHERE id = {A.conv}$$);
SELECT sec_test.deny('A.runner', 'cannot edit a message', $$UPDATE chat_messages SET content = 'edited' WHERE id = {A.chat}$$);
SELECT sec_test.deny('A.runner', 'cannot delete a message', $$DELETE FROM chat_messages WHERE id = {A.chat}$$);
SELECT sec_test.deny('A.runner2', 'cannot mark someone else''s conversation as read', $$SELECT mark_conversation_read({A.conv})$$);
SELECT sec_test.allow('A.runner', 'marks own conversation as read', $$SELECT mark_conversation_read({A.conv})$$);
SELECT sec_test.allow('A.runner2', 'starts a conversation',
    $$INSERT INTO conversations (type, participant_ids, created_by) VALUES ('direct', ARRAY[auth.uid()::text, {A.manager}::text], auth.uid())$$);
SELECT sec_test.deny('A.runner2', 'cannot create a conversation between other people',
    $$INSERT INTO conversations (type, participant_ids, created_by) VALUES ('direct', ARRAY[{A.manager}::text, {A.runner}::text], auth.uid())$$);

-- ── messages (mensajes directos antiguos: A.dm = runner A → jefe de equipo A) ─
SELECT sec_test.sees(w, 'reads own direct message', $$SELECT 1 FROM messages WHERE id = {A.dm}$$, 1)
FROM unnest(ARRAY['A.runner', 'A.team_leader']) AS w;
SELECT sec_test.sees(w, 'cannot read other people''s direct messages', $$SELECT 1 FROM messages WHERE id = {A.dm}$$, 0)
FROM unnest(ARRAY['anon', 'A.runner2', 'A.manager', 'A.admin', 'B.manager']) AS w;
SELECT sec_test.deny(w, 'cannot delete other people''s direct messages', $$DELETE FROM messages WHERE id = {A.dm}$$)
FROM unnest(ARRAY['A.runner2', 'A.manager', 'B.manager']) AS w;
SELECT sec_test.deny('A.runner2', 'cannot send as someone else',
    $$INSERT INTO messages (sender_id, receiver_id, content) VALUES ({A.manager}, {A.runner}, 'fake')$$);

-- ── broadcasts (avisos a todo el huerto: solo manager/admin) ─────────────────
SELECT sec_test.allow('A.manager', 'sends a broadcast to own orchard',
    $$INSERT INTO broadcasts (orchard_id, sender_id, title, content) VALUES ({A}, auth.uid(), 't', 'c')$$);
SELECT sec_test.deny(w, 'cannot send broadcasts',
    $$INSERT INTO broadcasts (orchard_id, sender_id, title, content, priority) VALUES ({A}, auth.uid(), 'EVACUATE', 'fake', 'urgent')$$)
FROM unnest(ARRAY['anon', 'A.runner', 'A.qc_inspector', 'A.logistics', 'A.payroll_admin', 'A.inactive_manager']) AS w;
SELECT sec_test.deny('A.manager', 'cannot broadcast to another orchard',
    $$INSERT INTO broadcasts (orchard_id, sender_id, title, content) VALUES ({B}, auth.uid(), 't', 'c')$$);
SELECT sec_test.deny('A.manager', 'cannot broadcast as someone else',
    $$INSERT INTO broadcasts (orchard_id, sender_id, title, content) VALUES ({A}, {A.admin}, 't', 'c')$$);
SELECT sec_test.sees('B.runner', 'cannot read another orchard''s broadcasts', $$SELECT 1 FROM broadcasts WHERE id = {A.broadcast}$$, 0);
SELECT sec_test.deny(w, 'cannot edit or delete another orchard''s broadcast', $$DELETE FROM broadcasts WHERE id = {A.broadcast}$$)
FROM unnest(ARRAY['B.manager', 'A.runner']) AS w;
SELECT sec_test.deny('B.manager', 'cannot edit another orchard''s broadcast', $$UPDATE broadcasts SET content = 'x' WHERE id = {A.broadcast}$$);
SELECT sec_test.deny('A.runner', 'cannot edit a broadcast', $$UPDATE broadcasts SET acknowledged_by = ARRAY[{A.runner2}] WHERE id = {A.broadcast}$$);
SELECT sec_test.returns('A.runner', 'acknowledges a broadcast',
    $$WITH a AS (SELECT acknowledge_broadcast({A.broadcast})) SELECT (SELECT count(*) FROM a)::text$$, '1');

-- ── push_subscriptions ──────────────────────────────────────────────────────
SELECT sec_test.sees('A.runner', 'reads own push subscription', $$SELECT 1 FROM push_subscriptions WHERE id = {A.push}$$, 1);
SELECT sec_test.sees(w, 'cannot read someone else''s push subscription', $$SELECT 1 FROM push_subscriptions WHERE id = {A.push}$$, 0)
FROM unnest(ARRAY['anon', 'A.runner2', 'A.manager', 'A.admin']) AS w;
SELECT sec_test.deny('A.runner2', 'cannot subscribe someone else',
    $$INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth) VALUES ({A.runner}, 'https://evil.example', 'k', 'a')$$);

SELECT sec_test.finish();
ROLLBACK;
