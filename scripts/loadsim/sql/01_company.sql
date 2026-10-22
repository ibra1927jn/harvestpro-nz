-- =============================================================================
-- LOADSIM 01 — Empresa simulada para pruebas de carga (SOLO Supabase local)
--
-- Una empresa con varios huertos, como el modelo de negocio real:
--   :orchards huertos, cada uno con 4 bloques x 25 filas
--   por huerto: 1 manager, :tls team leaders, :runners runners, 1 QC
--   oficina (empresa): 1 admin, 1 RRHH, 1 nóminas, 1 logística
--   :pickers_per_tl pickers por team leader
-- Todos los usuarios de la simulación: email sim-*@loadsim.nz, contraseña 'loadsim-111111'
--
-- Uso:  psql ... -v orchards=3 -v tls=4 -v runners=3 -v pickers_per_tl=20 -f 01_company.sql
-- =============================================================================

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_database() <> 'postgres' OR inet_server_port() <> 5432 OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    RAISE EXCEPTION 'loadsim: solo para el Supabase local';
  END IF;
END $$;

-- Parámetros a una tabla temporal para usarlos desde PL/pgSQL
DROP TABLE IF EXISTS pg_temp.sim_params;
CREATE TEMP TABLE sim_params AS
SELECT :orchards::int AS orchards, :tls::int AS tls, :runners::int AS runners, :pickers_per_tl::int AS pickers_per_tl;

-- id determinista a partir de una etiqueta
CREATE OR REPLACE FUNCTION pg_temp.sid(label text) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT overlay(overlay(md5('loadsim:' || label) placing '4' from 13) placing '8' from 17)::uuid $$;

-- Las simulaciones usan el interruptor de desarrollo documentado (scripts/dev-disable-mfa.sql):
-- en local no hay TOTP real que enrolar para 30 cuentas.
UPDATE public.security_settings SET enforce_mfa = false, updated_at = now() WHERE id;

DO $$
DECLARE
  prm record;
  o int; b int; t int; r int; p int;
  oid_ uuid; sid_ uuid; bid uuid;
  varieties text[] := ARRAY['Lapins','Sweetheart','Staccato','Kordia'];
  pw text := crypt('loadsim-111111', gen_salt('bf', 4));
  first_names text[] := ARRAY['Aroha','Mere','Tama','Sione','Losa','Priya','Juan','Ana','Liam','Mia','Noah','Ava','Rawiri','Hemi','Kiri','Ofa','Raj','Maria','Jose','Lucia'];
  last_names text[]  := ARRAY['Smith','Ngata','Tupou','Singh','Garcia','Fale','Brown','Wilson','Taufa','Kumar','Lopez','Patel','Walker','Te Rangi','Faleolo'];
BEGIN
  SELECT * INTO prm FROM pg_temp.sim_params;

  -- Usuarios de oficina (sin huerto fijo: se les pone el primero)
  FOR o IN 1..prm.orchards LOOP
    oid_ := pg_temp.sid('orchard-' || o);
    sid_ := pg_temp.sid('season-' || o);
    INSERT INTO public.orchards (id, code, name, location, total_blocks, total_rows, crop_type)
    VALUES (oid_, 'SIM' || o, 'Sim Orchard ' || o, 'Central Otago, NZ', 4, 100, 'cherries')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.harvest_seasons (id, orchard_id, name, start_date, end_date, status)
    VALUES (sid_, oid_, 'Sim Season 2026-27', (now() AT TIME ZONE 'Pacific/Auckland')::date - 120, (now() AT TIME ZONE 'Pacific/Auckland')::date + 30, 'active')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.harvest_settings (orchard_id, piece_rate, min_wage_rate, min_buckets_per_hour, target_tons, variety)
    VALUES (oid_, 6.50, 23.95, 3.6, 40, 'Lapins')
    ON CONFLICT (orchard_id) DO NOTHING;
    FOR b IN 1..4 LOOP
      bid := pg_temp.sid('block-' || o || '-' || b);
      INSERT INTO public.orchard_blocks (id, orchard_id, season_id, name, total_rows, start_row, status)
      VALUES (bid, oid_, sid_, chr(64 + b), 25, (b - 1) * 25 + 1, 'active')
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO public.block_rows (id, block_id, row_number, variety, target_buckets)
      SELECT pg_temp.sid('row-' || o || '-' || n), bid, n, varieties[b], 120
      FROM generate_series((b - 1) * 25 + 1, b * 25) AS n
      ON CONFLICT (id) DO NOTHING;
    END LOOP;
  END LOOP;

  INSERT INTO public.variety_rates (orchard_id, variety, piece_rate)
  SELECT NULL, v, rate FROM (VALUES ('Lapins', 6.50), ('Sweetheart', 7.00), ('Staccato', 7.50), ('Kordia', 6.80)) x(v, rate)
  WHERE NOT EXISTS (SELECT 1 FROM public.variety_rates vr WHERE vr.orchard_id IS NULL AND vr.variety = x.v);

  -- Cuentas: (etiqueta, rol, huerto)
  CREATE TEMP TABLE IF NOT EXISTS sim_accounts (label text PRIMARY KEY, role text, orchard int, full_name text);
  DELETE FROM sim_accounts;
  INSERT INTO sim_accounts VALUES
    ('admin', 'admin', 1, 'Sim Admin'),
    ('hr', 'hr_admin', 1, 'Sim HR'),
    ('payroll', 'payroll_admin', 1, 'Sim Payroll'),
    ('logistics', 'logistics', 1, 'Sim Logistics');
  FOR o IN 1..prm.orchards LOOP
    INSERT INTO sim_accounts VALUES ('manager-' || o, 'manager', o, 'Sim Manager ' || o);
    INSERT INTO sim_accounts VALUES ('qc-' || o, 'qc_inspector', o, 'Sim QC ' || o);
    FOR t IN 1..prm.tls LOOP
      INSERT INTO sim_accounts VALUES ('tl-' || o || '-' || t, 'team_leader', o, 'Sim TL ' || o || '.' || t);
    END LOOP;
    FOR r IN 1..prm.runners LOOP
      INSERT INTO sim_accounts VALUES ('runner-' || o || '-' || r, 'runner', o, 'Sim Runner ' || o || '.' || r);
    END LOOP;
  END LOOP;

  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change, email_change_token_new,
                          email_change_token_current, phone_change, phone_change_token, reauthentication_token,
                          is_sso_user, is_anonymous)
  SELECT pg_temp.sid('user-' || a.label), 'sim-' || a.label || '@loadsim.nz', pw, now(), 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '{"provider":"email","providers":["email"]}', '{}', now(), now(),
         '', '', '', '', '', '', '', '', false, false
  FROM sim_accounts a
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  SELECT gen_random_uuid(), u.id, u.id::text, 'email',
         jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now()
  FROM auth.users u
  WHERE u.email LIKE 'sim-%@loadsim.nz'
    AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id);

  INSERT INTO public.users (id, email, full_name, role, orchard_id, is_active, privacy_consent_at)
  SELECT pg_temp.sid('user-' || a.label), 'sim-' || a.label || '@loadsim.nz', a.full_name, a.role,
         pg_temp.sid('orchard-' || a.orchard), true, now()
  FROM sim_accounts a
  ON CONFLICT (id) DO NOTHING;

  -- TLs y runners también cobran: fila en pickers con el mismo id que el usuario
  INSERT INTO public.pickers (id, picker_id, name, orchard_id, team_leader_id, role, safety_verified, status)
  SELECT pg_temp.sid('user-' || a.label), upper(replace(a.label, '-', '')), a.full_name,
         pg_temp.sid('orchard-' || a.orchard), NULL, a.role, true, 'active'
  FROM sim_accounts a WHERE a.role IN ('team_leader', 'runner')
  ON CONFLICT (id) DO NOTHING;

  -- Pickers: cada team leader tiene su cuadrilla (no rotan entre equipos)
  FOR o IN 1..prm.orchards LOOP
    FOR t IN 1..prm.tls LOOP
      INSERT INTO public.pickers (id, picker_id, name, orchard_id, team_leader_id, role, safety_verified, status, harness_number)
      SELECT pg_temp.sid('picker-' || o || '-' || t || '-' || gs.n),
             'P' || o || lpad(t::text, 2, '0') || lpad(gs.n::text, 3, '0'),
             first_names[1 + (abs(hashtext(o || '-' || t || '-' || gs.n)) % 20)] || ' ' || last_names[1 + (abs(hashtext('l' || o || t || gs.n)) % 15)],
             pg_temp.sid('orchard-' || o), pg_temp.sid('user-tl-' || o || '-' || t),
             'picker', true, 'active', 'H' || o || t || gs.n
      FROM generate_series(1, prm.pickers_per_tl) AS gs(n)
      ON CONFLICT (id) DO NOTHING;
    END LOOP;
  END LOOP;

  -- Logística: 2 vehículos y 200 bins por huerto
  FOR o IN 1..prm.orchards LOOP
    INSERT INTO public.fleet_vehicles (id, orchard_id, name, registration, zone, driver_name, status, load_status, bins_loaded, max_capacity, fuel_level)
    SELECT pg_temp.sid('vehicle-' || o || '-' || v), pg_temp.sid('orchard-' || o), 'Tractor ' || o || '.' || v,
           'SIM' || o || v, 'Zone ' || v, 'Driver ' || o || v, 'active', 'empty', 0, 8, 80
    FROM generate_series(1, 2) v
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.bins (id, orchard_id, bin_code, status, variety)
    SELECT pg_temp.sid('bin-' || o || '-' || n), pg_temp.sid('orchard-' || o), 'B' || o || lpad(n::text, 4, '0'), 'empty', 'Lapins'
    FROM generate_series(1, 200) n
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- Contratos de temporada para toda la plantilla
  INSERT INTO public.contracts (employee_id, orchard_id, type, status, start_date, end_date, hourly_rate)
  SELECT p.id, p.orchard_id, 'seasonal', 'active', (now() AT TIME ZONE 'Pacific/Auckland')::date - 120, (now() AT TIME ZONE 'Pacific/Auckland')::date + 30, 23.95
  FROM public.pickers p
  WHERE p.picker_id ~ '^(P[0-9]|TL|RUNNER)' AND p.orchard_id IN (SELECT pg_temp.sid('orchard-' || g) FROM generate_series(1, prm.orchards) g)
    AND NOT EXISTS (SELECT 1 FROM public.contracts c WHERE c.employee_id = p.id);

  -- Grupo de chat por huerto (manager + TLs + runners + QC) y uno de oficina
  FOR o IN 1..prm.orchards LOOP
    INSERT INTO public.conversations (id, type, name, participant_ids, created_by)
    SELECT pg_temp.sid('conv-orchard-' || o), 'group', 'Sim Orchard ' || o || ' crew',
           array_agg(pg_temp.sid('user-' || a.label)::text), pg_temp.sid('user-manager-' || o)
    FROM sim_accounts a WHERE a.orchard = o AND a.role IN ('manager', 'team_leader', 'runner', 'qc_inspector')
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
  INSERT INTO public.conversations (id, type, name, participant_ids, created_by)
  SELECT pg_temp.sid('conv-office'), 'group', 'Office',
         array_agg(pg_temp.sid('user-' || a.label)::text), pg_temp.sid('user-admin')
  FROM sim_accounts a WHERE a.role IN ('admin', 'hr_admin', 'payroll_admin', 'logistics', 'manager')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- Exporta las cuentas para el simulador
\o /tmp/loadsim_accounts.csv
COPY (SELECT a.label, a.role, a.orchard, pg_temp.sid('user-' || a.label) AS id,
             'sim-' || a.label || '@loadsim.nz' AS email,
             pg_temp.sid('orchard-' || a.orchard) AS orchard_id
      FROM pg_temp.sim_accounts a ORDER BY a.label) TO STDOUT WITH CSV HEADER;
\o

SELECT role, count(*) FROM public.users WHERE email LIKE 'sim-%' GROUP BY role ORDER BY role;
SELECT count(*) AS pickers FROM public.pickers WHERE picker_id ~ '^P[0-9]';
