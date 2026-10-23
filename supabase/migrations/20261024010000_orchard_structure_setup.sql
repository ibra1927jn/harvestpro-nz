-- =============================================================================
-- Dar de alta un huerto desde cero sin SQL (encargo A, 24-10)
--
-- Hasta hoy ninguna pantalla escribía harvest_seasons, orchard_blocks ni
-- block_rows (auditoría 23-10: «se leen y nadie las escribe»). Esta migración
-- deja la base lista para las pantallas «Estructura del huerto» (admin y
-- manager) y para el asistente de huerto nuevo del admin:
--
-- 1) RLS. Se quitan las lecturas abiertas a todos los huertos
--    («Users can read …» con USING (true): cualquiera con sesión leía los
--    bloques, filas y temporadas de todos los huertos). Escritura: el manager
--    solo en SU huerto; el admin en cualquiera (una instalación = una empresa,
--    igual que piece_rates). Sin DELETE: los bloques y filas se archivan
--    (deleted_at), porque las cubetas y asignaciones apuntan a ellos.
-- 2) Coherencia: el bloque es de una temporada de su mismo huerto; un número
--    de fila no se repite en dos bloques de la misma temporada (el mapa y los
--    objetivos por fila usan row_number como clave del huerto); nombres no
--    vacíos; fechas de temporada en orden.
-- 3) Totales: orchard_blocks.start_row / total_rows y orchards.total_rows se
--    recalculan solos a partir de las filas activas (antes se escribían a mano
--    en los seeds y se desincronizaban).
-- 4) Archivar un bloque archiva sus filas.
-- 5) Funciones (SECURITY INVOKER: la RLS de arriba decide quién puede):
--    activate_harvest_season, close_harvest_season, copy_season_structure,
--    add_block_rows.
-- 6) setup_orchard_atomic crea además temporada, bloques y filas en un paso y,
--    si el admin aún no tenía huerto, lo deja en el nuevo.
-- =============================================================================

-- 1) RLS -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read seasons for their orchard" ON public.harvest_seasons;
DROP POLICY IF EXISTS "Users can read blocks" ON public.orchard_blocks;
DROP POLICY IF EXISTS "Users can read rows" ON public.block_rows;

DROP POLICY IF EXISTS "Manage seasons" ON public.harvest_seasons;
DROP POLICY IF EXISTS "Structure editors read seasons" ON public.harvest_seasons;
DROP POLICY IF EXISTS "Structure editors add seasons" ON public.harvest_seasons;
DROP POLICY IF EXISTS "Structure editors change seasons" ON public.harvest_seasons;
-- El admin ve también las temporadas de otros huertos (y las archivadas)
CREATE POLICY "Structure editors read seasons" ON public.harvest_seasons
    FOR SELECT TO authenticated
    USING ((SELECT public.is_role(ARRAY['admin']))
        OR ((SELECT public.is_role(ARRAY['manager'])) AND orchard_id = (SELECT public.get_my_orchard_id())));
CREATE POLICY "Structure editors add seasons" ON public.harvest_seasons
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.is_role(ARRAY['admin']))
        OR ((SELECT public.is_role(ARRAY['manager'])) AND orchard_id = (SELECT public.get_my_orchard_id())));
CREATE POLICY "Structure editors change seasons" ON public.harvest_seasons
    FOR UPDATE TO authenticated
    USING ((SELECT public.is_role(ARRAY['admin']))
        OR ((SELECT public.is_role(ARRAY['manager'])) AND orchard_id = (SELECT public.get_my_orchard_id())))
    WITH CHECK ((SELECT public.is_role(ARRAY['admin']))
        OR ((SELECT public.is_role(ARRAY['manager'])) AND orchard_id = (SELECT public.get_my_orchard_id())));

DROP POLICY IF EXISTS "Manage blocks" ON public.orchard_blocks;
DROP POLICY IF EXISTS "Structure editors read blocks" ON public.orchard_blocks;
DROP POLICY IF EXISTS "Structure editors add blocks" ON public.orchard_blocks;
DROP POLICY IF EXISTS "Structure editors change blocks" ON public.orchard_blocks;
CREATE POLICY "Structure editors read blocks" ON public.orchard_blocks
    FOR SELECT TO authenticated
    USING ((SELECT public.is_role(ARRAY['admin']))
        OR ((SELECT public.is_role(ARRAY['manager'])) AND orchard_id = (SELECT public.get_my_orchard_id())));
CREATE POLICY "Structure editors add blocks" ON public.orchard_blocks
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.is_role(ARRAY['admin']))
        OR ((SELECT public.is_role(ARRAY['manager'])) AND orchard_id = (SELECT public.get_my_orchard_id())));
CREATE POLICY "Structure editors change blocks" ON public.orchard_blocks
    FOR UPDATE TO authenticated
    USING ((SELECT public.is_role(ARRAY['admin']))
        OR ((SELECT public.is_role(ARRAY['manager'])) AND orchard_id = (SELECT public.get_my_orchard_id())))
    WITH CHECK ((SELECT public.is_role(ARRAY['admin']))
        OR ((SELECT public.is_role(ARRAY['manager'])) AND orchard_id = (SELECT public.get_my_orchard_id())));

DROP POLICY IF EXISTS "Manage rows" ON public.block_rows;
DROP POLICY IF EXISTS "Structure editors read rows" ON public.block_rows;
DROP POLICY IF EXISTS "Structure editors add rows" ON public.block_rows;
DROP POLICY IF EXISTS "Structure editors change rows" ON public.block_rows;
CREATE POLICY "Structure editors read rows" ON public.block_rows
    FOR SELECT TO authenticated
    USING ((SELECT public.is_role(ARRAY['admin']))
        OR ((SELECT public.is_role(ARRAY['manager'])) AND EXISTS (
            SELECT 1 FROM public.orchard_blocks ob
            WHERE ob.id = block_rows.block_id AND ob.orchard_id = (SELECT public.get_my_orchard_id()))));
CREATE POLICY "Structure editors add rows" ON public.block_rows
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.is_role(ARRAY['admin']))
        OR ((SELECT public.is_role(ARRAY['manager'])) AND EXISTS (
            SELECT 1 FROM public.orchard_blocks ob
            WHERE ob.id = block_rows.block_id AND ob.orchard_id = (SELECT public.get_my_orchard_id()))));
CREATE POLICY "Structure editors change rows" ON public.block_rows
    FOR UPDATE TO authenticated
    USING ((SELECT public.is_role(ARRAY['admin']))
        OR ((SELECT public.is_role(ARRAY['manager'])) AND EXISTS (
            SELECT 1 FROM public.orchard_blocks ob
            WHERE ob.id = block_rows.block_id AND ob.orchard_id = (SELECT public.get_my_orchard_id()))))
    WITH CHECK ((SELECT public.is_role(ARRAY['admin']))
        OR ((SELECT public.is_role(ARRAY['manager'])) AND EXISTS (
            SELECT 1 FROM public.orchard_blocks ob
            WHERE ob.id = block_rows.block_id AND ob.orchard_id = (SELECT public.get_my_orchard_id()))));

-- Sin política de DELETE: nadie de la app borra (se archiva). Quitar también el permiso.
REVOKE DELETE ON public.harvest_seasons, public.orchard_blocks, public.block_rows FROM anon, authenticated;

-- 2) Coherencia ----------------------------------------------------------------------
ALTER TABLE public.harvest_seasons DROP CONSTRAINT IF EXISTS harvest_seasons_dates_order;
ALTER TABLE public.harvest_seasons
    ADD CONSTRAINT harvest_seasons_dates_order CHECK (end_date IS NULL OR end_date >= start_date);
ALTER TABLE public.harvest_seasons DROP CONSTRAINT IF EXISTS harvest_seasons_name_not_blank;
ALTER TABLE public.harvest_seasons
    ADD CONSTRAINT harvest_seasons_name_not_blank CHECK (btrim(name) <> '' AND length(name) <= 80);
ALTER TABLE public.orchard_blocks DROP CONSTRAINT IF EXISTS orchard_blocks_name_not_blank;
ALTER TABLE public.orchard_blocks
    ADD CONSTRAINT orchard_blocks_name_not_blank CHECK (btrim(name) <> '' AND length(name) <= 60);
ALTER TABLE public.block_rows DROP CONSTRAINT IF EXISTS block_rows_number_positive;
ALTER TABLE public.block_rows
    ADD CONSTRAINT block_rows_number_positive CHECK (row_number BETWEEN 1 AND 9999);
ALTER TABLE public.block_rows DROP CONSTRAINT IF EXISTS block_rows_target_range;
ALTER TABLE public.block_rows
    ADD CONSTRAINT block_rows_target_range CHECK (target_buckets IS NULL OR target_buckets BETWEEN 0 AND 10000);
ALTER TABLE public.block_rows DROP CONSTRAINT IF EXISTS block_rows_variety_length;
ALTER TABLE public.block_rows
    ADD CONSTRAINT block_rows_variety_length CHECK (variety IS NULL OR length(variety) <= 60);

-- El bloque pertenece a una temporada de su mismo huerto
CREATE OR REPLACE FUNCTION public.guard_block_season()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.harvest_seasons s
        WHERE s.id = NEW.season_id AND s.orchard_id = NEW.orchard_id
    ) THEN
        RAISE EXCEPTION 'The block''s season belongs to another orchard' USING ERRCODE = '23514';
    END IF;
    NEW.name := btrim(NEW.name);
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_block_season() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_block_season ON public.orchard_blocks;
CREATE TRIGGER trg_guard_block_season
    BEFORE INSERT OR UPDATE OF season_id, orchard_id, name ON public.orchard_blocks
    FOR EACH ROW EXECUTE FUNCTION public.guard_block_season();

-- Un número de fila solo en un bloque activo de la temporada
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
DROP TRIGGER IF EXISTS trg_guard_row_number_unique ON public.block_rows;
CREATE TRIGGER trg_guard_row_number_unique
    BEFORE INSERT OR UPDATE OF row_number, block_id, deleted_at, variety ON public.block_rows
    FOR EACH ROW EXECUTE FUNCTION public.guard_row_number_unique();

-- 3) Totales ---------------------------------------------------------------------------
-- Filas del huerto = filas activas de los bloques activos de su temporada activa
CREATE OR REPLACE FUNCTION public.refresh_orchard_row_total(p_orchard_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total integer;
BEGIN
    -- Sin temporada activa con bloques: se deja el número que hubiera
    IF NOT EXISTS (
        SELECT 1 FROM public.harvest_seasons s
        JOIN public.orchard_blocks ob ON ob.season_id = s.id AND ob.deleted_at IS NULL
        WHERE s.orchard_id = p_orchard_id AND s.status = 'active' AND s.deleted_at IS NULL
    ) THEN
        RETURN;
    END IF;
    SELECT count(*) INTO v_total
    FROM public.harvest_seasons s
    JOIN public.orchard_blocks ob ON ob.season_id = s.id AND ob.deleted_at IS NULL
    JOIN public.block_rows r ON r.block_id = ob.id AND r.deleted_at IS NULL
    WHERE s.orchard_id = p_orchard_id AND s.status = 'active' AND s.deleted_at IS NULL;
    UPDATE public.orchards SET total_rows = v_total
    WHERE id = p_orchard_id AND total_rows IS DISTINCT FROM v_total;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_orchard_row_total(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_block_row_totals(p_block_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
    v_first integer;
    v_orchard uuid;
BEGIN
    SELECT count(*), min(row_number) INTO v_count, v_first
    FROM public.block_rows WHERE block_id = p_block_id AND deleted_at IS NULL;
    -- Un bloque archivado conserva sus números (historial)
    UPDATE public.orchard_blocks
    SET total_rows = v_count, start_row = COALESCE(v_first, start_row)
    WHERE id = p_block_id AND deleted_at IS NULL
      AND (total_rows IS DISTINCT FROM v_count OR start_row IS DISTINCT FROM COALESCE(v_first, start_row));
    SELECT orchard_id INTO v_orchard FROM public.orchard_blocks WHERE id = p_block_id;
    IF v_orchard IS NOT NULL THEN
        PERFORM public.refresh_orchard_row_total(v_orchard);
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_block_row_totals(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.block_rows_refresh_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        PERFORM public.refresh_block_row_totals(NEW.block_id);
    END IF;
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.block_id IS DISTINCT FROM NEW.block_id) THEN
        PERFORM public.refresh_block_row_totals(OLD.block_id);
    END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.block_rows_refresh_totals() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_block_rows_refresh_totals ON public.block_rows;
CREATE TRIGGER trg_block_rows_refresh_totals
    AFTER INSERT OR DELETE OR UPDATE OF row_number, block_id, deleted_at ON public.block_rows
    FOR EACH ROW EXECUTE FUNCTION public.block_rows_refresh_totals();

-- 4) Archivar un bloque archiva sus filas; activar o archivar cambia el total del huerto
CREATE OR REPLACE FUNCTION public.orchard_blocks_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        UPDATE public.block_rows SET deleted_at = NEW.deleted_at
        WHERE block_id = NEW.id AND deleted_at IS NULL;
        PERFORM public.refresh_orchard_row_total(NEW.orchard_id);
    END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.orchard_blocks_after_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_orchard_blocks_after_change ON public.orchard_blocks;
CREATE TRIGGER trg_orchard_blocks_after_change
    AFTER UPDATE OF deleted_at ON public.orchard_blocks
    FOR EACH ROW EXECUTE FUNCTION public.orchard_blocks_after_change();

CREATE OR REPLACE FUNCTION public.harvest_seasons_after_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
        PERFORM public.refresh_orchard_row_total(NEW.orchard_id);
    END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.harvest_seasons_after_status() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_harvest_seasons_after_status ON public.harvest_seasons;
CREATE TRIGGER trg_harvest_seasons_after_status
    AFTER UPDATE OF status ON public.harvest_seasons
    FOR EACH ROW EXECUTE FUNCTION public.harvest_seasons_after_status();

-- 5) Funciones de las pantallas (con la RLS de quien llama) -----------------------------

-- Activar una temporada: la activa anterior del huerto se cierra (solo una activa)
CREATE OR REPLACE FUNCTION public.activate_harvest_season(p_season_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_orchard uuid;
    v_today date := (now() AT TIME ZONE 'Pacific/Auckland')::date;
BEGIN
    SELECT orchard_id INTO v_orchard FROM public.harvest_seasons
    WHERE id = p_season_id AND deleted_at IS NULL;
    IF v_orchard IS NULL THEN
        RAISE EXCEPTION 'Season not found' USING ERRCODE = 'P0002';
    END IF;
    UPDATE public.harvest_seasons
    SET status = 'closed', end_date = COALESCE(end_date, GREATEST(v_today, start_date))
    WHERE orchard_id = v_orchard AND status = 'active' AND id <> p_season_id AND deleted_at IS NULL;
    UPDATE public.harvest_seasons SET status = 'active' WHERE id = p_season_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Not allowed to change this season' USING ERRCODE = '42501';
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_harvest_season(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_harvest_season(uuid) TO authenticated;

-- Cerrar una temporada (fecha de fin = la puesta, o hoy)
CREATE OR REPLACE FUNCTION public.close_harvest_season(p_season_id uuid, p_end_date date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_today date := (now() AT TIME ZONE 'Pacific/Auckland')::date;
BEGIN
    UPDATE public.harvest_seasons
    SET status = 'closed', end_date = COALESCE(p_end_date, end_date, GREATEST(v_today, start_date))
    WHERE id = p_season_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Not allowed to change this season' USING ERRCODE = '42501';
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.close_harvest_season(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_harvest_season(uuid, date) TO authenticated;

-- Copiar bloques y filas de una temporada a otra vacía del mismo huerto (cada año el
-- huerto es el mismo). Devuelve las filas copiadas.
CREATE OR REPLACE FUNCTION public.copy_season_structure(p_from_season uuid, p_to_season uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_from_orchard uuid;
    v_to_orchard uuid;
    v_block RECORD;
    v_new_block uuid;
    v_rows integer := 0;
    v_n integer;
BEGIN
    SELECT orchard_id INTO v_from_orchard FROM public.harvest_seasons WHERE id = p_from_season AND deleted_at IS NULL;
    SELECT orchard_id INTO v_to_orchard FROM public.harvest_seasons WHERE id = p_to_season AND deleted_at IS NULL;
    IF v_from_orchard IS NULL OR v_to_orchard IS NULL THEN
        RAISE EXCEPTION 'Season not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_from_orchard <> v_to_orchard OR p_from_season = p_to_season THEN
        RAISE EXCEPTION 'Copy between two seasons of the same orchard' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.orchard_blocks WHERE season_id = p_to_season AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'The season already has blocks' USING ERRCODE = '23505';
    END IF;
    FOR v_block IN
        SELECT * FROM public.orchard_blocks
        WHERE season_id = p_from_season AND deleted_at IS NULL ORDER BY start_row, name
    LOOP
        INSERT INTO public.orchard_blocks (orchard_id, season_id, name, total_rows, start_row, color_code)
        VALUES (v_to_orchard, p_to_season, v_block.name, 0, v_block.start_row, v_block.color_code)
        RETURNING id INTO v_new_block;
        INSERT INTO public.block_rows (block_id, row_number, variety, target_buckets)
        SELECT v_new_block, r.row_number, r.variety, r.target_buckets
        FROM public.block_rows r WHERE r.block_id = v_block.id AND r.deleted_at IS NULL
        ORDER BY r.row_number;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_rows := v_rows + v_n;
    END LOOP;
    RETURN v_rows;
END;
$$;
REVOKE ALL ON FUNCTION public.copy_season_structure(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copy_season_structure(uuid, uuid) TO authenticated;

-- Filas en lote: «filas 1–15 en Bloque A» (con variedad y objetivo opcionales).
-- Las que ya existen en el bloque se dejan como están. Devuelve las añadidas.
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
    -- Mensaje claro si el rango pisa filas de otro bloque de la temporada
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

-- 6) Asistente de huerto nuevo (admin): huerto + pago + día + temporada + bloques + filas --
DROP FUNCTION IF EXISTS public.setup_orchard_atomic(text, text, text, integer, text, numeric, text, numeric);

CREATE OR REPLACE FUNCTION public.setup_orchard_atomic(
    p_code text,
    p_name text,
    p_location text DEFAULT NULL,
    p_total_rows integer DEFAULT 0,
    p_start_time text DEFAULT '07:00',
    p_piece_rate numeric DEFAULT 6.5,
    p_variety text DEFAULT NULL,
    p_min_wage numeric DEFAULT 23.95,
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
    IF p_min_wage < 23.95 THEN
        RAISE EXCEPTION 'Minimum wage cannot be below the NZ legal minimum (23.95)' USING ERRCODE = '23514';
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

    -- Temporada activa (sin ella el mapa, los objetivos por fila y los precios por variedad no tienen filas)
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

    -- Un admin recién registrado sin huerto entra directamente en el nuevo
    UPDATE users SET orchard_id = v_orchard.id WHERE id = auth.uid() AND orchard_id IS NULL;

    RETURN json_build_object('id', v_orchard.id, 'code', v_orchard.code, 'name', v_orchard.name,
                             'season_id', v_season_id, 'blocks', v_blocks, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.setup_orchard_atomic(text, text, text, integer, text, numeric, text, numeric, text, date, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.setup_orchard_atomic(text, text, text, integer, text, numeric, text, numeric, text, date, date, jsonb) TO authenticated;
