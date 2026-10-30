-- =============================================================================
-- Matriz de acceso: TODAS las tablas de public, rol por rol (Fase 2)
--
-- Para cada tabla, una fila de prueba del huerto A y otra del huerto B (o de
-- otro dueño si la tabla no es de un huerto), y siete operaciones:
--   read_a / read_b     ¿ve la fila?
--   insert              ¿puede crear una fila nueva (en el huerto A)?
--   update_a / update_b ¿puede modificar la fila? (UPDATE que no cambia nada:
--                       solo mira las reglas, no los datos)
--   delete_a / delete_b ¿puede borrarla?
-- Cada operación se prueba con cada usuario de sec_test.users y se compara con
-- la lista de quién DEBE poder hacerla (sec_test.m_expect). Todo usuario que no
-- esté en la lista debe ser rechazado. Un fallo dice quién sobra («extra»:
-- puede y no debería) y quién falta («missing»: debería y no puede).
--
-- Abreviaturas en las listas: 'A.*' = todos los roles activos del huerto A
-- (con 2FA), 'B.*' = igual en B. Las sesiones sin 2FA (@aal1), las cuentas de
-- baja y anon solo cuentan si se nombran.
--
-- Las decisiones (quién lee y quién escribe) son las de docs/PLAN_NIVEL.md
-- («Decisiones del dueño») y las auditorías; cada bloque dice la suya. Los
-- detalles finos de cada tabla (columnas, estados, triggers) siguen en sus
-- propios archivos 9x_*.sql: aquí solo se mira quién llega a cada fila.
--
-- El último bloque comprueba que ninguna tabla de public se queda fuera.
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- ── Filas de prueba que el arnés no crea ────────────────────────────────────
INSERT INTO sec_test.ids VALUES ('C', gen_random_uuid());
INSERT INTO public.orchards (id, code, name)
SELECT id, 'SECTEST-C', 'Security test orchard C (no settings)' FROM sec_test.ids WHERE key = 'C';

DO $$
DECLARE
    o text;
    v_id uuid;
    v_today date := (now() AT TIME ZONE 'Pacific/Auckland')::date;
BEGIN
    FOREACH o IN ARRAY ARRAY['A', 'B'] LOOP
        INSERT INTO public.anomaly_dismissals (orchard_id, anomaly_key, anomaly_type, dismissed_by)
        VALUES (sec_test.id_of(o), 'sectest-matrix-' || o, 'sectest', sec_test.id_of(o || '.manager'))
        RETURNING id INTO v_id;
        INSERT INTO sec_test.ids VALUES (o || '.dismissal', v_id);

        INSERT INTO public.chat_message_reactions (message_id, user_id, emoji, conversation_id)
        VALUES (sec_test.id_of(o || '.chat'), sec_test.id_of(o || '.runner'), '❤️', sec_test.id_of(o || '.conv'));

        INSERT INTO public.leave_requests (orchard_id, picker_id, type, start_date, end_date, status, requested_by)
        VALUES (sec_test.id_of(o), sec_test.id_of(o || '.picker'), 'annual', v_today + 60, v_today + 61,
                'requested', sec_test.id_of(o || '.team_leader'))
        RETURNING id INTO v_id;
        INSERT INTO sec_test.ids VALUES (o || '.leave', v_id);

        INSERT INTO public.notification_outbox (recipient_id, orchard_id, type, dedupe_key)
        VALUES (sec_test.id_of(o || '.runner'), sec_test.id_of(o), 'broadcast', 'sectest-matrix-' || o)
        RETURNING id INTO v_id;
        INSERT INTO sec_test.ids VALUES (o || '.outbox', v_id);

        INSERT INTO public.piece_rates (orchard_id, effective_date, piece_rate, set_by)
        VALUES (sec_test.id_of(o), v_today + 5, 7.25, sec_test.id_of(o || '.manager'))
        RETURNING id INTO v_id;
        INSERT INTO sec_test.ids VALUES (o || '.piece_rate', v_id);

        INSERT INTO public.privacy_consent_log (user_id, consent_type)
        VALUES (sec_test.id_of(o || '.runner'), 'privacy_policy')
        RETURNING id INTO v_id;
        INSERT INTO sec_test.ids VALUES (o || '.consent', v_id);

        INSERT INTO public.rejected_scans (id, orchard_id, reported_by, picker_code, reason)
        VALUES (gen_random_uuid(), sec_test.id_of(o), sec_test.id_of(o || '.runner'), 'SECTEST', 'sectest matrix')
        RETURNING id INTO v_id;
        INSERT INTO sec_test.ids VALUES (o || '.rejected', v_id);
    END LOOP;

    INSERT INTO public.payroll_exports (exported_by, week_start, week_end, format, filename)
    VALUES (sec_test.id_of('A.payroll_admin'), DATE '2020-01-06', DATE '2020-01-12', 'csv', 'sectest.csv')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('export', v_id);
END $$;

-- ── Usuarios que se prueban ─────────────────────────────────────────────────
CREATE TABLE sec_test.users (who text PRIMARY KEY, grp text);
INSERT INTO sec_test.users VALUES
    ('anon', NULL),
    ('A.admin', 'A.*'), ('A.manager', 'A.*'), ('A.team_leader', 'A.*'), ('A.team_leader2', 'A.*'),
    ('A.runner', 'A.*'), ('A.qc_inspector', 'A.*'), ('A.logistics', 'A.*'), ('A.hr_admin', 'A.*'),
    ('A.payroll_admin', 'A.*'),
    ('A.inactive_manager', NULL), ('A.manager@aal1', NULL), ('A.hr_admin@aal1', NULL),
    ('B.admin', 'B.*'), ('B.manager', 'B.*'), ('B.team_leader', 'B.*'), ('B.runner', 'B.*'),
    ('B.qc_inspector', 'B.*'), ('B.logistics', 'B.*'), ('B.hr_admin', 'B.*'), ('B.payroll_admin', 'B.*');

-- ── Las tablas: fila de A, fila de B y cómo se crea una fila nueva ─────────
-- where_b NULL = la tabla no tiene «otra» fila que probar (fila única).
-- insert_sql NULL = el alta tiene su propio archivo (se dice cuál).
CREATE TABLE sec_test.m_tables (tbl text PRIMARY KEY, where_a text NOT NULL, where_b text, insert_sql text);
INSERT INTO sec_test.m_tables VALUES
('allowed_registrations', 'id = {A.invite}', 'id = {B.invite}',
 $$INSERT INTO public.allowed_registrations (email, assigned_role, orchard_id, created_by) VALUES ('sectest.matrix-new@example.test', 'runner', {A}, auth.uid())$$),
('anomaly_dismissals', 'id = {A.dismissal}', 'id = {B.dismissal}',
 $$INSERT INTO public.anomaly_dismissals (orchard_id, anomaly_key, anomaly_type, dismissed_by) VALUES ({A}, 'sectest-matrix-new', 'sectest', auth.uid())$$),
('audit_logs', 'id = {A.audit}', 'id = {B.audit}',
 $$INSERT INTO public.audit_logs (user_id, action, table_name) VALUES (auth.uid(), 'CUSTOM', 'sectest')$$),
('bins', 'id = {A.bin}', 'id = {B.bin}',
 $$INSERT INTO public.bins (orchard_id, bin_code, status) VALUES ({A}, 'SECTEST-NEW', 'empty')$$),
('block_rows', 'id = {A.row}', 'id = {B.row}',
 $$INSERT INTO public.block_rows (block_id, row_number) VALUES ({A.block}, 99)$$),
('broadcasts', 'id = {A.broadcast}', 'id = {B.broadcast}',
 $$INSERT INTO public.broadcasts (orchard_id, sender_id, title, content) VALUES ({A}, auth.uid(), 'SecTest', 'matrix')$$),
('bucket_records', 'id = {A.bucket}', 'id = {B.bucket}',
 $$INSERT INTO public.bucket_records (orchard_id, picker_id, scanned_by, scanned_at, quality_grade) VALUES ({A}, {A.picker}, auth.uid(), now(), 'A')$$),
('chat_message_reactions', 'message_id = {A.chat}', 'message_id = {B.chat}',
 $$INSERT INTO public.chat_message_reactions (message_id, user_id, emoji, conversation_id) VALUES ({A.chat}, auth.uid(), '👍', {A.conv})$$),
('chat_messages', 'id = {A.chat}', 'id = {B.chat}',
 $$INSERT INTO public.chat_messages (conversation_id, sender_id, content) VALUES ({A.conv}, auth.uid(), 'matrix')$$),
('contracts', 'id = {A.contract}', 'id = {B.contract}',
 $$INSERT INTO public.contracts (employee_id, orchard_id, type, status, start_date, created_by) VALUES ({A.qc_inspector}, {A}, 'casual', 'draft', CURRENT_DATE, auth.uid())$$),
('conversations', 'id = {A.conv}', 'id = {B.conv}',
 $$INSERT INTO public.conversations (type, participant_ids, created_by) VALUES ('direct', ARRAY[auth.uid()::text, {A.runner}::text], auth.uid())$$),
('daily_attendance', 'id = {A.att}', 'id = {B.att}',
 $$INSERT INTO public.daily_attendance (picker_id, orchard_id, date, check_in, status) VALUES ({A.picker}, {A}, (now() AT TIME ZONE 'Pacific/Auckland')::date - 3, now() - interval '3 days', 'present')$$),
('day_closures', 'id = {A.closure}', 'id = {B.closure}',
 $$INSERT INTO public.day_closures (orchard_id, date, status, closed_by) VALUES ({A}, CURRENT_DATE - 500, 'closed', auth.uid())$$),
('day_setups', 'id = {A.setup}', 'id = {B.setup}',
 $$INSERT INTO public.day_setups (orchard_id, date, piece_rate, min_wage_rate, created_by) VALUES ({A}, CURRENT_DATE + 301, 6.50, 23.95, auth.uid())$$),
('fleet_vehicles', 'id = {A.vehicle}', 'id = {B.vehicle}',
 $$INSERT INTO public.fleet_vehicles (orchard_id, name) VALUES ({A}, 'SecTest new truck')$$),
('harvest_seasons', 'id = {A.season}', 'id = {B.season}',
 $$INSERT INTO public.harvest_seasons (orchard_id, name, start_date, status) VALUES ({A}, 'SecTest new season', CURRENT_DATE, 'planning')$$),
-- Una fila por huerto: el alta se prueba en un huerto C sin configuración
('harvest_settings', 'orchard_id = {A}', 'orchard_id = {B}',
 $$INSERT INTO public.harvest_settings (orchard_id, piece_rate, min_wage_rate) VALUES ({C}, 6.50, 23.95)$$),
('hr_documents', 'id = {A.hrdoc}', 'id = {B.hrdoc}',
 $$INSERT INTO public.hr_documents (orchard_id, user_id, document_type, title, storage_path, uploaded_by) VALUES ({A}, {A.runner}, 'other', 'SecTest new', 'A/new.pdf', auth.uid())$$),
('leave_requests', 'id = {A.leave}', 'id = {B.leave}',
 $$INSERT INTO public.leave_requests (orchard_id, picker_id, type, start_date, end_date, status, requested_by) VALUES ({A}, {A.picker}, 'annual', CURRENT_DATE + 80, CURRENT_DATE + 81, 'requested', auth.uid())$$),
('notification_outbox', 'id = {A.outbox}', 'id = {B.outbox}',
 $$INSERT INTO public.notification_outbox (recipient_id, type, dedupe_key) VALUES (auth.uid(), 'broadcast', 'sectest-matrix-new')$$),
('orchard_blocks', 'id = {A.block}', 'id = {B.block}',
 $$INSERT INTO public.orchard_blocks (orchard_id, season_id, name) VALUES ({A}, {A.season}, 'SecTest new block')$$),
('orchards', 'id = {A}', 'id = {B}',
 $$INSERT INTO public.orchards (code, name) VALUES ('SECTEST-NEW', 'SecTest new orchard')$$),
-- Semanas de pago: de la empresa (sin huerto), una sola fila de prueba
('pay_weeks', 'id = {payweek}', NULL,
 $$INSERT INTO public.pay_weeks (week_start, week_end, status, snapshot) VALUES (DATE '2019-01-07', DATE '2019-01-13', 'closed', '{}')$$),
('payroll_exports', 'id = {export}', NULL,
 $$INSERT INTO public.payroll_exports (exported_by, week_start, week_end, format, filename) VALUES (auth.uid(), DATE '2020-01-06', DATE '2020-01-12', 'csv', 'sectest-new.csv')$$),
('pickers', 'id = {A.picker}', 'id = {B.picker}',
 $$INSERT INTO public.pickers (picker_id, name, orchard_id, team_leader_id, role, status) VALUES ('SECTEST-NEW', 'SecTest new picker', {A}, auth.uid(), 'picker', 'active')$$),
('piece_rates', 'id = {A.piece_rate}', 'id = {B.piece_rate}',
 $$INSERT INTO public.piece_rates (orchard_id, effective_date, piece_rate, set_by) VALUES ({A}, CURRENT_DATE + 10, 7.50, auth.uid())$$),
('privacy_consent_log', 'id = {A.consent}', 'id = {B.consent}',
 $$INSERT INTO public.privacy_consent_log (user_id, consent_type) VALUES (auth.uid(), 'privacy_policy')$$),
('push_subscriptions', 'id = {A.push}', 'id = {B.push}',
 $$INSERT INTO public.push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth) VALUES (auth.uid(), 'https://push.example.test/new', 'k', 'a')$$),
('qc_inspections', 'id = {A.qc}', 'id = {B.qc}',
 $$INSERT INTO public.qc_inspections (orchard_id, picker_id, inspector_id, grade) VALUES ({A}, {A.picker}, auth.uid(), 'B')$$),
('rejected_scans', 'id = {A.rejected}', 'id = {B.rejected}',
 $$INSERT INTO public.rejected_scans (id, orchard_id, reported_by, picker_code, reason) VALUES (gen_random_uuid(), {A}, auth.uid(), 'SECTEST', 'matrix')$$),
('row_assignments', 'id = {A.rowasg}', 'id = {B.rowasg}',
 $$INSERT INTO public.row_assignments (orchard_id, row_number, assigned_pickers, team_leader_id) VALUES ({A}, 50, ARRAY[{A.picker}], auth.uid())$$),
-- Interruptor único (una sola fila): nadie lo toca por la API
('security_settings', 'id', NULL,
 $$INSERT INTO public.security_settings (id, enforce_mfa) VALUES (true, false)$$),
('transport_requests', 'id = {A.transport}', 'id = {B.transport}',
 $$INSERT INTO public.transport_requests (orchard_id, requested_by, requester_name, zone) VALUES ({A}, auth.uid(), 'SecTest', 'Z9')$$),
-- El alta de un perfil (con invitación) está en 97_invitations.sql
('users', 'id = {A.runner}', 'id = {B.runner}', NULL),
('variety_rates', 'id = {A.vrate}', 'id = {B.vrate}',
 $$INSERT INTO public.variety_rates (orchard_id, variety, piece_rate) VALUES ({A}, 'SecTestNewVariety', 7.00)$$);

-- ── Quién DEBE poder (todos los demás, rechazados) ──────────────────────────
CREATE TABLE sec_test.m_expect (tbl text NOT NULL, op text NOT NULL, allowed text[] NOT NULL,
                                PRIMARY KEY (tbl, op));
-- Por defecto nadie; abajo, quién sí.
INSERT INTO sec_test.m_expect
SELECT t.tbl, o.op, '{}' FROM sec_test.m_tables t
CROSS JOIN unnest(ARRAY['read_a', 'read_b', 'insert', 'update_a', 'update_b', 'delete_a', 'delete_b']) AS o(op);

CREATE FUNCTION sec_test.m_allow(p_tbl text, p_ops text[], p_allowed text[]) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE sec_test.m_expect SET allowed = p_allowed WHERE tbl = p_tbl AND op = ANY (p_ops);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'sec_test: no matrix entry for % %', p_tbl, p_ops;
    END IF;
END $$;

DO $$
DECLARE
    -- Roles de empresa que leen la nómina de todos los huertos (can_read_company_payroll)
    co_a text[] := ARRAY['A.admin', 'A.manager', 'A.hr_admin', 'A.payroll_admin'];
    co_b text[] := ARRAY['B.admin', 'B.manager', 'B.hr_admin', 'B.payroll_admin'];
    -- Oficina de la empresa (todos los huertos): fichajes y cubetas (20261027070000)
    of_a text[] := ARRAY['A.admin', 'A.hr_admin', 'A.payroll_admin'];
    of_b text[] := ARRAY['B.admin', 'B.hr_admin', 'B.payroll_admin'];
BEGIN
    -- Invitaciones: admin y RRHH, de toda la empresa (decisión: «invitar usuarios: admin y RRHH»).
    -- La persona invitada lee la suya por su email (97_invitations.sql).
    PERFORM sec_test.m_allow('allowed_registrations', ARRAY['read_a', 'read_b', 'insert', 'update_a', 'update_b', 'delete_a', 'delete_b'],
        ARRAY['A.admin', 'A.hr_admin', 'B.admin', 'B.hr_admin']);

    -- Anomalías descartadas: el manager de su huerto (borra solo lo que descartó él) y admin
    PERFORM sec_test.m_allow('anomaly_dismissals', ARRAY['read_a', 'insert', 'delete_a'], ARRAY['A.admin', 'A.manager', 'B.admin']);
    PERFORM sec_test.m_allow('anomaly_dismissals', ARRAY['read_b', 'delete_b'], ARRAY['A.admin', 'B.admin', 'B.manager']);

    -- Auditoría: la leen managers y admin; cada cuenta activa escribe las suyas; nadie la cambia
    PERFORM sec_test.m_allow('audit_logs', ARRAY['read_a', 'read_b'], ARRAY['A.admin', 'A.manager', 'B.admin', 'B.manager']);
    PERFORM sec_test.m_allow('audit_logs', ARRAY['insert'], ARRAY['A.*', 'B.*']);

    -- Bins: los ve todo el huerto; los crean runner, logística, TL, manager y admin;
    -- los mueven runner, logística, TL y manager; los quitan TL y manager
    PERFORM sec_test.m_allow('bins', ARRAY['read_a'], ARRAY['A.*']);
    PERFORM sec_test.m_allow('bins', ARRAY['read_b'], ARRAY['B.*']);
    PERFORM sec_test.m_allow('bins', ARRAY['insert'],
        ARRAY['A.admin', 'A.manager', 'A.team_leader', 'A.team_leader2', 'A.runner', 'A.logistics']);
    PERFORM sec_test.m_allow('bins', ARRAY['update_a'], ARRAY['A.manager', 'A.team_leader', 'A.team_leader2', 'A.runner', 'A.logistics']);
    PERFORM sec_test.m_allow('bins', ARRAY['update_b'], ARRAY['B.manager', 'B.team_leader', 'B.runner', 'B.logistics']);
    PERFORM sec_test.m_allow('bins', ARRAY['delete_a'], ARRAY['A.manager', 'A.team_leader', 'A.team_leader2']);
    PERFORM sec_test.m_allow('bins', ARRAY['delete_b'], ARRAY['B.manager', 'B.team_leader']);

    -- Estructura del huerto (temporadas, bloques, filas): la lee su huerto (y admin);
    -- la cambian el manager de su huerto y admin; no se borra (se archiva)
    PERFORM sec_test.m_allow(t, ARRAY['read_a'], ARRAY['A.*', 'B.admin']) FROM unnest(ARRAY['harvest_seasons', 'orchard_blocks', 'block_rows']) t;
    PERFORM sec_test.m_allow(t, ARRAY['read_b'], ARRAY['B.*', 'A.admin']) FROM unnest(ARRAY['harvest_seasons', 'orchard_blocks', 'block_rows']) t;
    PERFORM sec_test.m_allow(t, ARRAY['insert', 'update_a'], ARRAY['A.admin', 'A.manager', 'B.admin']) FROM unnest(ARRAY['harvest_seasons', 'orchard_blocks', 'block_rows']) t;
    PERFORM sec_test.m_allow(t, ARRAY['update_b'], ARRAY['A.admin', 'B.admin', 'B.manager']) FROM unnest(ARRAY['harvest_seasons', 'orchard_blocks', 'block_rows']) t;

    -- Avisos del manager: los lee su huerto; los escriben manager y admin del huerto
    PERFORM sec_test.m_allow('broadcasts', ARRAY['read_a'], ARRAY['A.*']);
    PERFORM sec_test.m_allow('broadcasts', ARRAY['read_b'], ARRAY['B.*']);
    PERFORM sec_test.m_allow('broadcasts', ARRAY['insert', 'update_a', 'delete_a'], ARRAY['A.admin', 'A.manager']);
    PERFORM sec_test.m_allow('broadcasts', ARRAY['update_b', 'delete_b'], ARRAY['B.admin', 'B.manager']);

    -- Cubetas: las ve su huerto y la oficina de la empresa (admin, RRHH, nómina); el manager
    -- de otro huerto no (20261027070000); escanean runner, TL, manager y admin; corrigen
    -- manager de su huerto y admin
    PERFORM sec_test.m_allow('bucket_records', ARRAY['read_a'], ARRAY['A.*'] || of_b);
    PERFORM sec_test.m_allow('bucket_records', ARRAY['read_b'], ARRAY['B.*'] || of_a);
    PERFORM sec_test.m_allow('bucket_records', ARRAY['insert'],
        ARRAY['A.admin', 'A.manager', 'A.team_leader', 'A.team_leader2', 'A.runner', 'B.admin']);
    PERFORM sec_test.m_allow('bucket_records', ARRAY['update_a', 'delete_a'], ARRAY['A.admin', 'A.manager', 'B.admin']);
    PERFORM sec_test.m_allow('bucket_records', ARRAY['update_b', 'delete_b'], ARRAY['A.admin', 'B.admin', 'B.manager']);

    -- Chat: solo quien participa en la conversación (A.conv = A.manager y A.runner)
    PERFORM sec_test.m_allow('conversations', ARRAY['read_a'], ARRAY['A.manager', 'A.runner']);
    PERFORM sec_test.m_allow('conversations', ARRAY['read_b'], ARRAY['B.manager', 'B.runner']);
    PERFORM sec_test.m_allow('conversations', ARRAY['insert'], ARRAY['A.*', 'B.*']);
    PERFORM sec_test.m_allow('chat_messages', ARRAY['read_a', 'insert'], ARRAY['A.manager', 'A.runner']);
    PERFORM sec_test.m_allow('chat_messages', ARRAY['read_b'], ARRAY['B.manager', 'B.runner']);
    PERFORM sec_test.m_allow('chat_message_reactions', ARRAY['read_a', 'insert'], ARRAY['A.manager', 'A.runner']);
    PERFORM sec_test.m_allow('chat_message_reactions', ARRAY['read_b'], ARRAY['B.manager', 'B.runner']);
    -- La reacción de prueba es de A.runner (B.runner en B): solo la quita quien la puso
    PERFORM sec_test.m_allow('chat_message_reactions', ARRAY['delete_a'], ARRAY['A.runner']);
    PERFORM sec_test.m_allow('chat_message_reactions', ARRAY['delete_b'], ARRAY['B.runner']);

    -- Contratos (del runner): los gestiona RRHH y admin; los leen la persona y los roles de empresa
    PERFORM sec_test.m_allow('contracts', ARRAY['read_a'], co_a || co_b || ARRAY['A.runner']);
    PERFORM sec_test.m_allow('contracts', ARRAY['read_b'], co_a || co_b || ARRAY['B.runner']);
    PERFORM sec_test.m_allow('contracts', ARRAY['insert', 'update_a', 'update_b', 'delete_a', 'delete_b'],
        ARRAY['A.admin', 'A.hr_admin', 'B.admin', 'B.hr_admin']);

    -- Fichajes (de un picker del equipo de A.team_leader): los leen admin, manager y RRHH de su
    -- huerto, la oficina de la empresa y su TL (no el manager de otro huerto, 20261027070000; no
    -- runner, QC ni logística: usan presence_today); los corrigen admin, manager y RRHH de su
    -- huerto y su TL (A2); la persona no corrige lo suyo
    PERFORM sec_test.m_allow('daily_attendance', ARRAY['read_a'], co_a || of_b || ARRAY['A.team_leader']);
    PERFORM sec_test.m_allow('daily_attendance', ARRAY['read_b'], co_b || of_a || ARRAY['B.team_leader']);
    PERFORM sec_test.m_allow('daily_attendance', ARRAY['insert', 'update_a', 'delete_a'],
        ARRAY['A.admin', 'A.manager', 'A.hr_admin', 'A.team_leader', 'B.admin']);
    PERFORM sec_test.m_allow('daily_attendance', ARRAY['update_b', 'delete_b'],
        ARRAY['A.admin', 'B.admin', 'B.manager', 'B.hr_admin', 'B.team_leader']);

    -- Cierre del día y preparación del día: los lee su huerto (y admin); los hace el manager
    -- de su huerto y admin. Nadie de otro huerto ni de baja los lee (Fase 2). La preparación
    -- lleva el precio del día: RRHH y nómina la leen de todos los huertos (96_piece_rates).
    PERFORM sec_test.m_allow('day_closures', ARRAY['read_a'], ARRAY['A.*', 'B.admin']);
    PERFORM sec_test.m_allow('day_closures', ARRAY['read_b'], ARRAY['B.*', 'A.admin']);
    PERFORM sec_test.m_allow('day_setups', ARRAY['read_a'], ARRAY['A.*', 'B.admin', 'B.hr_admin', 'B.payroll_admin']);
    PERFORM sec_test.m_allow('day_setups', ARRAY['read_b'], ARRAY['B.*', 'A.admin', 'A.hr_admin', 'A.payroll_admin']);
    PERFORM sec_test.m_allow(t, ARRAY['insert', 'update_a', 'delete_a'], ARRAY['A.admin', 'A.manager', 'B.admin'])
    FROM unnest(ARRAY['day_closures', 'day_setups']) t;
    PERFORM sec_test.m_allow(t, ARRAY['update_b', 'delete_b'], ARRAY['A.admin', 'B.admin', 'B.manager'])
    FROM unnest(ARRAY['day_closures', 'day_setups']) t;

    -- Flota: la ve su huerto; la gestionan logística, manager y admin del huerto (B6)
    PERFORM sec_test.m_allow('fleet_vehicles', ARRAY['read_a'], ARRAY['A.*']);
    PERFORM sec_test.m_allow('fleet_vehicles', ARRAY['read_b'], ARRAY['B.*']);
    PERFORM sec_test.m_allow('fleet_vehicles', ARRAY['insert', 'update_a', 'delete_a'], ARRAY['A.admin', 'A.manager', 'A.logistics']);
    PERFORM sec_test.m_allow('fleet_vehicles', ARRAY['update_b', 'delete_b'], ARRAY['B.admin', 'B.manager', 'B.logistics']);

    -- Configuración del huerto (lleva el precio por cubeta guardado): la lee su huerto y
    -- admin, RRHH y nómina de la empresa, el manager solo la suya (99_harvest_settings_read);
    -- la cambian manager de su huerto y admin; una huerta nueva (C) solo la da de alta admin
    PERFORM sec_test.m_allow('harvest_settings', ARRAY['read_a'], ARRAY['A.*', 'B.admin', 'B.hr_admin', 'B.payroll_admin']);
    PERFORM sec_test.m_allow('harvest_settings', ARRAY['read_b'], ARRAY['B.*', 'A.admin', 'A.hr_admin', 'A.payroll_admin']);
    PERFORM sec_test.m_allow('harvest_settings', ARRAY['insert'], ARRAY['A.admin', 'B.admin']);
    PERFORM sec_test.m_allow('harvest_settings', ARRAY['update_a', 'delete_a'], ARRAY['A.admin', 'A.manager', 'B.admin']);
    PERFORM sec_test.m_allow('harvest_settings', ARRAY['update_b', 'delete_b'], ARRAY['A.admin', 'B.admin', 'B.manager']);

    -- Documentos de RRHH (del runner): los gestiona RRHH y admin; el manager ve la lista
    -- (avisos de visados, 90_hardening_2) y la persona los suyos
    PERFORM sec_test.m_allow('hr_documents', ARRAY['read_a'],
        ARRAY['A.admin', 'A.hr_admin', 'A.manager', 'A.runner', 'B.admin', 'B.hr_admin', 'B.manager']);
    PERFORM sec_test.m_allow('hr_documents', ARRAY['read_b'],
        ARRAY['A.admin', 'A.hr_admin', 'A.manager', 'B.admin', 'B.hr_admin', 'B.manager', 'B.runner']);
    PERFORM sec_test.m_allow('hr_documents', ARRAY['insert', 'update_a', 'update_b', 'delete_a', 'delete_b'],
        ARRAY['A.admin', 'A.hr_admin', 'B.admin', 'B.hr_admin']);

    -- Ausencias (de {A,B}.picker, del equipo de {A,B}.team_leader): las leen el manager de
    -- su huerto, el TL solo las de SU equipo (20261027040000), RRHH, nómina y admin de la
    -- empresa y la propia persona (runner, QC y logística no: ven «de permiso» con
    -- presence_today, Fase 2; 99_team_scope_leave_qc_rows.sql). Las piden
    -- TL (su equipo), manager, RRHH y admin; deciden manager de su huerto, RRHH y admin
    PERFORM sec_test.m_allow('leave_requests', ARRAY['read_a'],
        ARRAY['A.admin', 'A.manager', 'A.hr_admin', 'A.payroll_admin', 'A.team_leader',
              'B.admin', 'B.hr_admin', 'B.payroll_admin']);
    PERFORM sec_test.m_allow('leave_requests', ARRAY['read_b'],
        ARRAY['B.admin', 'B.manager', 'B.hr_admin', 'B.payroll_admin', 'B.team_leader',
              'A.admin', 'A.hr_admin', 'A.payroll_admin']);
    PERFORM sec_test.m_allow('leave_requests', ARRAY['insert'],
        ARRAY['A.admin', 'A.manager', 'A.hr_admin', 'A.team_leader', 'B.admin', 'B.hr_admin']);
    PERFORM sec_test.m_allow('leave_requests', ARRAY['update_a'], ARRAY['A.admin', 'A.manager', 'A.hr_admin', 'B.admin', 'B.hr_admin']);
    PERFORM sec_test.m_allow('leave_requests', ARRAY['update_b'], ARRAY['A.admin', 'A.hr_admin', 'B.admin', 'B.manager', 'B.hr_admin']);

    -- notification_outbox y security_settings: nadie por la API (solo el servidor)

    -- Huertos: la lista la lee toda la plantilla activa (también sin 2FA: solo nombres);
    -- crea admin; cambia el manager el suyo y admin; nadie borra
    PERFORM sec_test.m_allow('orchards', ARRAY['read_a', 'read_b'], ARRAY['A.*', 'B.*', 'A.manager@aal1', 'A.hr_admin@aal1']);
    PERFORM sec_test.m_allow('orchards', ARRAY['insert'], ARRAY['A.admin', 'B.admin']);
    PERFORM sec_test.m_allow('orchards', ARRAY['update_a'], ARRAY['A.admin', 'A.manager', 'B.admin']);
    PERFORM sec_test.m_allow('orchards', ARRAY['update_b'], ARRAY['A.admin', 'B.admin', 'B.manager']);

    -- Semanas de pago (la foto es la nómina de la empresa): solo admin, RRHH y nómina;
    -- el manager no, ve la parte de su huerto por calculate-payroll (20261027060000).
    -- Se cierran y reabren por la Edge Function
    PERFORM sec_test.m_allow('pay_weeks', ARRAY['read_a'],
        ARRAY['A.admin', 'A.hr_admin', 'A.payroll_admin', 'B.admin', 'B.hr_admin', 'B.payroll_admin']);

    -- Exportaciones de nómina: nómina y admin
    PERFORM sec_test.m_allow('payroll_exports', ARRAY['read_a', 'insert', 'delete_a'],
        ARRAY['A.admin', 'A.payroll_admin', 'B.admin', 'B.payroll_admin']);

    -- Personas (el picker es del equipo de A.team_leader): la plantilla es de la empresa y la
    -- lee entera; RRHH y admin gestionan; el TL añade a su equipo en su huerto y edita el suyo;
    -- el manager edita (sin mover de equipo ni dar de baja: trigger, 25_picker_teams)
    PERFORM sec_test.m_allow('pickers', ARRAY['read_a', 'read_b'], ARRAY['A.*', 'B.*']);
    PERFORM sec_test.m_allow('pickers', ARRAY['insert'],
        ARRAY['A.admin', 'A.hr_admin', 'A.team_leader', 'A.team_leader2', 'B.admin', 'B.hr_admin']);
    PERFORM sec_test.m_allow('pickers', ARRAY['update_a'],
        ARRAY['A.admin', 'A.hr_admin', 'A.manager', 'A.team_leader', 'B.admin', 'B.hr_admin', 'B.manager']);
    PERFORM sec_test.m_allow('pickers', ARRAY['update_b'],
        ARRAY['A.admin', 'A.hr_admin', 'A.manager', 'B.admin', 'B.hr_admin', 'B.manager', 'B.team_leader']);
    PERFORM sec_test.m_allow('pickers', ARRAY['delete_a', 'delete_b'], ARRAY['A.admin', 'A.hr_admin', 'B.admin', 'B.hr_admin']);

    -- Precios por día (A4) y tarifas por variedad (obsoleta): cada uno los de su huerto;
    -- admin, RRHH y nómina los de todos (decisión del dueño 2026-10-27: 96_piece_rates);
    -- los pone el manager de su huerto y admin
    PERFORM sec_test.m_allow(t, ARRAY['read_a'], ARRAY['A.*', 'B.admin', 'B.hr_admin', 'B.payroll_admin'])
    FROM unnest(ARRAY['piece_rates', 'variety_rates']) t;
    PERFORM sec_test.m_allow(t, ARRAY['read_b'], ARRAY['B.*', 'A.admin', 'A.hr_admin', 'A.payroll_admin'])
    FROM unnest(ARRAY['piece_rates', 'variety_rates']) t;
    PERFORM sec_test.m_allow(t, ARRAY['insert', 'update_a', 'delete_a'], ARRAY['A.admin', 'A.manager', 'B.admin'])
    FROM unnest(ARRAY['piece_rates', 'variety_rates']) t;
    PERFORM sec_test.m_allow(t, ARRAY['update_b', 'delete_b'], ARRAY['A.admin', 'B.admin', 'B.manager'])
    FROM unnest(ARRAY['piece_rates', 'variety_rates']) t;

    -- Consentimiento de privacidad: cada cuenta activa el suyo (también sin 2FA: es al entrar)
    PERFORM sec_test.m_allow('privacy_consent_log', ARRAY['read_a'], ARRAY['A.runner']);
    PERFORM sec_test.m_allow('privacy_consent_log', ARRAY['read_b'], ARRAY['B.runner']);
    PERFORM sec_test.m_allow('privacy_consent_log', ARRAY['insert'], ARRAY['A.*', 'B.*', 'A.manager@aal1', 'A.hr_admin@aal1']);

    -- Avisos push: cada cuenta activa sus móviles
    PERFORM sec_test.m_allow('push_subscriptions', ARRAY['read_a', 'update_a', 'delete_a'], ARRAY['A.runner']);
    PERFORM sec_test.m_allow('push_subscriptions', ARRAY['read_b', 'update_b', 'delete_b'], ARRAY['B.runner']);
    PERFORM sec_test.m_allow('push_subscriptions', ARRAY['insert'], ARRAY['A.*', 'B.*']);

    -- Inspecciones de calidad ({A,B}.qc: de {A,B}.qc_inspector a {A,B}.picker, del equipo de
    -- {A,B}.team_leader), con el bienestar (20261027040000): las ven el manager de su huerto,
    -- RRHH y admin de la empresa, el TL del equipo del picker y el inspector que la hizo; nadie
    -- más (runner, logística, nómina, el otro TL). Las hacen QC, manager y admin del huerto; las
    -- cambian y borran manager y admin del huerto (QC ya no)
    PERFORM sec_test.m_allow('qc_inspections', ARRAY['read_a'],
        ARRAY['A.admin', 'A.manager', 'A.hr_admin', 'A.team_leader', 'A.qc_inspector', 'B.admin', 'B.hr_admin']);
    PERFORM sec_test.m_allow('qc_inspections', ARRAY['read_b'],
        ARRAY['B.admin', 'B.manager', 'B.hr_admin', 'B.team_leader', 'B.qc_inspector', 'A.admin', 'A.hr_admin']);
    PERFORM sec_test.m_allow('qc_inspections', ARRAY['insert'], ARRAY['A.admin', 'A.manager', 'A.qc_inspector']);
    PERFORM sec_test.m_allow('qc_inspections', ARRAY['update_a', 'delete_a'], ARRAY['A.admin', 'A.manager']);
    PERFORM sec_test.m_allow('qc_inspections', ARRAY['update_b', 'delete_b'], ARRAY['B.admin', 'B.manager']);

    -- Escaneos rechazados (de A.runner): los apunta quien escanea; los leen manager, admin y
    -- quien los apuntó; no se cambian
    PERFORM sec_test.m_allow('rejected_scans', ARRAY['read_a'], ARRAY['A.admin', 'A.manager', 'A.runner', 'B.admin']);
    PERFORM sec_test.m_allow('rejected_scans', ARRAY['read_b'], ARRAY['A.admin', 'B.admin', 'B.manager', 'B.runner']);
    PERFORM sec_test.m_allow('rejected_scans', ARRAY['insert'],
        ARRAY['A.admin', 'A.manager', 'A.team_leader', 'A.team_leader2', 'A.runner', 'B.admin']);

    -- Filas asignadas ({A,B}.rowasg, del equipo de {A,B}.team_leader): las ve su huerto; las
    -- crean, reasignan y borran manager del huerto y admin; el TL solo apunta avance y fin de
    -- las de SU equipo (20261027040000; 99_team_scope_leave_qc_rows.sql)
    PERFORM sec_test.m_allow('row_assignments', ARRAY['read_a'], ARRAY['A.*', 'B.admin']);
    PERFORM sec_test.m_allow('row_assignments', ARRAY['read_b'], ARRAY['B.*', 'A.admin']);
    PERFORM sec_test.m_allow('row_assignments', ARRAY['insert', 'delete_a'], ARRAY['A.admin', 'A.manager', 'B.admin']);
    PERFORM sec_test.m_allow('row_assignments', ARRAY['update_a'], ARRAY['A.admin', 'A.manager', 'A.team_leader', 'B.admin']);
    PERFORM sec_test.m_allow('row_assignments', ARRAY['delete_b'], ARRAY['A.admin', 'B.admin', 'B.manager']);
    PERFORM sec_test.m_allow('row_assignments', ARRAY['update_b'], ARRAY['A.admin', 'B.admin', 'B.manager', 'B.team_leader']);

    -- Transporte: lo ve y lo pide su huerto (a su nombre, A5); lo gestionan logística,
    -- manager y admin del huerto
    PERFORM sec_test.m_allow('transport_requests', ARRAY['read_a', 'insert'], ARRAY['A.*']);
    PERFORM sec_test.m_allow('transport_requests', ARRAY['read_b'], ARRAY['B.*']);
    PERFORM sec_test.m_allow('transport_requests', ARRAY['update_a', 'delete_a'], ARRAY['A.admin', 'A.manager', 'A.logistics']);
    PERFORM sec_test.m_allow('transport_requests', ARRAY['update_b', 'delete_b'], ARRAY['B.admin', 'B.manager', 'B.logistics']);

    -- Perfiles (fila de A.runner / B.runner): los lee su huerto y manager y admin de la
    -- empresa; los cambian la persona, RRHH de su huerto, manager y admin (el rol, la baja y
    -- el huerto los vigila guard_user_changes; lo que un manager no puede tocar, en
    -- 99_rls_gaps_fase2.sql). Nadie borra perfiles.
    PERFORM sec_test.m_allow('users', ARRAY['read_a'], ARRAY['A.*', 'B.admin', 'B.manager']);
    PERFORM sec_test.m_allow('users', ARRAY['read_b'], ARRAY['B.*', 'A.admin', 'A.manager']);
    PERFORM sec_test.m_allow('users', ARRAY['update_a'], ARRAY['A.runner', 'A.admin', 'A.hr_admin', 'A.manager', 'B.admin', 'B.manager']);
    PERFORM sec_test.m_allow('users', ARRAY['update_b'], ARRAY['B.runner', 'B.admin', 'B.hr_admin', 'B.manager', 'A.admin', 'A.manager']);
END $$;

-- =============================================================================
-- Motor de la matriz
-- =============================================================================
-- Resultado de una operación para un usuario: 'yes' (la hizo), 'no' (rechazada:
-- 0 filas o error de permisos) o 'err <código>' (la prueba está mal escrita).
-- Un borrado que choca con una clave ajena (23503) pasó el RLS: cuenta como 'yes'.
CREATE FUNCTION sec_test.m_try(p_who text, p_sql text, p_read boolean) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
    SELECT * INTO r FROM sec_test.run(p_who, p_sql, p_read);
    IF r.state IS NULL THEN
        RETURN CASE WHEN r.rows > 0 THEN 'yes' ELSE 'no' END;
    ELSIF r.state = '42501' THEN
        RETURN 'no';
    ELSIF r.state = '23503' AND NOT p_read THEN
        RETURN 'yes';
    END IF;
    RETURN 'err ' || r.state || ': ' || left(r.err, 80);
END $$;

CREATE FUNCTION sec_test.m_sql(p_tbl text, p_op text) RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT CASE p_op
        WHEN 'read_a' THEN 'SELECT 1 FROM public.' || tbl || ' WHERE ' || where_a
        WHEN 'read_b' THEN 'SELECT 1 FROM public.' || tbl || ' WHERE ' || where_b
        WHEN 'insert' THEN insert_sql
        -- UPDATE que no cambia nada: la primera columna consigo misma
        WHEN 'update_a' THEN 'UPDATE public.' || tbl || ' SET ' || c.col || ' = ' || c.col || ' WHERE ' || where_a
        WHEN 'update_b' THEN 'UPDATE public.' || tbl || ' SET ' || c.col || ' = ' || c.col || ' WHERE ' || where_b
        WHEN 'delete_a' THEN 'DELETE FROM public.' || tbl || ' WHERE ' || where_a
        WHEN 'delete_b' THEN 'DELETE FROM public.' || tbl || ' WHERE ' || where_b
    END
    FROM sec_test.m_tables
    CROSS JOIN LATERAL (
        SELECT quote_ident(a.attname) AS col FROM pg_attribute a
        WHERE a.attrelid = ('public.' || p_tbl)::regclass AND a.attnum > 0 AND NOT a.attisdropped
          AND a.attgenerated = ''
        ORDER BY a.attnum LIMIT 1) c
    WHERE tbl = p_tbl;
$$;

CREATE FUNCTION sec_test.m_check(p_tbl text, p_op text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
    v_sql text := sec_test.m_sql(p_tbl, p_op);
    v_allowed text[];
    u record;
    v_res text;
    v_should boolean;
    v_extra text[] := '{}';
    v_missing text[] := '{}';
    v_broken text[] := '{}';
    v_detail text;
BEGIN
    IF v_sql IS NULL THEN
        RETURN NULL;   -- operación que no aplica (sin fila B, alta en otro archivo)
    END IF;
    SELECT allowed INTO v_allowed FROM sec_test.m_expect WHERE tbl = p_tbl AND op = p_op;
    FOR u IN SELECT who, grp FROM sec_test.users ORDER BY who LOOP
        v_res := sec_test.m_try(u.who, v_sql, p_op LIKE 'read%');
        v_should := u.who = ANY (v_allowed) OR COALESCE(u.grp = ANY (v_allowed), false);
        IF v_res LIKE 'err%' THEN
            v_broken := v_broken || (u.who || ' (' || v_res || ')');
        ELSIF v_res = 'yes' AND NOT v_should THEN
            v_extra := v_extra || u.who;
        ELSIF v_res = 'no' AND v_should THEN
            v_missing := v_missing || u.who;
        END IF;
    END LOOP;
    v_detail := concat_ws('; ',
        CASE WHEN cardinality(v_extra) > 0 THEN 'extra: ' || array_to_string(v_extra, ' ') END,
        CASE WHEN cardinality(v_missing) > 0 THEN 'missing: ' || array_to_string(v_missing, ' ') END,
        CASE WHEN cardinality(v_broken) > 0 THEN 'broken: ' || array_to_string(v_broken, ' | ') END);
    RETURN sec_test.record(v_detail = '', 'matrix: ' || p_tbl || ' ' || p_op, v_detail);
END $$;

SELECT r FROM (
    SELECT sec_test.m_check(e.tbl, e.op) AS r
    FROM sec_test.m_expect e
    ORDER BY e.tbl, array_position(ARRAY['read_a', 'read_b', 'insert', 'update_a', 'update_b', 'delete_a', 'delete_b'], e.op)
) q WHERE r IS NOT NULL;

-- ── Ninguna tabla de public se queda fuera de la matriz ─────────────────────
SELECT sec_test.record(EXISTS (SELECT 1 FROM sec_test.m_tables t WHERE t.tbl = c.relname),
    'matrix: public.' || c.relname || ' is in the access matrix',
    'new table without access tests: add it to 99_rls_matrix.sql')
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
ORDER BY c.relname;

SELECT sec_test.finish();
ROLLBACK;
