-- =============================================================================
-- Estructura del huerto, arreglos de la revisión (migración 20261024011000)
-- · La variedad de una cubeta sale de la fila de la temporada ACTIVA (antes,
--   tras copiar la estructura a la temporada nueva, podía salir la del año pasado).
-- · Crear temporada (copiar + activar) y crear bloque (con filas): una función.
-- · setup_orchard_atomic exige el salario mínimo (ya no lo trae escrito a mano).
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

CREATE FUNCTION sec_test.after(p_action text, p_check text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
    EXECUTE p_action;
    EXECUTE p_check INTO v;
    RETURN v;
END $$;

-- Temporada activa de A con la fila 3 en «SecTest Old Gala»; temporada nueva
-- copiada de ella y activada, con la fila 3 en «SecTest New Gala»
DO $$
DECLARE
    v_old uuid;
    v_new uuid;
BEGIN
    SELECT id INTO v_old FROM public.harvest_seasons
    WHERE orchard_id = sec_test.id_of('A') AND status = 'active' AND deleted_at IS NULL;
    IF v_old IS NULL THEN
        RAISE EXCEPTION 'sec_test: orchard A has no active season (run the local seeds first)';
    END IF;
    UPDATE public.block_rows r SET variety = 'SecTest Old Gala'
    FROM public.orchard_blocks b WHERE r.block_id = b.id AND b.season_id = v_old AND r.row_number = 3;
    v_new := public.create_harvest_season(sec_test.id_of('A'), 'SecTest next season', current_date, NULL, v_old, true);
    UPDATE public.block_rows r SET variety = 'SecTest New Gala'
    FROM public.orchard_blocks b WHERE r.block_id = b.id AND b.season_id = v_new AND r.row_number = 3;
    INSERT INTO sec_test.ids VALUES ('A.old_season', v_old), ('A.new_season', v_new);
END $$;

SELECT sec_test.record(
    (SELECT status FROM public.harvest_seasons WHERE id = sec_test.id_of('A.new_season')) = 'active'
    AND (SELECT status FROM public.harvest_seasons WHERE id = sec_test.id_of('A.old_season')) = 'closed',
    'create_harvest_season copies the structure and activates (the old season is closed)', 'wrong statuses');
SELECT sec_test.record(
    (SELECT count(*) FROM public.block_rows r JOIN public.orchard_blocks b ON b.id = r.block_id
      WHERE b.season_id = sec_test.id_of('A.new_season')) =
    (SELECT count(*) FROM public.block_rows r JOIN public.orchard_blocks b ON b.id = r.block_id
      WHERE b.season_id = sec_test.id_of('A.old_season') AND r.deleted_at IS NULL AND b.deleted_at IS NULL),
    'the new season has the same rows as the copied one', 'row count differs');

WITH b AS (
    INSERT INTO public.bucket_records (orchard_id, picker_id, scanned_by, scanned_at, quality_grade, row_number)
    VALUES (sec_test.id_of('A'), sec_test.id_of('A.picker'), sec_test.id_of('A.runner'), now(), 'A', 3)
    RETURNING variety
)
SELECT sec_test.record((SELECT variety FROM b) = 'SecTest New Gala',
    'a bucket on row 3 gets the variety of the ACTIVE season (not last season''s)',
    'got ' || COALESCE((SELECT variety FROM b), '<null>'));

-- ── Altas de una sola vez ───────────────────────────────────────────────────
SELECT sec_test.returns('A.manager', 'creates a block with its rows in one call',
    $$SELECT sec_test.after($a$SELECT create_orchard_block({A.season}, 'SecTest one-call', '#2563eb', 40, 45, 'SecTest Fuji', 90)$a$,
      $c$SELECT count(*)::text || '|' || min(b.start_row)::text FROM block_rows r JOIN orchard_blocks b ON b.id = r.block_id
         WHERE b.name = 'SecTest one-call' AND r.variety = 'SecTest Fuji' AND r.target_buckets = 90$c$)$$, '6|40');
SELECT sec_test.allow('A.manager', 'create_orchard_block returns the new block',
    $$SELECT create_orchard_block({A.season}, 'SecTest one-call', '#2563eb', 40, 45, 'SecTest Fuji', 90)$$);
SELECT sec_test.deny('A.manager', 'a block whose rows clash is not created at all (one transaction)',
    $$SELECT create_orchard_block({A.new_season}, 'SecTest clash', NULL, 1, 3)$$, ARRAY['23505']);
SELECT sec_test.deny('A.manager', 'a block needs both ends of the row range',
    $$SELECT create_orchard_block({A.season}, 'SecTest half', NULL, 5, NULL)$$, ARRAY['22023']);
SELECT sec_test.deny(w, 'cannot create blocks in another orchard''s season',
    $$SELECT create_orchard_block({A.season}, 'SecTest x', NULL, 50, 51)$$, ARRAY['42501', 'P0002'])
FROM unnest(ARRAY['B.manager', 'A.team_leader', 'A.runner']) AS w;
SELECT sec_test.allow('A.manager', 'creates a season in one call',
    $$SELECT create_harvest_season({A}, 'SecTest planned', current_date + 300, NULL, NULL, false)$$);
SELECT sec_test.deny(w, 'cannot create seasons in one call',
    $$SELECT create_harvest_season({A}, 'SecTest x', current_date, NULL, NULL, false)$$, ARRAY['42501'])
FROM unnest(ARRAY['B.manager', 'A.team_leader', 'A.manager@aal1']) AS w;

-- ── Asistente de huerto nuevo ───────────────────────────────────────────────
SELECT sec_test.deny('A.admin', 'setup_orchard_atomic needs the minimum wage (sent from the dated table)',
    $$SELECT setup_orchard_atomic('SECTEST-MW', 'SecTest min wage')$$, ARRAY['22023']);
SELECT sec_test.deny('A.admin', 'setup_orchard_atomic: the legal floor is still enforced by harvest_settings',
    $$SELECT setup_orchard_atomic('SECTEST-MW', 'SecTest min wage', NULL, 0, '07:00', 6.5, NULL, 10)$$, ARRAY['23514']);
SELECT sec_test.allow('A.admin', 'setup_orchard_atomic with the minimum wage of today',
    $$SELECT setup_orchard_atomic('SECTEST-MW', 'SecTest min wage', NULL, 0, '07:00', 6.5, NULL, 23.95)$$);

SELECT sec_test.finish();
ROLLBACK;
