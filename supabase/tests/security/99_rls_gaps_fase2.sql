-- =============================================================================
-- Fase 2: huecos de acceso cerrados en 20261027030000_fase2_rls_gaps
-- (la matriz 99_rls_matrix.sql los ve por tabla; aquí, los casos concretos)
--
--   1. Ninguna política deja pasar a cualquier sesión (USING (true),
--      auth.role() = 'authenticated', auth.uid() IS NOT NULL): day_closures
--      tenía una de 20260210 que nadie cerró.
--   2. Una cuenta de baja con el token aún vivo no usa el chat (mensajes,
--      reacciones, adjuntos, canal en vivo), ni sus avisos push, ni escribe
--      en la auditoría, ni lee su contrato o sus documentos de RRHH.
--   3. Un manager edita su perfil y el del personal de campo, no el de admin,
--      RRHH, nómina u otros managers.
--   4. Un team leader da de alta pickers solo en su huerto.
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- ── 1) Nada abierto a cualquier sesión ──────────────────────────────────────
-- Permisivas de public, storage y realtime cuya condición entera es «hay sesión»
SELECT sec_test.record(false, 'policy open to every session: ' || schemaname || '.' || tablename || ' "' || policyname || '"',
    'USING ' || COALESCE(qual, '-') || ' / WITH CHECK ' || COALESCE(with_check, '-'))
FROM pg_policies
WHERE schemaname IN ('public', 'storage', 'realtime')
  AND permissive = 'PERMISSIVE'
  AND EXISTS (
      SELECT 1 FROM unnest(ARRAY[qual, with_check]) AS e(expr)
      WHERE regexp_replace(lower(e.expr), '[\s()]', '', 'g') IN (
          'true',
          'selectauth.roleasrole=''authenticated''::text', 'auth.role=''authenticated''::text',
          'selectauth.uidasuidisnotnull', 'auth.uidisnotnull'));
SELECT sec_test.record(true, 'no permissive policy in public/storage/realtime is open to every session', NULL);

-- day_closures (era USING (auth.role() = 'authenticated'))
SELECT sec_test.sees(w, 'reads own orchard day closures', $$SELECT 1 FROM day_closures WHERE id = {A.closure}$$, 1)
FROM unnest(ARRAY['A.runner', 'A.team_leader', 'A.qc_inspector', 'A.logistics', 'A.manager']) AS w;
SELECT sec_test.sees(w, 'cannot read another orchard''s day closures', $$SELECT 1 FROM day_closures WHERE id = {B.closure}$$, 0)
FROM unnest(ARRAY['A.runner', 'A.team_leader', 'A.manager', 'A.payroll_admin', 'A.hr_admin']) AS w;
SELECT sec_test.sees(w, 'cannot read day closures', $$SELECT 1 FROM day_closures$$, 0)
FROM unnest(ARRAY['anon', 'A.inactive_manager', 'A.inactive_admin']) AS w;
SELECT sec_test.sees('A.admin', 'reads every orchard''s day closures',
    $$SELECT 1 FROM day_closures WHERE id IN ({A.closure}, {B.closure})$$, 2);

-- ── 2) Cuenta de baja con el token vivo ─────────────────────────────────────
-- A.inactive_manager participa en una conversación con A.manager, tiene un
-- móvil con avisos, un contrato, un documento, un adjunto y una foto
DO $$
DECLARE
    v_conv uuid;
    v_msg uuid;
    v_inactive uuid := sec_test.id_of('A.inactive_manager');
    v_manager uuid := sec_test.id_of('A.manager');
    v_id uuid;
BEGIN
    INSERT INTO public.conversations (type, participant_ids, created_by)
    VALUES ('direct', ARRAY[v_manager::text, v_inactive::text], v_manager) RETURNING id INTO v_conv;
    INSERT INTO sec_test.ids VALUES ('I.conv', v_conv);
    INSERT INTO public.chat_messages (conversation_id, sender_id, content)
    VALUES (v_conv, v_manager, 'SecTest message to a deactivated account') RETURNING id INTO v_msg;
    INSERT INTO sec_test.ids VALUES ('I.msg', v_msg);
    INSERT INTO public.chat_message_reactions (message_id, user_id, emoji, conversation_id)
    VALUES (v_msg, v_manager, '👍', v_conv);

    INSERT INTO public.push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth)
    VALUES (v_inactive, 'https://push.example.test/inactive', 'k', 'a') RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('I.push', v_id);

    INSERT INTO public.privacy_consent_log (user_id, consent_type) VALUES (v_inactive, 'privacy_policy')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('I.consent', v_id);

    INSERT INTO public.contracts (employee_id, orchard_id, type, status, start_date)
    VALUES (v_inactive, sec_test.id_of('A'), 'seasonal', 'terminated', CURRENT_DATE - 100) RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('I.contract', v_id);

    INSERT INTO public.hr_documents (orchard_id, user_id, document_type, title, storage_path)
    VALUES (sec_test.id_of('A'), v_inactive, 'other', 'SecTest inactive doc', 'A/inactive.pdf') RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('I.hrdoc', v_id);

    INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
    VALUES ('chat-attachments', v_conv::text || '/22222222-2222-2222-2222-222222222222.jpg', v_manager, v_manager::text)
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('I.attachment', v_id);

    INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
    VALUES ('avatars', v_inactive::text || '/avatar.webp', v_inactive, v_inactive::text)
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('I.avatar', v_id);
END $$;

-- La otra persona de la conversación sí (para que las pruebas no pasen por vacías)
SELECT sec_test.sees('A.manager', 'reads the conversation with a deactivated account', $$SELECT 1 FROM conversations WHERE id = {I.conv}$$, 1);
SELECT sec_test.sees('A.manager', 'reads its messages', $$SELECT 1 FROM chat_messages WHERE conversation_id = {I.conv}$$, 1);
SELECT sec_test.sees('A.manager', 'reads its reactions', $$SELECT 1 FROM chat_message_reactions WHERE conversation_id = {I.conv}$$, 1);
SELECT sec_test.sees('A.manager', 'reads its attachment', $$SELECT 1 FROM storage.objects WHERE id = {I.attachment}$$, 1);
SELECT sec_test.returns('A.manager', 'can use the live channel', $$SELECT can_use_chat_topic('chat:' || {I.conv}::text)::text$$, 'true');

-- La cuenta de baja no
SELECT sec_test.sees('A.inactive_manager', 'cannot read its conversations', $$SELECT 1 FROM conversations WHERE id = {I.conv}$$, 0);
SELECT sec_test.sees('A.inactive_manager', 'cannot read chat messages', $$SELECT 1 FROM chat_messages WHERE conversation_id = {I.conv}$$, 0);
SELECT sec_test.sees('A.inactive_manager', 'cannot read reactions', $$SELECT 1 FROM chat_message_reactions WHERE conversation_id = {I.conv}$$, 0);
SELECT sec_test.deny('A.inactive_manager', 'cannot send chat messages',
    $$INSERT INTO chat_messages (conversation_id, sender_id, content) VALUES ({I.conv}, auth.uid(), 'still here')$$);
SELECT sec_test.deny('A.inactive_manager', 'cannot react',
    $$INSERT INTO chat_message_reactions (message_id, user_id, emoji, conversation_id) VALUES ({I.msg}, auth.uid(), '❤️', {I.conv})$$);
SELECT sec_test.deny('A.inactive_manager', 'cannot start conversations',
    $$INSERT INTO conversations (type, participant_ids, created_by) VALUES ('direct', ARRAY[auth.uid()::text, {A.runner}::text], auth.uid())$$);
SELECT sec_test.returns('A.inactive_manager', 'cannot use the live channel', $$SELECT can_use_chat_topic('chat:' || {I.conv}::text)::text$$, 'false');
SELECT sec_test.sees('A.inactive_manager', 'cannot open chat attachments', $$SELECT 1 FROM storage.objects WHERE id = {I.attachment}$$, 0);
SELECT sec_test.deny('A.inactive_manager', 'cannot upload chat attachments',
    $$INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES ('chat-attachments', {I.conv}::text || '/33333333-3333-3333-3333-333333333333.jpg', auth.uid(), auth.uid()::text)$$);
SELECT sec_test.deny('A.inactive_manager', 'cannot upload an avatar',
    $$INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES ('avatars', auth.uid()::text || '/new.webp', auth.uid(), auth.uid()::text)$$);
SELECT sec_test.sees('A.inactive_manager', 'cannot read its push subscriptions', $$SELECT 1 FROM push_subscriptions WHERE id = {I.push}$$, 0);
SELECT sec_test.deny('A.inactive_manager', 'cannot register a phone for push',
    $$INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth) VALUES (auth.uid(), 'https://push.example.test/again', 'k', 'a')$$);
SELECT sec_test.deny('A.inactive_manager', 'cannot change its push subscription',
    $$UPDATE push_subscriptions SET muted_types = '{}' WHERE id = {I.push}$$);
SELECT sec_test.deny('A.inactive_manager', 'cannot write audit entries',
    $$INSERT INTO audit_logs (user_id, action, table_name) VALUES (auth.uid(), 'CUSTOM', 'sectest')$$);
SELECT sec_test.sees('A.inactive_manager', 'cannot read its consent log', $$SELECT 1 FROM privacy_consent_log WHERE id = {I.consent}$$, 0);
SELECT sec_test.deny('A.inactive_manager', 'cannot log consent',
    $$INSERT INTO privacy_consent_log (user_id, consent_type) VALUES (auth.uid(), 'privacy_policy')$$);
SELECT sec_test.sees('A.inactive_manager', 'cannot read its contract', $$SELECT 1 FROM contracts WHERE id = {I.contract}$$, 0);
SELECT sec_test.sees('A.inactive_manager', 'cannot read its HR documents', $$SELECT 1 FROM hr_documents WHERE id = {I.hrdoc}$$, 0);
-- Sí puede leer su propia fila: la app la necesita para decir que la cuenta está de baja
SELECT sec_test.sees('A.inactive_manager', 'still reads its own profile (to show it is deactivated)',
    $$SELECT 1 FROM users WHERE id = auth.uid() AND NOT is_active$$, 1);
-- RRHH sigue viendo ese contrato y ese documento
SELECT sec_test.sees('A.hr_admin', 'reads the contract of a deactivated account', $$SELECT 1 FROM contracts WHERE id = {I.contract}$$, 1);
SELECT sec_test.sees('A.hr_admin', 'reads the HR documents of a deactivated account', $$SELECT 1 FROM hr_documents WHERE id = {I.hrdoc}$$, 1);

-- ── 3) Perfiles que puede cambiar un manager ────────────────────────────────
SELECT sec_test.allow('A.manager', 'edits its own profile',
    $$UPDATE users SET phone = '+64 21 000 0001' WHERE id = auth.uid()$$);
SELECT sec_test.allow('A.manager', 'edits a field staff profile: ' || w,
    format($$UPDATE users SET full_name = 'SecTest renamed' WHERE id = {%s}$$, w))
FROM unnest(ARRAY['A.runner', 'A.team_leader', 'A.qc_inspector', 'A.logistics', 'B.runner']) AS w;
SELECT sec_test.deny('A.manager', 'cannot edit an office profile: ' || w,
    format($$UPDATE users SET full_name = 'SecTest renamed', phone = '+64 21 000 0002' WHERE id = {%s}$$, w))
FROM unnest(ARRAY['A.admin', 'A.hr_admin', 'A.payroll_admin', 'B.manager', 'B.admin']) AS w;
SELECT sec_test.allow('A.hr_admin', 'HR still edits office profiles',
    $$UPDATE users SET phone = '+64 21 000 0003' WHERE id = {A.payroll_admin}$$);
SELECT sec_test.allow('A.admin', 'admin still edits a manager profile',
    $$UPDATE users SET phone = '+64 21 000 0004' WHERE id = {A.manager}$$);
-- Vincular personal de campo a su huerto sigue siendo cosa del manager (E5)
SELECT sec_test.allow('A.manager', 'still links field staff from another orchard to its own',
    $$UPDATE users SET orchard_id = {A} WHERE id = {B.runner}$$);

-- ── 4) Alta de pickers por el team leader ──────────────────────────────────
SELECT sec_test.allow('A.team_leader', 'adds a picker to its team in its own orchard',
    $$INSERT INTO pickers (picker_id, name, orchard_id, team_leader_id, role, status)
      VALUES ('SECTEST-TL-OWN', 'SecTest new', {A}, auth.uid(), 'picker', 'active')$$);
SELECT sec_test.deny('A.team_leader', 'cannot add a picker in another orchard',
    $$INSERT INTO pickers (picker_id, name, orchard_id, team_leader_id, role, status)
      VALUES ('SECTEST-TL-OTHER', 'SecTest new', {B}, auth.uid(), 'picker', 'active')$$);

SELECT sec_test.finish();
ROLLBACK;
