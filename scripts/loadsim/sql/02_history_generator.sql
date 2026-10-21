-- =============================================================================
-- LOADSIM 02 — Generador de días trabajados (histórico de temporada)
--
-- loadsim.gen_day(fecha) escribe en bloque lo que la app deja en la base de datos
-- en un día de cosecha normal, con las mismas tablas y los mismos triggers:
--   - fichajes (daily_attendance) de pickers, TLs y runners, con descanso apuntado
--   - cubetas (bucket_records) repartidas a lo largo del turno, por fila
--   - una fila de audit_logs por cubeta (lo que hace submit-audit-log en la app)
--   - asignaciones de filas (row_assignments), inspecciones QC, chat, avisos,
--     peticiones de transporte y cierre de día
-- El simulador en vivo (live-day.mjs) usa la API real; esto sirve para llenar
-- semanas o meses de temporada en minutos y medir cómo se comporta con volumen.
--
-- Determinista por fecha (setseed) para poder repetir las pruebas.
-- =============================================================================

\set ON_ERROR_STOP on
CREATE SCHEMA IF NOT EXISTS loadsim;
REVOKE ALL ON SCHEMA loadsim FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION loadsim.sid(label text) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT overlay(overlay(md5('loadsim:' || label) placing '4' from 13) placing '8' from 17)::uuid $$;

-- NZ local -> timestamptz
CREATE OR REPLACE FUNCTION loadsim.nz(d date, t interval) RETURNS timestamptz
LANGUAGE sql IMMUTABLE AS $$ SELECT ((d + t)::timestamp AT TIME ZONE 'Pacific/Auckland') $$;

CREATE OR REPLACE FUNCTION loadsim.gen_day(d date, attendance_rate numeric DEFAULT 0.92, close_day boolean DEFAULT true, audit_per_scan boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  n_att int; n_bk int; n_audit int; n_qc int; n_chat int; n_tr int; n_ra int;
BEGIN
  IF extract(isodow FROM d) = 7 THEN
    RETURN jsonb_build_object('date', d, 'skipped', 'sunday');
  END IF;
  PERFORM setseed(((d - date '2026-01-01') % 1000) / 1000.0);

  -- Gente de la simulación, con su huerto, TL y runner que escanea
  CREATE TEMP TABLE IF NOT EXISTS gd_people (
    picker_id uuid, orchard_id uuid, season_id uuid, tl_user uuid, role text,
    present boolean, check_in timestamptz, check_out timestamptz, rate numeric, o int, t int
  ) ON COMMIT DROP;
  TRUNCATE gd_people;

  INSERT INTO gd_people
  SELECT p.id, p.orchard_id, s.id,
         COALESCE(p.team_leader_id, p.id), p.role,
         random() < CASE WHEN extract(isodow FROM d) = 6 THEN attendance_rate * 0.6 ELSE attendance_rate END
           OR p.role IN ('team_leader', 'runner'),
         loadsim.nz(d, interval '06:20' + (random() * 20) * interval '1 minute'),
         loadsim.nz(d, CASE WHEN extract(isodow FROM d) = 6 THEN interval '12:30' ELSE interval '15:30' END + (random() * 60) * interval '1 minute'),
         3.5 + random() * 3.0,  -- cubetas por hora de ese picker ese día
         substring(o.code FROM 4)::int,
         0
  FROM public.pickers p
  JOIN public.orchards o ON o.id = p.orchard_id AND o.code LIKE 'SIM%'
  JOIN public.harvest_seasons s ON s.orchard_id = o.id AND s.status = 'active'
  WHERE p.deleted_at IS NULL AND p.status = 'active';

  -- Fichajes (el trigger de auditoría de daily_attendance se dispara como en la app)
  INSERT INTO public.daily_attendance (picker_id, orchard_id, season_id, date, check_in, check_out, status,
                                       hours_worked, break_start, break_minutes, recorded_by, verified_by, verified_at)
  SELECT g.picker_id, g.orchard_id, g.season_id, d, g.check_in, g.check_out, 'present',
         round((extract(epoch FROM g.check_out - g.check_in) / 3600.0 - 0.5)::numeric, 2),
         loadsim.nz(d, interval '11:30'), 30, g.tl_user,
         CASE WHEN d < (now() AT TIME ZONE 'Pacific/Auckland')::date - 2 THEN loadsim.sid('user-payroll') END,
         CASE WHEN d < (now() AT TIME ZONE 'Pacific/Auckland')::date - 2 THEN g.check_out + interval '1 day' END
  FROM gd_people g WHERE g.present
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n_att = ROW_COUNT;

  -- Cubetas: solo pickers. Fila del día: cada TL lleva su cuadrilla a 2 filas
  -- consecutivas que cambian cada día dentro de los 100 del huerto.
  INSERT INTO public.bucket_records (id, orchard_id, season_id, picker_id, bin_id, block_row_id, scanned_by,
                                     scanned_at, row_number, quality_grade, created_at, updated_at)
  SELECT gen_random_uuid(), g.orchard_id, g.season_id, g.picker_id,
         loadsim.sid('bin-' || g.o || '-' || (1 + floor(random() * 200))::int),
         loadsim.sid('row-' || g.o || '-' || rn.row_number),
         loadsim.sid('user-runner-' || g.o || '-' || (1 + floor(random() * 3))::int),
         ts.scanned_at, rn.row_number,
         CASE WHEN q < 0.80 THEN 'A' WHEN q < 0.95 THEN 'B' WHEN q < 0.99 THEN 'C' ELSE 'reject' END,
         ts.scanned_at + interval '20 seconds', ts.scanned_at + interval '20 seconds'
  FROM gd_people g
  CROSS JOIN LATERAL (
    SELECT 1 + ((abs(hashtext(g.tl_user::text)) % 48) * 2 + (d - date '2026-01-01') * 2 + (CASE WHEN random() < 0.5 THEN 0 ELSE 1 END)) % 100 AS row_number
  ) rn
  CROSS JOIN LATERAL (
    SELECT g.check_in + (k + random() * 0.8) * (g.check_out - g.check_in - interval '30 minutes')
           / greatest(1, floor(g.rate * extract(epoch FROM g.check_out - g.check_in - interval '30 minutes') / 3600.0))
           + (random() * 900) * interval '1 millisecond' AS scanned_at,
           random() AS q
    FROM generate_series(0, greatest(0, floor(g.rate * extract(epoch FROM g.check_out - g.check_in - interval '30 minutes') / 3600.0)::int - 1)) AS k
  ) ts
  WHERE g.present AND g.role = 'picker'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n_bk = ROW_COUNT;

  -- Auditoría: una entrada por cubeta escaneada (bucket.scanned vía submit-audit-log).
  -- La app optimizada ya no la manda (audit_per_scan = false).
  n_audit := 0;
  IF audit_per_scan THEN
  INSERT INTO public.audit_logs (user_id, user_email, action, table_name, record_id, new_values, created_at)
  SELECT b.scanned_by, NULL, 'CUSTOM', 'bucket', b.id,
         jsonb_build_object('event', 'bucket.scanned', 'event_type', 'bucket.scanned', 'severity', 'info',
                            'orchard_id', b.orchard_id, 'entity_id', b.id,
                            'details', jsonb_build_object('quality_grade', b.quality_grade, 'picker_id', b.picker_id)),
         b.created_at + interval '5 seconds'
  FROM public.bucket_records b
  WHERE b.scanned_at >= loadsim.nz(d, interval '0') AND b.scanned_at < loadsim.nz(d + 1, interval '0')
    AND b.orchard_id IN (SELECT id FROM public.orchards WHERE code LIKE 'SIM%')
    AND NOT EXISTS (SELECT 1 FROM public.audit_logs a WHERE a.record_id = b.id AND a.table_name = 'bucket');
  GET DIAGNOSTICS n_audit = ROW_COUNT;
  END IF;

  -- Asignaciones de fila: 2 por TL al día, terminadas
  INSERT INTO public.row_assignments (orchard_id, season_id, block_row_id, row_number, side, assigned_pickers,
                                      completion_percentage, status, assigned_at, team_leader_id, ended_at, updated_at)
  SELECT g.orchard_id, g.season_id, loadsim.sid('row-' || g.o || '-' || r.row_number), r.row_number, 'north',
         (SELECT array_agg(x.picker_id) FROM gd_people x WHERE x.tl_user = g.tl_user AND x.role = 'picker' AND x.present),
         100, 'completed', g.check_in, g.tl_user, g.check_out, g.check_out
  FROM gd_people g
  CROSS JOIN LATERAL (
    SELECT 1 + ((abs(hashtext(g.tl_user::text)) % 48) * 2 + (d - date '2026-01-01') * 2 + s) % 100 AS row_number
    FROM generate_series(0, 1) s
  ) r
  WHERE g.role = 'team_leader' AND g.present;
  GET DIAGNOSTICS n_ra = ROW_COUNT;

  -- QC: ~60 inspecciones por huerto y día
  INSERT INTO public.qc_inspections (orchard_id, picker_id, inspector_id, grade, notes, created_at)
  SELECT g.orchard_id, g.picker_id, loadsim.sid('user-qc-' || g.o),
         CASE WHEN random() < 0.8 THEN 'A' WHEN random() < 0.9 THEN 'B' ELSE 'C' END,
         CASE WHEN random() < 0.1 THEN 'Soft fruit, check stems' END,
         g.check_in + random() * (g.check_out - g.check_in)
  FROM gd_people g
  WHERE g.present AND g.role = 'picker' AND random() < 0.75;
  GET DIAGNOSTICS n_qc = ROW_COUNT;

  -- Chat: ~40 mensajes por grupo de huerto, 10 en oficina
  INSERT INTO public.chat_messages (conversation_id, sender_id, content, created_at)
  SELECT c.id, c.participant_ids[1 + floor(random() * array_length(c.participant_ids, 1))::int]::uuid,
         (ARRAY['Row done, moving to next','Need empty bins at block B','Runner please','Water break 10 min',
                'QC flagged soft fruit row 34','Tractor on the way','Good pace team','Who has the spare harness?'])[1 + floor(random() * 8)::int],
         loadsim.nz(d, interval '06:30' + random() * interval '9 hours')
  FROM public.conversations c
  CROSS JOIN LATERAL generate_series(1, CASE WHEN c.name = 'Office' THEN 10 ELSE 40 END) s
  WHERE c.id IN (SELECT loadsim.sid('conv-orchard-' || substring(code FROM 4)) FROM public.orchards WHERE code LIKE 'SIM%')
     OR c.id = loadsim.sid('conv-office');
  GET DIAGNOSTICS n_chat = ROW_COUNT;

  -- Avisos: 2 por huerto
  INSERT INTO public.broadcasts (orchard_id, sender_id, title, content, priority, target_roles, created_at)
  SELECT o.id, loadsim.sid('user-manager-' || substring(o.code FROM 4)),
         (ARRAY['Start time','Weather','Safety','Finish early'])[1 + floor(random() * 4)::int],
         'Daily notice for the crew', 'normal', ARRAY['team_leader','runner'],
         loadsim.nz(d, interval '06:00' + s * interval '4 hours')
  FROM public.orchards o CROSS JOIN generate_series(0, 1) s
  WHERE o.code LIKE 'SIM%';

  -- Transporte: ~15 peticiones por huerto, completadas
  INSERT INTO public.transport_requests (orchard_id, requested_by, requester_name, zone, bins_count, priority, status,
                                         assigned_vehicle, assigned_by, completed_at, created_at, updated_at)
  SELECT o.id, loadsim.sid('user-runner-' || substring(o.code FROM 4) || '-1'), 'Sim Runner', 'Block ' || chr(65 + (s % 4)), 1 + (s % 3),
         'normal', 'completed', loadsim.sid('vehicle-' || substring(o.code FROM 4) || '-' || (1 + s % 2)),
         loadsim.sid('user-logistics'),
         loadsim.nz(d, interval '07:00' + s * interval '30 minutes' + interval '20 minutes'),
         loadsim.nz(d, interval '07:00' + s * interval '30 minutes'),
         loadsim.nz(d, interval '07:00' + s * interval '30 minutes' + interval '20 minutes')
  FROM public.orchards o CROSS JOIN generate_series(0, 14) s
  WHERE o.code LIKE 'SIM%';
  GET DIAGNOSTICS n_tr = ROW_COUNT;

  IF close_day THEN
    INSERT INTO public.day_closures (orchard_id, date, status, closed_by, closed_at, total_buckets, total_cost, total_hours, wage_violations)
    SELECT o.id, d, 'closed', loadsim.sid('user-manager-' || substring(o.code FROM 4)), loadsim.nz(d, interval '17:00'),
           (SELECT count(*) FROM public.bucket_records b WHERE b.orchard_id = o.id
              AND b.scanned_at >= loadsim.nz(d, interval '0') AND b.scanned_at < loadsim.nz(d + 1, interval '0')),
           0, 0, 0
    FROM public.orchards o WHERE o.code LIKE 'SIM%'
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('date', d, 'attendance', n_att, 'buckets', n_bk, 'audit', n_audit,
                            'row_assignments', n_ra, 'qc', n_qc, 'chat', n_chat, 'transport', n_tr);
END $$;

-- Tamaños de tabla para el informe
CREATE OR REPLACE VIEW loadsim.table_sizes AS
SELECT c.relname AS table_name,
       c.reltuples::bigint AS approx_rows,
       pg_total_relation_size(c.oid) AS total_bytes,
       pg_relation_size(c.oid) AS heap_bytes,
       pg_indexes_size(c.oid) AS index_bytes
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY pg_total_relation_size(c.oid) DESC;
