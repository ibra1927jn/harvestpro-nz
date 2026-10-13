-- =============================================================================
-- Arnés de pruebas de seguridad de la base de datos (RLS, funciones, roles)
--
-- Se incluye (\ir) al principio de cada archivo de pruebas, DENTRO de una
-- transacción que termina en ROLLBACK: nada de lo que se crea aquí queda en
-- la base de datos.
--
-- Cómo funciona una comprobación:
--   1) como postgres se sustituyen los marcadores {clave} por el uuid del dato
--      de prueba (sec_test.ids) o del usuario (sec_test.who);
--   2) en una subtransacción se cambia al rol `anon` o `authenticated` con los
--      claims del usuario (igual que hace PostgREST);
--   3) se ejecuta la sentencia y se cuenta cuántas filas toca / devuelve;
--   4) se deshace la subtransacción (cada prueba parte del mismo estado) y se
--      guarda PASS/FAIL en sec_test.results.
--
-- Usuarios: 'A.<rol>' = huerto A (el sembrado), 'B.<rol>' = huerto B (creado
-- aquí), 'anon' = sin sesión. Ver sec_test.who.
-- =============================================================================

SET client_min_messages = warning;
\pset footer off
\pset tuples_only on
\pset format unaligned

CREATE SCHEMA sec_test;
GRANT USAGE ON SCHEMA sec_test TO anon, authenticated;

CREATE TABLE sec_test.who (key text PRIMARY KEY, id uuid NOT NULL, email text NOT NULL);
CREATE TABLE sec_test.ids (key text PRIMARY KEY, id uuid NOT NULL);
CREATE TABLE sec_test.results (n serial PRIMARY KEY, ok boolean NOT NULL, label text NOT NULL, detail text);

-- ── Sustituir {clave} por 'uuid'::uuid ──────────────────────────────────────
CREATE FUNCTION sec_test.subst(p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
    v_out text := p_sql;
    v_key text;
    v_id uuid;
BEGIN
    FOR v_key IN SELECT DISTINCT m[1] FROM regexp_matches(p_sql, '\{([A-Za-z0-9_.]+)\}', 'g') AS m LOOP
        SELECT id INTO v_id FROM sec_test.ids WHERE key = v_key;
        IF v_id IS NULL THEN
            SELECT id INTO v_id FROM sec_test.who WHERE key = v_key;
        END IF;
        IF v_id IS NULL THEN
            RAISE EXCEPTION 'sec_test: unknown fixture key {%}', v_key;
        END IF;
        v_out := replace(v_out, '{' || v_key || '}', quote_literal(v_id::text) || '::uuid');
    END LOOP;
    RETURN v_out;
END $$;

-- ── Hacerse pasar por un usuario (como PostgREST) ──────────────────────────
CREATE FUNCTION sec_test.become(p_who text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_id uuid;
    v_email text;
BEGIN
    -- Como la Storage API: permite DELETE en storage.objects (lo decide el RLS)
    PERFORM set_config('storage.allow_delete_query', 'true', true);
    IF p_who = 'anon' THEN
        PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        PERFORM set_config('role', 'anon', true);
        RETURN;
    END IF;
    SELECT id, email INTO v_id, v_email FROM sec_test.who WHERE key = p_who;
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'sec_test: unknown user %', p_who;
    END IF;
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_id, 'role', 'authenticated', 'email', v_email)::text, true);
    PERFORM set_config('role', 'authenticated', true);
END $$;

-- ── Ejecutar como un usuario: filas tocadas/devueltas o error ──────────────
-- p_count = true → envuelve en SELECT count(*) (para lecturas)
CREATE FUNCTION sec_test.run(p_who text, p_sql text, p_count boolean,
                             OUT rows bigint, OUT state text, OUT err text)
LANGUAGE plpgsql AS $$
DECLARE
    v_sql text := sec_test.subst(p_sql);
    v_n bigint;
BEGIN
    BEGIN
        PERFORM sec_test.become(p_who);
        IF p_count THEN
            EXECUTE 'SELECT count(*) FROM (' || v_sql || ') AS q' INTO v_n;
        ELSE
            EXECUTE v_sql;
            GET DIAGNOSTICS v_n = ROW_COUNT;
        END IF;
        -- Deshacer siempre: cada prueba parte del mismo estado
        RAISE EXCEPTION USING ERRCODE = 'ZZ999', MESSAGE = v_n::text;
    EXCEPTION
        WHEN SQLSTATE 'ZZ999' THEN
            rows := SQLERRM::bigint;
        WHEN OTHERS THEN
            state := SQLSTATE;
            err := SQLERRM;
    END;
END $$;

CREATE FUNCTION sec_test.record(p_ok boolean, p_label text, p_detail text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO sec_test.results (ok, label, detail) VALUES (p_ok, p_label, p_detail);
    RETURN CASE WHEN p_ok THEN 'PASS  ' ELSE 'FAIL  ' END || p_label
        || CASE WHEN p_ok OR p_detail IS NULL THEN '' ELSE '   -- ' || p_detail END;
END $$;

-- La sentencia debe ser rechazada: error de permisos (42501, o los códigos
-- indicados) o no tocar ninguna fila. Cualquier otro error es FAIL (para no
-- dar por buena una prueba que falla por estar mal escrita).
CREATE FUNCTION sec_test.deny(p_who text, p_label text, p_sql text,
                              p_states text[] DEFAULT ARRAY['42501']) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
    SELECT * INTO r FROM sec_test.run(p_who, p_sql, false);
    IF r.state IS NULL THEN
        RETURN sec_test.record(r.rows = 0, p_who || ': ' || p_label,
            'allowed, ' || r.rows || ' row(s) affected');
    END IF;
    RETURN sec_test.record(r.state = ANY (p_states), p_who || ': ' || p_label,
        'unexpected error ' || r.state || ': ' || r.err);
END $$;

-- La sentencia debe funcionar y tocar al menos p_min filas
CREATE FUNCTION sec_test.allow(p_who text, p_label text, p_sql text, p_min bigint DEFAULT 1) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
    SELECT * INTO r FROM sec_test.run(p_who, p_sql, false);
    IF r.state IS NOT NULL THEN
        RETURN sec_test.record(false, p_who || ': ' || p_label, 'error ' || r.state || ': ' || r.err);
    END IF;
    RETURN sec_test.record(r.rows >= p_min, p_who || ': ' || p_label,
        'only ' || r.rows || ' row(s) affected, expected >= ' || p_min);
END $$;

-- Lectura: número exacto de filas visibles
CREATE FUNCTION sec_test.sees(p_who text, p_label text, p_sql text, p_expected bigint) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
    SELECT * INTO r FROM sec_test.run(p_who, p_sql, true);
    IF r.state IS NOT NULL THEN
        -- Sin permiso sobre la tabla = no ve nada
        IF r.state = '42501' AND p_expected = 0 THEN
            RETURN sec_test.record(true, p_who || ': ' || p_label, NULL);
        END IF;
        RETURN sec_test.record(false, p_who || ': ' || p_label, 'error ' || r.state || ': ' || r.err);
    END IF;
    RETURN sec_test.record(r.rows = p_expected, p_who || ': ' || p_label,
        'sees ' || r.rows || ' row(s), expected ' || p_expected);
END $$;

-- Devuelve la primera columna de la primera fila (para comprobar valores)
CREATE FUNCTION sec_test.returns(p_who text, p_label text, p_sql text, p_expected text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
    v_sql text := sec_test.subst(p_sql);
    v_val text;
    v_state text;
    v_err text;
BEGIN
    BEGIN
        PERFORM sec_test.become(p_who);
        EXECUTE v_sql INTO v_val;
        RAISE EXCEPTION USING ERRCODE = 'ZZ999', MESSAGE = COALESCE(v_val, '<null>');
    EXCEPTION
        WHEN SQLSTATE 'ZZ999' THEN v_val := SQLERRM;
        WHEN OTHERS THEN v_state := SQLSTATE; v_err := SQLERRM;
    END;
    IF v_state IS NOT NULL THEN
        RETURN sec_test.record(false, p_who || ': ' || p_label, 'error ' || v_state || ': ' || v_err);
    END IF;
    RETURN sec_test.record(v_val = p_expected, p_who || ': ' || p_label,
        'got ' || v_val || ', expected ' || p_expected);
END $$;

-- Resumen final del archivo: falla (y psql sale con error) si hubo FAIL
CREATE FUNCTION sec_test.finish() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v_total int; v_fail int;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE NOT ok) INTO v_total, v_fail FROM sec_test.results;
    RETURN format('SUMMARY %s checks, %s failed', v_total, v_fail);
END $$;

-- =============================================================================
-- Datos de prueba
-- =============================================================================

-- Huerto A = el sembrado (seed_00_local_bootstrap)
INSERT INTO sec_test.ids VALUES ('A', 'e1337e6a-54cc-431c-9c00-980e8ea270a4');
INSERT INTO sec_test.ids VALUES ('B', gen_random_uuid());

INSERT INTO public.orchards (id, code, name)
SELECT id, 'SECTEST-B', 'Security test orchard B' FROM sec_test.ids WHERE key = 'B';
INSERT INTO public.harvest_settings (orchard_id, piece_rate, min_wage_rate)
SELECT id, 6.50, 23.95 FROM sec_test.ids WHERE key = 'B';

-- Usuarios del huerto A (sembrados)
INSERT INTO sec_test.who (key, id, email)
SELECT 'A.' || CASE u.email
        WHEN 'admin@harvestpro.nz' THEN 'admin'
        WHEN 'hr@harvestpro.nz' THEN 'hr_admin'
        WHEN 'logistics@harvestpro.nz' THEN 'logistics'
        WHEN 'manager@harvestpro.nz' THEN 'manager'
        WHEN 'payroll@harvestpro.nz' THEN 'payroll_admin'
        WHEN 'qc@harvestpro.nz' THEN 'qc_inspector'
        WHEN 'runner@harvestpro.nz' THEN 'runner'
        WHEN 'runner2@harvestpro.nz' THEN 'runner2'
        WHEN 'lead@harvestpro.nz' THEN 'team_leader'
    END, u.id, u.email
FROM public.users u
WHERE u.email IN ('admin@harvestpro.nz', 'hr@harvestpro.nz', 'logistics@harvestpro.nz',
                  'manager@harvestpro.nz', 'payroll@harvestpro.nz', 'qc@harvestpro.nz',
                  'runner@harvestpro.nz', 'runner2@harvestpro.nz', 'lead@harvestpro.nz');

DO $$
BEGIN
    IF (SELECT count(*) FROM sec_test.who) <> 9 THEN
        RAISE EXCEPTION 'sec_test: seeded users missing (run the local seeds first)';
    END IF;
END $$;

-- Usuarios nuevos: huerto B (un usuario por rol) y un manager de A dado de baja
CREATE FUNCTION sec_test.make_user(p_key text, p_role text, p_orchard text, p_active boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_id uuid := gen_random_uuid();
    v_email text := 'sectest.' || replace(lower(p_key), '.', '-') || '@example.test';
BEGIN
    INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
    VALUES (v_id, v_email, 'authenticated', 'authenticated', jsonb_build_object('role', p_role));
    INSERT INTO public.users (id, email, full_name, role, orchard_id, is_active)
    VALUES (v_id, v_email, 'SecTest ' || p_key, p_role, sec_test.id_of(p_orchard), p_active);
    INSERT INTO sec_test.who VALUES (p_key, v_id, v_email);
END $$;

CREATE FUNCTION sec_test.id_of(p_key text) RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT COALESCE((SELECT id FROM sec_test.ids WHERE key = p_key), (SELECT id FROM sec_test.who WHERE key = p_key));
$$;

DO $$ BEGIN PERFORM sec_test.make_user('B.' || r, r, 'B')
FROM unnest(ARRAY['admin', 'manager', 'team_leader', 'runner', 'qc_inspector', 'logistics', 'hr_admin', 'payroll_admin']) AS r; END $$;
DO $$ BEGIN
    PERFORM sec_test.make_user('A.inactive_manager', 'manager', 'A', false);
    PERFORM sec_test.make_user('A.team_leader2', 'team_leader', 'A');
END $$;

-- Datos de negocio en cada huerto (A y B)
CREATE FUNCTION sec_test.make_data(o text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_orchard uuid := sec_test.id_of(o);
    v_tl uuid := sec_test.id_of(o || '.team_leader');
    v_runner uuid := sec_test.id_of(o || '.runner');
    v_manager uuid := sec_test.id_of(o || '.manager');
    v_qc uuid := sec_test.id_of(o || '.qc_inspector');
    v_hr uuid := sec_test.id_of(o || '.hr_admin');
    v_id uuid;
    v_now timestamptz := now();
    v_today date := (now() AT TIME ZONE 'Pacific/Auckland')::date;
BEGIN
    -- Recolector (picker) del equipo del jefe de equipo
    INSERT INTO public.pickers (picker_id, name, orchard_id, team_leader_id, role, status)
    VALUES ('SECTEST-' || o || '-' || substr(gen_random_uuid()::text, 1, 6), 'SecTest picker ' || o,
            v_orchard, v_tl, 'picker', 'active')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.picker', v_id);

    INSERT INTO public.harvest_seasons (orchard_id, name, start_date, status)
    VALUES (v_orchard, 'SecTest season ' || o, v_today - 30, 'planning') RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.season', v_id);

    INSERT INTO public.orchard_blocks (orchard_id, season_id, name, total_rows)
    VALUES (v_orchard, v_id, 'SecTest block ' || o, 10) RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.block', v_id);

    INSERT INTO public.block_rows (block_id, row_number) VALUES (v_id, 1) RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.row', v_id);

    INSERT INTO public.bucket_records (orchard_id, picker_id, scanned_by, scanned_at, quality_grade)
    VALUES (v_orchard, sec_test.id_of(o || '.picker'), v_runner, v_now - interval '10 minutes', 'A')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.bucket', v_id);

    INSERT INTO public.daily_attendance (picker_id, orchard_id, date, check_in, status, recorded_by)
    VALUES (sec_test.id_of(o || '.picker'), v_orchard, v_today, v_now - interval '2 hours', 'present', v_tl)
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.att', v_id);

    -- Fichaje del propio jefe de equipo (es persona de campo: pickers.id = users.id)
    INSERT INTO public.daily_attendance (picker_id, orchard_id, date, check_in, check_out, status, recorded_by, hours_worked)
    VALUES (v_tl, v_orchard, v_today - 1, v_now - interval '30 hours', v_now - interval '22 hours', 'present', v_manager, 8)
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.att_tl', v_id);

    INSERT INTO public.contracts (employee_id, orchard_id, type, status, start_date, hourly_rate, created_by)
    VALUES (v_runner, v_orchard, 'seasonal', 'active', v_today - 10, 25.00, v_hr) RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.contract', v_id);

    INSERT INTO public.hr_documents (orchard_id, user_id, document_type, title, storage_path, uploaded_by)
    VALUES (v_orchard, v_runner, 'employment_agreement', 'SecTest doc ' || o, o || '/sectest.pdf', v_hr) RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.hrdoc', v_id);

    INSERT INTO public.conversations (type, name, participant_ids, created_by)
    VALUES ('direct', NULL, ARRAY[v_manager::text, v_runner::text], v_manager) RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.conv', v_id);
    INSERT INTO public.chat_messages (conversation_id, sender_id, content)
    VALUES (v_id, v_manager, 'SecTest private message ' || o) RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.chat', v_id);

    INSERT INTO public.messages (sender_id, receiver_id, content)
    VALUES (v_runner, v_tl, 'SecTest DM ' || o) RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.dm', v_id);

    INSERT INTO public.broadcasts (orchard_id, sender_id, title, content)
    VALUES (v_orchard, v_manager, 'SecTest', 'SecTest broadcast ' || o) RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.broadcast', v_id);

    INSERT INTO public.wage_rates (orchard_id, job_type, hourly_rate)
    VALUES (v_orchard, 'sectest', 24.00) RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.wage', v_id);

    INSERT INTO public.variety_rates (orchard_id, variety, piece_rate)
    VALUES (v_orchard, 'SecTestVariety', 7.00) RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.vrate', v_id);

    INSERT INTO public.day_setups (orchard_id, date, piece_rate, min_wage_rate, created_by)
    VALUES (v_orchard, v_today + 300, 6.50, 23.95, v_manager) RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.setup', v_id);

    INSERT INTO public.bins (orchard_id, bin_code, status) VALUES (v_orchard, 'SECTEST-' || o, 'empty') RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.bin', v_id);

    INSERT INTO public.fleet_vehicles (orchard_id, name) VALUES (v_orchard, 'SecTest truck ' || o) RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.vehicle', v_id);

    INSERT INTO public.transport_requests (orchard_id, requested_by, requester_name, zone)
    VALUES (v_orchard, v_tl, 'SecTest', 'Z1') RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.transport', v_id);

    INSERT INTO public.qc_inspections (orchard_id, picker_id, inspector_id, grade)
    VALUES (v_orchard, sec_test.id_of(o || '.picker'), v_qc, 'A') RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.qc', v_id);

    INSERT INTO public.row_assignments (orchard_id, row_number, assigned_pickers, team_leader_id)
    VALUES (v_orchard, 1, ARRAY[sec_test.id_of(o || '.picker')], v_tl) RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.rowasg', v_id);

    INSERT INTO public.day_closures (orchard_id, date, status, closed_by, closed_at)
    VALUES (v_orchard, v_today - 400, 'closed', v_manager, now() - interval '400 days') RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.closure', v_id);

    INSERT INTO public.allowed_registrations (email, assigned_role, orchard_id, created_by)
    VALUES ('sectest.invite-' || lower(o) || '@example.test', 'runner', v_orchard, v_hr) RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.invite', v_id);

    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_values)
    VALUES (v_manager, 'CUSTOM', 'sectest', v_orchard, '{"event":"sectest"}') RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.audit', v_id);

    INSERT INTO public.push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth)
    VALUES (v_runner, 'https://push.example.test/' || o, 'k', 'a') RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES (o || '.push', v_id);
END $$;


DO $$ BEGIN
    PERFORM sec_test.make_data('A');
    PERFORM sec_test.make_data('B');
END $$;


-- Recolector dado de baja (archivado) en A
DO $$
DECLARE v_id uuid;
BEGIN
    INSERT INTO public.pickers (picker_id, name, orchard_id, role, status, archived_at)
    VALUES ('SECTEST-ARCH-' || substr(gen_random_uuid()::text, 1, 6), 'SecTest archived', sec_test.id_of('A'),
            'picker', 'archived', now())
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.archived_picker', v_id);

    -- Cubeta de un día ya cerrado (el cierre se hace después del escaneo)
    INSERT INTO public.bucket_records (orchard_id, picker_id, scanned_by, scanned_at, quality_grade)
    VALUES (sec_test.id_of('A'), sec_test.id_of('A.picker'), sec_test.id_of('A.runner'),
            now() - interval '200 days', 'A')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.bucket_closed_day', v_id);
    INSERT INTO public.day_closures (orchard_id, date, status, closed_by, closed_at)
    VALUES (sec_test.id_of('A'), ((now() - interval '200 days') AT TIME ZONE 'Pacific/Auckland')::date,
            'closed', sec_test.id_of('A.manager'), now() - interval '200 days' + interval '1 minute')
    ON CONFLICT (orchard_id, date) DO UPDATE SET status = 'closed', closed_at = EXCLUDED.closed_at;

    -- Las semanas ya cerradas en la BD (datos reales) bloquearían los fichajes
    -- de prueba de hoy: dentro de esta transacción (ROLLBACK) se reabren
    UPDATE public.pay_weeks SET status = 'reopened' WHERE status = 'closed';

    -- Semana de pago cerrada (lejos en el pasado para no afectar a nada más)
    INSERT INTO public.daily_attendance (picker_id, orchard_id, date, check_in, check_out, status, hours_worked)
    VALUES (sec_test.id_of('A.picker'), sec_test.id_of('A'), DATE '2020-01-07',
            TIMESTAMPTZ '2020-01-07 08:00+13', TIMESTAMPTZ '2020-01-07 16:00+13', 'present', 7.5)
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.att_closed_week', v_id);
    INSERT INTO public.pay_weeks (week_start, week_end, status, closed_by, closed_at, snapshot)
    VALUES (DATE '2020-01-06', DATE '2020-01-12', 'closed', sec_test.id_of('A.payroll_admin'), now(), '{}')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('payweek', v_id);
END $$;

-- Recolector que ya pertenece a B pero dejó un turno abierto en A (rota entre huertos)
DO $$
DECLARE v_id uuid; v_att uuid;
BEGIN
    INSERT INTO public.pickers (picker_id, name, orchard_id, role, status)
    VALUES ('SECTEST-ROT-' || substr(gen_random_uuid()::text, 1, 6), 'SecTest rotated', sec_test.id_of('B'), 'picker', 'active')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('B.rotated_picker', v_id);
    INSERT INTO public.daily_attendance (picker_id, orchard_id, date, check_in, status)
    VALUES (v_id, sec_test.id_of('A'), (now() AT TIME ZONE 'Pacific/Auckland')::date, now() - interval '3 hours', 'present')
    RETURNING id INTO v_att;
    INSERT INTO sec_test.ids VALUES ('A.att_rotated', v_att);
END $$;

-- Persona invitada (A.invite, rol runner) que acaba de crear su cuenta de
-- acceso pero aún no tiene perfil en public.users
DO $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
    INSERT INTO auth.users (id, email, aud, role) VALUES (v_id, 'sectest.invite-a@example.test', 'authenticated', 'authenticated');
    INSERT INTO sec_test.who VALUES ('A.invitee', v_id, 'sectest.invite-a@example.test');
END $$;

-- Foto de calidad subida por el inspector de A
DO $$
DECLARE v_id uuid;
BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
    VALUES ('qc-photos', 'sectest/' || gen_random_uuid() || '.webp', sec_test.id_of('A.qc_inspector'),
            sec_test.id_of('A.qc_inspector')::text)
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.qc_photo', v_id);
END $$;

-- Bloqueo de cuenta e intentos de acceso (de un email de prueba)
INSERT INTO public.account_locks (email, locked_until) VALUES ('sectest.locked@example.test', now() + interval '10 minutes');
INSERT INTO public.login_attempts (email, success) VALUES ('sectest.locked@example.test', false);

GRANT SELECT ON ALL TABLES IN SCHEMA sec_test TO anon, authenticated;

