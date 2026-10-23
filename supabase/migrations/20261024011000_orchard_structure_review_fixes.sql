-- =============================================================================
-- Estructura del huerto: arreglos de la revisión del PR #87 (24-10)
--
-- 1) set_bucket_variety (20261012030000) buscaba la variedad de la cubeta por
--    huerto + número de fila, sin temporada y con LIMIT 1 sin orden. Tras
--    copiar la estructura a la temporada nueva y activarla, cada número de fila
--    existe en dos temporadas y la cubeta podía llevarse la variedad del año
--    pasado (y la nómina, su precio por variedad). Ahora: solo filas activas de
--    bloques activos de la temporada ACTIVA del huerto, con orden fijo.
-- 2) Dos altas a la vez de los mismos números de fila en bloques distintos de
--    una temporada pasaban las dos (la comprobación no ve lo que la otra
--    transacción aún no ha confirmado). Un candado por temporada
--    (pg_advisory_xact_lock) las pone en fila.
-- 3) Crear temporada (con copia y activación) y crear bloque (con sus filas)
--    eran varias llamadas desde la pantalla: un fallo a medias dejaba una
--    temporada o un bloque vacío y el reintento chocaba con el nombre. Ahora
--    cada una es una sola función (todo o nada): create_harvest_season y
--    create_orchard_block.
-- 4) setup_orchard_atomic ya no lleva el salario mínimo escrito a mano: el
--    cliente manda el de la tabla con fechas (minWageFloorOn, pay.ts) y la base
--    solo exige que venga y sea positivo (harvest_settings sigue con su CHECK).
-- =============================================================================

-- 1) Variedad de la cubeta: la de la fila de la temporada activa ------------------
CREATE OR REPLACE FUNCTION public.set_bucket_variety()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.variety IS NULL THEN
        IF NEW.block_row_id IS NOT NULL THEN
            SELECT r.variety INTO NEW.variety FROM public.block_rows r WHERE r.id = NEW.block_row_id;
        ELSE
            SELECT r.variety INTO NEW.variety
            FROM public.block_rows r
            JOIN public.orchard_blocks b ON b.id = r.block_id AND b.deleted_at IS NULL
            JOIN public.harvest_seasons s ON s.id = b.season_id AND s.status = 'active' AND s.deleted_at IS NULL
            WHERE b.orchard_id = NEW.orchard_id
              AND r.row_number = NEW.row_number
              AND r.deleted_at IS NULL
            ORDER BY s.start_date DESC, r.id
            LIMIT 1;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_bucket_variety() FROM PUBLIC, anon, authenticated;

-- 2) Candado por temporada al dar de alta o mover filas ---------------------------
CREATE OR REPLACE FUNCTION public.lock_season_rows(p_block_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_season uuid;
BEGIN
    SELECT season_id INTO v_season FROM public.orchard_blocks WHERE id = p_block_id;
    IF v_season IS NOT NULL THEN
        -- Se suelta al terminar la transacción
        PERFORM pg_advisory_xact_lock(hashtextextended('block_rows:' || v_season::text, 0));
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.lock_season_rows(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_row_number_unique()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_other text;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;
    NEW.variety := NULLIF(btrim(NEW.variety), '');
    -- Si otra transacción está metiendo filas en la temporada, se espera a que
    -- termine; la consulta de abajo ya ve lo que confirmó
    PERFORM public.lock_season_rows(NEW.block_id);
    SELECT ob2.name INTO v_other
    FROM public.orchard_blocks ob
    JOIN public.orchard_blocks ob2
      ON ob2.orchard_id = ob.orchard_id AND ob2.season_id = ob.season_id
     AND ob2.id <> ob.id AND ob2.deleted_at IS NULL
    JOIN public.block_rows r2
      ON r2.block_id = ob2.id AND r2.row_number = NEW.row_number AND r2.deleted_at IS NULL
    WHERE ob.id = NEW.block_id
    LIMIT 1;
    IF v_other IS NOT NULL THEN
        RAISE EXCEPTION 'Row % is already in block %', NEW.row_number, v_other USING ERRCODE = '23505';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_row_number_unique() FROM PUBLIC, anon, authenticated;

-- add_block_rows: el mismo candado antes de buscar choques (mensaje claro)
CREATE OR REPLACE FUNCTION public.add_block_rows(
    p_block_id uuid,
    p_from integer,
    p_to integer,
    p_variety text DEFAULT NULL,
    p_target integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_block RECORD;
    v_clash RECORD;
    v_n integer;
BEGIN
    IF p_from IS NULL OR p_to IS NULL OR p_from < 1 OR p_to < p_from OR p_to > 9999 THEN
        RAISE EXCEPTION 'Invalid row range' USING ERRCODE = '22023';
    END IF;
    IF p_to - p_from >= 1000 THEN
        RAISE EXCEPTION 'At most 1000 rows at once' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_block FROM public.orchard_blocks WHERE id = p_block_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Block not found' USING ERRCODE = 'P0002';
    END IF;
    -- Mismo candado que guard_row_number_unique (pg_advisory_xact_lock lo puede pedir cualquiera)
    PERFORM pg_advisory_xact_lock(hashtextextended('block_rows:' || v_block.season_id::text, 0));
    SELECT ob.name, min(r.row_number) AS first_row INTO v_clash
    FROM public.orchard_blocks ob
    JOIN public.block_rows r ON r.block_id = ob.id AND r.deleted_at IS NULL
    WHERE ob.orchard_id = v_block.orchard_id AND ob.season_id = v_block.season_id
      AND ob.id <> v_block.id AND ob.deleted_at IS NULL
      AND r.row_number BETWEEN p_from AND p_to
    GROUP BY ob.name ORDER BY 2 LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Row % is already in block %', v_clash.first_row, v_clash.name USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.block_rows (block_id, row_number, variety, target_buckets)
    SELECT p_block_id, n, NULLIF(btrim(p_variety), ''), COALESCE(p_target, 100)
    FROM generate_series(p_from, p_to) AS n
    WHERE NOT EXISTS (
        SELECT 1 FROM public.block_rows r
        WHERE r.block_id = p_block_id AND r.row_number = n AND r.deleted_at IS NULL
    );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.add_block_rows(uuid, integer, integer, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_block_rows(uuid, integer, integer, text, integer) TO authenticated;

-- 3) Altas de una sola vez (con la RLS de quien llama) ---------------------------

-- Temporada nueva, opcionalmente con los bloques y filas de otra y activada
CREATE OR REPLACE FUNCTION public.create_harvest_season(
    p_orchard_id uuid,
    p_name text,
    p_start_date date,
    p_end_date date DEFAULT NULL,
    p_copy_from uuid DEFAULT NULL,
    p_activate boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    INSERT INTO public.harvest_seasons (orchard_id, name, start_date, end_date, status)
    VALUES (p_orchard_id, btrim(p_name), p_start_date, p_end_date, 'planning')
    RETURNING id INTO v_id;
    IF p_copy_from IS NOT NULL THEN
        PERFORM public.copy_season_structure(p_copy_from, v_id);
    END IF;
    IF p_activate THEN
        PERFORM public.activate_harvest_season(v_id);
    END IF;
    RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_harvest_season(uuid, text, date, date, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_harvest_season(uuid, text, date, date, uuid, boolean) TO authenticated;

-- Bloque nuevo con sus filas (rango opcional)
CREATE OR REPLACE FUNCTION public.create_orchard_block(
    p_season_id uuid,
    p_name text,
    p_color_code text DEFAULT NULL,
    p_row_from integer DEFAULT NULL,
    p_row_to integer DEFAULT NULL,
    p_variety text DEFAULT NULL,
    p_target integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_orchard uuid;
    v_id uuid;
    v_start integer;
BEGIN
    SELECT orchard_id INTO v_orchard FROM public.harvest_seasons WHERE id = p_season_id AND deleted_at IS NULL;
    IF v_orchard IS NULL THEN
        RAISE EXCEPTION 'Season not found' USING ERRCODE = 'P0002';
    END IF;
    IF (p_row_from IS NULL) <> (p_row_to IS NULL) THEN
        RAISE EXCEPTION 'Invalid row range' USING ERRCODE = '22023';
    END IF;
    -- Sin filas: empieza tras la última fila de la temporada
    v_start := COALESCE(p_row_from, (
        SELECT COALESCE(max(r.row_number), 0) + 1
        FROM public.orchard_blocks ob JOIN public.block_rows r ON r.block_id = ob.id AND r.deleted_at IS NULL
        WHERE ob.season_id = p_season_id AND ob.deleted_at IS NULL));
    INSERT INTO public.orchard_blocks (orchard_id, season_id, name, total_rows, start_row, color_code)
    VALUES (v_orchard, p_season_id, btrim(p_name), 0, LEAST(GREATEST(v_start, 1), 9999), COALESCE(p_color_code, '#dc2626'))
    RETURNING id INTO v_id;
    IF p_row_from IS NOT NULL THEN
        PERFORM public.add_block_rows(v_id, p_row_from, p_row_to, p_variety, p_target);
    END IF;
    RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_orchard_block(uuid, text, text, integer, integer, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_orchard_block(uuid, text, text, integer, integer, text, integer) TO authenticated;

-- 4) Asistente de huerto nuevo: salario mínimo sin escribir a mano --------------
DROP FUNCTION IF EXISTS public.setup_orchard_atomic(text, text, text, integer, text, numeric, text, numeric, text, date, date, jsonb);

CREATE OR REPLACE FUNCTION public.setup_orchard_atomic(
    p_code text,
    p_name text,
    p_location text DEFAULT NULL,
    p_total_rows integer DEFAULT 0,
    p_start_time text DEFAULT '07:00',
    p_piece_rate numeric DEFAULT 6.5,
    p_variety text DEFAULT NULL,
    -- El de hoy según la tabla con fechas (minWageFloorOn en pay.ts); obligatorio
    p_min_wage numeric DEFAULT NULL,
    p_season_name text DEFAULT NULL,
    p_season_start date DEFAULT NULL,
    p_season_end date DEFAULT NULL,
    -- [{"name": "Block A", "row_from": 1, "row_to": 15, "variety": "Royal Gala", "target_buckets": 100}]
    p_blocks jsonb DEFAULT '[]'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_orchard RECORD;
    v_today date := (now() AT TIME ZONE 'Pacific/Auckland')::date;
    v_season_id uuid;
    v_block jsonb;
    v_block_id uuid;
    v_from integer;
    v_to integer;
    v_blocks integer := 0;
    v_rows integer := 0;
    v_n integer;
    v_colors text[] := ARRAY['#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];
BEGIN
    IF NOT public.is_role(ARRAY['admin']) THEN
        RAISE EXCEPTION 'Only an admin can create orchards' USING ERRCODE = '42501';
    END IF;
    IF p_min_wage IS NULL OR p_min_wage <= 0 THEN
        RAISE EXCEPTION 'The minimum wage is required' USING ERRCODE = '22023';
    END IF;
    IF p_blocks IS NOT NULL AND jsonb_typeof(p_blocks) <> 'array' THEN
        RAISE EXCEPTION 'p_blocks must be a list' USING ERRCODE = '22023';
    END IF;

    INSERT INTO orchards (code, name, location, total_rows)
    VALUES (NULLIF(trim(p_code), ''), trim(p_name), NULLIF(trim(p_location), ''), COALESCE(p_total_rows, 0))
    RETURNING * INTO v_orchard;

    INSERT INTO harvest_settings (orchard_id, piece_rate, min_wage_rate, variety, shift_start_time)
    VALUES (v_orchard.id, p_piece_rate, p_min_wage, NULLIF(trim(p_variety), ''), COALESCE(p_start_time, '07:00'))
    ON CONFLICT (orchard_id) DO NOTHING;

    INSERT INTO harvest_seasons (orchard_id, name, start_date, end_date, status)
    VALUES (v_orchard.id,
            COALESCE(NULLIF(trim(p_season_name), ''), 'Season ' || to_char(v_today, 'YYYY')),
            COALESCE(p_season_start, v_today), p_season_end, 'active')
    RETURNING id INTO v_season_id;

    INSERT INTO day_setups (orchard_id, date, start_time, piece_rate, min_wage_rate, variety, created_by, season_id)
    VALUES (v_orchard.id, v_today, COALESCE(p_start_time, '07:00')::time, p_piece_rate, p_min_wage,
            NULLIF(trim(p_variety), ''), auth.uid(), v_season_id);

    FOR v_block IN SELECT * FROM jsonb_array_elements(COALESCE(p_blocks, '[]'::jsonb)) LOOP
        v_from := (v_block ->> 'row_from')::integer;
        v_to := (v_block ->> 'row_to')::integer;
        IF NULLIF(trim(v_block ->> 'name'), '') IS NULL THEN
            RAISE EXCEPTION 'Every block needs a name' USING ERRCODE = '22023';
        END IF;
        INSERT INTO orchard_blocks (orchard_id, season_id, name, total_rows, start_row, color_code)
        VALUES (v_orchard.id, v_season_id, trim(v_block ->> 'name'), 0, COALESCE(v_from, 1),
                v_colors[1 + (v_blocks % array_length(v_colors, 1))])
        RETURNING id INTO v_block_id;
        v_blocks := v_blocks + 1;
        IF v_from IS NOT NULL OR v_to IS NOT NULL THEN
            IF v_from IS NULL OR v_to IS NULL OR v_from < 1 OR v_to < v_from OR v_to > 9999 OR v_to - v_from >= 1000 THEN
                RAISE EXCEPTION 'Invalid row range for block %', trim(v_block ->> 'name') USING ERRCODE = '22023';
            END IF;
            INSERT INTO block_rows (block_id, row_number, variety, target_buckets)
            SELECT v_block_id, n, NULLIF(trim(COALESCE(v_block ->> 'variety', p_variety)), ''),
                   COALESCE((v_block ->> 'target_buckets')::integer, 100)
            FROM generate_series(v_from, v_to) AS n;
            GET DIAGNOSTICS v_n = ROW_COUNT;
            v_rows := v_rows + v_n;
        END IF;
    END LOOP;

    UPDATE users SET orchard_id = v_orchard.id WHERE id = auth.uid() AND orchard_id IS NULL;

    RETURN json_build_object('id', v_orchard.id, 'code', v_orchard.code, 'name', v_orchard.name,
                             'season_id', v_season_id, 'blocks', v_blocks, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.setup_orchard_atomic(text, text, text, integer, text, numeric, text, numeric, text, date, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.setup_orchard_atomic(text, text, text, integer, text, numeric, text, numeric, text, date, date, jsonb) TO authenticated;
