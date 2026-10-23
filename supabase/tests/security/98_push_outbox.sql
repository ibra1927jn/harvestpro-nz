-- =============================================================================
-- Notificaciones push (20261023060000_push_notifications_outbox):
--   · nadie con sesión lee ni escribe la bandeja (notification_outbox) ni puede
--     llamar a las funciones de reparto: no se manda un push arbitrario a otro;
--   · los triggers avisan a quien toca en cada evento (y no a quien lo hizo);
--   · register_push_subscription: un dispositivo = una cuenta.
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- Ejecuta como un usuario y SE QUEDA el cambio (para mirar después la bandeja)
CREATE FUNCTION sec_test.exec_as(p_who text, p_sql text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM sec_test.become(p_who);
    EXECUTE sec_test.subst(p_sql);
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
END $$;

CREATE FUNCTION sec_test.outbox_for(p_who text, p_type text) RETURNS bigint
LANGUAGE sql AS $$
    SELECT count(*) FROM public.notification_outbox o
    JOIN sec_test.who w ON w.id = o.recipient_id
    WHERE w.key = p_who AND o.type = p_type;
$$;

-- Dispositivos suscritos (sin suscripción no se encola nada)
INSERT INTO public.push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth)
SELECT w.id, 'https://push.example.test/sectest/' || w.key, 'k', 'a'
FROM sec_test.who w
WHERE w.key IN ('A.team_leader', 'A.manager', 'A.logistics', 'A.qc_inspector', 'A.payroll_admin', 'A.hr_admin');

-- ── Bandeja y funciones: fuera del alcance de los clientes ──────────────────
SELECT sec_test.sees('A.manager', 'cannot read the push outbox', $$SELECT * FROM notification_outbox$$, 0);
SELECT sec_test.sees('A.runner', 'cannot read the push outbox', $$SELECT * FROM notification_outbox$$, 0);
SELECT sec_test.deny('A.manager', 'cannot write a push for someone else',
    $$INSERT INTO notification_outbox (recipient_id, type, dedupe_key) VALUES ({A.runner}, 'broadcast', 'x')$$);
SELECT sec_test.deny('A.admin', 'cannot enqueue pushes directly',
    $$SELECT public.enqueue_push(ARRAY[{A.runner}], 'broadcast', '{}'::jsonb, 'x')$$);
SELECT sec_test.deny('A.admin', 'cannot claim the outbox', $$SELECT * FROM public.claim_push_outbox(10)$$);
SELECT sec_test.deny('A.admin', 'cannot run the outbox tick', $$SELECT public.push_outbox_tick()$$);
SELECT sec_test.deny('anon', 'cannot register a push subscription',
    $$SELECT public.register_push_subscription('https://push.example.test/anon', repeat('k', 40), repeat('a', 16))$$);

-- ── Suscripciones ────────────────────────────────────────────────────────────
SELECT sec_test.allow('A.runner2', 'registers its own device',
    $$SELECT public.register_push_subscription('https://push.example.test/sectest/new', repeat('k', 40), repeat('a', 16), 'ua', ARRAY['transport'])$$);
SELECT sec_test.deny('A.runner2', 'rejects a non-https endpoint',
    $$SELECT public.register_push_subscription('http://push.example.test/x', repeat('k', 40), repeat('a', 16))$$, ARRAY['22023']);
SELECT sec_test.deny('A.runner2', 'rejects unknown muted types',
    $$SELECT public.register_push_subscription('https://push.example.test/sectest/bad', repeat('k', 40), repeat('a', 16), 'ua', ARRAY['everything'])$$,
    ARRAY['23514']);
SELECT sec_test.deny('A.runner2', 'cannot change another person''s subscription',
    $$UPDATE push_subscriptions SET muted_types = '{}' WHERE user_id = {A.manager}$$);

-- El móvil del runner pasa a otra cuenta: la del runner deja de recibir en él
SELECT sec_test.exec_as('A.runner2',
    $$SELECT public.register_push_subscription('https://push.example.test/A', repeat('k', 40), repeat('a', 16))$$);
SELECT sec_test.record(
    (SELECT array_agg(w.key) FROM public.push_subscriptions s JOIN sec_test.who w ON w.id = s.user_id
     WHERE s.endpoint = 'https://push.example.test/A') = ARRAY['A.runner2'],
    'register: a device registered by another account leaves the previous one', 'previous account still subscribed');

-- ── Eventos ──────────────────────────────────────────────────────────────────
-- QC: nota A con un criterio «bad» → team leader del picker y managers (no QC)
SELECT sec_test.exec_as('A.qc_inspector',
    $$INSERT INTO qc_inspections (orchard_id, picker_id, inspector_id, grade, criteria)
      VALUES ({A}, {A.picker}, auth.uid(), 'B', '{"ladder":"bad","size":"ok"}')$$);
SELECT sec_test.record(sec_test.outbox_for('A.team_leader', 'qc_reject') = 1, 'event: QC «bad» criterion → team leader', NULL);
SELECT sec_test.record(sec_test.outbox_for('A.manager', 'qc_reject') = 1, 'event: QC «bad» criterion → manager', NULL);
SELECT sec_test.record(sec_test.outbox_for('A.qc_inspector', 'qc_reject') = 0, 'event: QC inspector is not notified of their own inspection', NULL);
-- Una inspección buena no avisa
SELECT sec_test.exec_as('A.qc_inspector',
    $$INSERT INTO qc_inspections (orchard_id, picker_id, inspector_id, grade, criteria)
      VALUES ({A}, {A.picker}, auth.uid(), 'A', '{"ladder":"ok"}')$$);
SELECT sec_test.record(sec_test.outbox_for('A.manager', 'qc_reject') = 1, 'event: a good QC inspection does not notify', NULL);

-- Aviso a team leaders → solo el team leader (no logística ni quien lo manda)
SELECT sec_test.exec_as('A.manager',
    $$INSERT INTO broadcasts (orchard_id, sender_id, title, content, target_roles)
      VALUES ({A}, auth.uid(), 'Rain', 'Stop picking', ARRAY['team_leader'])$$);
SELECT sec_test.record(sec_test.outbox_for('A.team_leader', 'broadcast') = 1, 'event: broadcast → targeted role', NULL);
SELECT sec_test.record(sec_test.outbox_for('A.logistics', 'broadcast') = 0, 'event: broadcast skips roles not targeted', NULL);
SELECT sec_test.record(sec_test.outbox_for('A.manager', 'broadcast') = 0, 'event: broadcast skips its sender', NULL);
-- La bandeja nunca guarda a alguien sin dispositivo
SELECT sec_test.record(NOT EXISTS (
    SELECT 1 FROM public.notification_outbox o
    WHERE NOT EXISTS (SELECT 1 FROM public.push_subscriptions s WHERE s.user_id = o.recipient_id)),
    'event: nobody without a subscribed device is queued', NULL);

-- Transporte: nuevo → logística; asignado y completado → quien lo pidió
SELECT sec_test.exec_as('A.team_leader',
    $$INSERT INTO transport_requests (orchard_id, requested_by, requester_name, zone)
      VALUES ({A}, auth.uid(), 'SecTest TL', 'Z9')$$);
SELECT sec_test.record(sec_test.outbox_for('A.logistics', 'transport_new') = 1, 'event: new transport request → logistics', NULL);
SELECT sec_test.exec_as('A.logistics',
    $$UPDATE transport_requests SET status = 'assigned', assigned_vehicle = {A.vehicle}, assigned_by = auth.uid()
      WHERE id = {A.transport}$$);
SELECT sec_test.record(sec_test.outbox_for('A.team_leader', 'transport_assigned') = 1, 'event: transport assigned → requester', NULL);
SELECT sec_test.exec_as('A.logistics', $$UPDATE transport_requests SET status = 'completed' WHERE id = {A.transport}$$);
SELECT sec_test.record(sec_test.outbox_for('A.team_leader', 'transport_completed') = 1, 'event: transport completed → requester', NULL);

-- Nómina rechaza una hoja de horas → team leader del picker
UPDATE public.daily_attendance SET rejected_by = sec_test.id_of('A.payroll_admin'), rejected_at = now(),
    rejection_reason = 'Check-out missing'
WHERE id = sec_test.id_of('A.att');
SELECT sec_test.record(sec_test.outbox_for('A.team_leader', 'timesheet_rejected') = 1, 'event: payroll rejects a timesheet → team leader', NULL);

-- Ausencia aprobada → quien la pidió
INSERT INTO public.leave_requests (id, orchard_id, picker_id, type, start_date, end_date, requested_by)
VALUES ('5ec7e575-0000-4000-8000-00000000a001', sec_test.id_of('A'), sec_test.id_of('A.picker'), 'sick',
        current_date, current_date, sec_test.id_of('A.team_leader'));
SELECT sec_test.exec_as('A.hr_admin',
    $$UPDATE leave_requests SET status = 'approved', decided_by = auth.uid(), decided_at = now()
      WHERE id = '5ec7e575-0000-4000-8000-00000000a001'$$);
SELECT sec_test.record(sec_test.outbox_for('A.team_leader', 'leave_decided') = 1, 'event: leave approved → requester', NULL);

-- Chat directo: el otro participante, sin el texto
INSERT INTO public.conversations (id, type, participant_ids, created_by)
VALUES ('5ec7e575-0000-4000-8000-00000000c001', 'direct',
        ARRAY[sec_test.id_of('A.runner2')::text, sec_test.id_of('A.team_leader')::text], sec_test.id_of('A.runner2'));
SELECT sec_test.exec_as('A.runner2',
    $$INSERT INTO chat_messages (conversation_id, sender_id, content)
      VALUES ('5ec7e575-0000-4000-8000-00000000c001', auth.uid(), 'Please fix my hours on Monday')$$);
SELECT sec_test.record(sec_test.outbox_for('A.team_leader', 'chat_message') = 1, 'event: direct chat message → the other participant', NULL);
SELECT sec_test.record(NOT EXISTS (
    SELECT 1 FROM public.notification_outbox WHERE type = 'chat_message' AND params::text LIKE '%fix my hours%'),
    'event: a chat message is queued without its text', NULL);

-- Silenciada: nadie
UPDATE public.conversations SET muted_by = ARRAY[sec_test.id_of('A.team_leader')::text]
WHERE id = '5ec7e575-0000-4000-8000-00000000c001';
SELECT sec_test.exec_as('A.runner2',
    $$INSERT INTO chat_messages (conversation_id, sender_id, content)
      VALUES ('5ec7e575-0000-4000-8000-00000000c001', auth.uid(), 'Again')$$);
SELECT sec_test.record(sec_test.outbox_for('A.team_leader', 'chat_message') = 1, 'event: a muted conversation does not notify', NULL);

-- Reparto: dos «flush» a la vez no cogen lo mismo
SELECT sec_test.record(
    (SELECT count(*) FROM public.claim_push_outbox(500)) > 0
    AND (SELECT count(*) FROM public.claim_push_outbox(500)) = 0,
    'claim: a second claim does not take rows already claimed', NULL);

SELECT sec_test.finish();
ROLLBACK;
