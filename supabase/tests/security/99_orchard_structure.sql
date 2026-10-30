-- =============================================================================
-- Estructura del huerto: temporadas, bloques y filas (encargo A, 24-10)
-- Lectura: los de SU huerto (ya no todos los huertos). Escritura: manager de
-- SU huerto; admin de cualquiera. Nadie borra (se archiva). Coherencia:
-- bloque y temporada del mismo huerto, número de fila único en la temporada,
-- totales recalculados. setup_orchard_atomic: solo admin, crea todo en un paso.
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- Ejecuta una acción y luego una consulta (cada una con su instantánea: dentro de
-- una sola sentencia SQL no se verían los cambios de la función)
CREATE FUNCTION sec_test.after(p_action text, p_check text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
    EXECUTE p_action;
    EXECUTE p_check INTO v;
    RETURN v;
END $$;
INSERT INTO sec_test.ids VALUES ('A.season2', gen_random_uuid());

-- ── Lectura ─────────────────────────────────────────────────────────────────
SELECT sec_test.sees(w, 'cannot read the orchard map of another orchard',
    $$SELECT 1 FROM block_rows WHERE id = {B.row}
      UNION ALL SELECT 1 FROM orchard_blocks WHERE id = {B.block}
      UNION ALL SELECT 1 FROM harvest_seasons WHERE id = {B.season}$$, 0)
FROM unnest(ARRAY['A.manager', 'A.team_leader', 'A.runner', 'A.qc_inspector', 'A.logistics',
                  'A.hr_admin', 'A.payroll_admin']) AS w;
SELECT sec_test.sees(w, 'reads the orchard map of own orchard',
    $$SELECT 1 FROM block_rows WHERE id = {A.row}
      UNION ALL SELECT 1 FROM orchard_blocks WHERE id = {A.block}
      UNION ALL SELECT 1 FROM harvest_seasons WHERE id = {A.season}$$, 3)
FROM unnest(ARRAY['A.manager', 'A.team_leader', 'A.runner', 'A.qc_inspector', 'A.admin']) AS w;
SELECT sec_test.sees('A.admin', 'admin reads the structure of every orchard (to set it up)',
    $$SELECT 1 FROM block_rows WHERE id = {B.row}
      UNION ALL SELECT 1 FROM orchard_blocks WHERE id = {B.block}
      UNION ALL SELECT 1 FROM harvest_seasons WHERE id = {B.season}$$, 3);
SELECT sec_test.sees('anon', 'cannot read the orchard map',
    $$SELECT 1 FROM block_rows UNION ALL SELECT 1 FROM orchard_blocks UNION ALL SELECT 1 FROM harvest_seasons$$, 0);

-- ── Temporadas ──────────────────────────────────────────────────────────────
SELECT sec_test.allow('A.manager', 'creates a season in own orchard',
    $$INSERT INTO harvest_seasons (orchard_id, name, start_date, status) VALUES ({A}, 'SecTest 2027', current_date, 'planning')$$);
SELECT sec_test.allow('A.manager', 'sets the dates of a season of own orchard',
    $$UPDATE harvest_seasons SET start_date = current_date - 10, end_date = current_date + 60 WHERE id = {A.season}$$);
SELECT sec_test.deny('A.manager', 'cannot put the end of a season before its start',
    $$UPDATE harvest_seasons SET end_date = start_date - 1 WHERE id = {A.season}$$, ARRAY['23514']);
SELECT sec_test.deny('A.manager', 'cannot create a season in another orchard',
    $$INSERT INTO harvest_seasons (orchard_id, name, start_date, status) VALUES ({B}, 'X', current_date, 'planning')$$);
SELECT sec_test.deny('A.manager', 'cannot change a season of another orchard',
    $$UPDATE harvest_seasons SET name = 'X' WHERE id = {B.season}$$);
SELECT sec_test.deny('A.manager', 'cannot move a season to another orchard',
    $$UPDATE harvest_seasons SET orchard_id = {B} WHERE id = {A.season}$$);
SELECT sec_test.allow('A.admin', 'admin creates a season in any orchard',
    $$INSERT INTO harvest_seasons (orchard_id, name, start_date, status) VALUES ({B}, 'SecTest B 2027', current_date, 'planning')$$);
SELECT sec_test.deny(w, 'cannot create seasons',
    $$INSERT INTO harvest_seasons (orchard_id, name, start_date, status) VALUES ({A}, 'X', current_date, 'planning')$$)
FROM unnest(ARRAY['A.team_leader', 'A.runner', 'A.qc_inspector', 'A.logistics', 'A.hr_admin',
                  'A.payroll_admin', 'A.manager@aal1', 'A.inactive_manager', 'anon']) AS w;
SELECT sec_test.deny(w, 'cannot delete seasons (they are closed, not deleted)',
    $$DELETE FROM harvest_seasons WHERE id = {A.season}$$)
FROM unnest(ARRAY['A.manager', 'A.admin']) AS w;

SELECT sec_test.returns('A.manager', 'activating a season closes the previous active one',
    $$SELECT sec_test.after($a$SELECT activate_harvest_season({A.season})$a$,
      $c$SELECT (SELECT count(*) FROM harvest_seasons WHERE orchard_id = {A} AND status = 'active')::text || '|' ||
              (SELECT status FROM harvest_seasons WHERE id = {A.season}) || '|' ||
              (SELECT count(*) FROM harvest_seasons WHERE orchard_id = {A} AND status = 'closed' AND end_date IS NOT NULL
                 AND name NOT LIKE 'SecTest%')::text$c$)$$, '1|active|1');
SELECT sec_test.deny(w, 'cannot activate seasons',
    $$SELECT activate_harvest_season({A.season})$$, ARRAY['42501', 'P0002'])
FROM unnest(ARRAY['A.team_leader', 'A.runner', 'B.manager', 'A.manager@aal1', 'anon']) AS w;
SELECT sec_test.returns('A.manager', 'closes a season of own orchard',
    $$SELECT sec_test.after($a$SELECT close_harvest_season({A.season}, current_date + 5)$a$,
      $c$SELECT status || ' ' || (end_date = current_date + 5)::text FROM harvest_seasons WHERE id = {A.season}$c$)$$, 'closed true');
SELECT sec_test.deny(w, 'cannot close a season',
    $$SELECT close_harvest_season({A.season})$$, ARRAY['42501'])
FROM unnest(ARRAY['A.team_leader', 'B.manager']) AS w;

-- ── Bloques ─────────────────────────────────────────────────────────────────
SELECT sec_test.allow('A.manager', 'creates a block in a season of own orchard',
    $$INSERT INTO orchard_blocks (orchard_id, season_id, name) VALUES ({A}, {A.season}, 'SecTest new block')$$);
SELECT sec_test.allow('A.manager', 'renames a block of own orchard',
    $$UPDATE orchard_blocks SET name = 'SecTest renamed' WHERE id = {A.block}$$);
SELECT sec_test.deny('A.manager', 'cannot put a block in a season of another orchard',
    $$INSERT INTO orchard_blocks (orchard_id, season_id, name) VALUES ({A}, {B.season}, 'X')$$, ARRAY['23514']);
SELECT sec_test.deny('A.admin', 'admin cannot mix a block and a season of different orchards',
    $$UPDATE orchard_blocks SET season_id = {B.season} WHERE id = {A.block}$$, ARRAY['23514']);
SELECT sec_test.deny('A.manager', 'cannot create a block in another orchard',
    $$INSERT INTO orchard_blocks (orchard_id, season_id, name) VALUES ({B}, {B.season}, 'X')$$);
SELECT sec_test.deny('A.manager', 'cannot rename a block of another orchard',
    $$UPDATE orchard_blocks SET name = 'X' WHERE id = {B.block}$$);
SELECT sec_test.deny('A.manager', 'cannot give a block an empty name',
    $$UPDATE orchard_blocks SET name = '   ' WHERE id = {A.block}$$, ARRAY['23514']);
SELECT sec_test.allow('A.admin', 'admin creates a block in any orchard',
    $$INSERT INTO orchard_blocks (orchard_id, season_id, name) VALUES ({B}, {B.season}, 'SecTest admin block')$$);
SELECT sec_test.deny(w, 'cannot create or rename blocks',
    $$UPDATE orchard_blocks SET name = 'N' WHERE id = {A.block}$$)
FROM unnest(ARRAY['A.team_leader', 'A.runner', 'A.qc_inspector', 'A.logistics', 'A.hr_admin',
                  'A.payroll_admin', 'A.manager@aal1', 'anon']) AS w;
SELECT sec_test.deny(w, 'cannot delete blocks (they are archived)',
    $$DELETE FROM orchard_blocks WHERE id = {A.block}$$)
FROM unnest(ARRAY['A.manager', 'A.admin']) AS w;
SELECT sec_test.returns('A.manager', 'archiving a block archives its rows',
    $$SELECT sec_test.after($a$UPDATE orchard_blocks SET deleted_at = now() WHERE id = {A.block}$a$,
      $c$SELECT count(*)::text FROM block_rows WHERE block_id = {A.block} AND deleted_at IS NULL$c$)$$, '0');

-- ── Filas ───────────────────────────────────────────────────────────────────
SELECT sec_test.returns('A.manager', 'adds rows 2-10 to a block in one go (row 1 already there)',
    $$SELECT add_block_rows({A.block}, 1, 10, 'SecTest Gala', 80)::text$$, '9');
SELECT sec_test.returns('A.manager', 'block totals follow its rows',
    $$SELECT sec_test.after($a$SELECT add_block_rows({A.block}, 1, 10, 'SecTest Gala', 80)$a$,
      $c$SELECT start_row || '-' || total_rows FROM orchard_blocks WHERE id = {A.block}$c$)$$, '1-10');
SELECT sec_test.deny('A.manager', 'cannot add a row number that another block of the season has',
    $$SELECT add_block_rows(b.id, 1, 3) FROM orchard_blocks b WHERE b.season_id = (SELECT season_id FROM orchard_blocks WHERE name = 'Block A' AND orchard_id = {A} AND deleted_at IS NULL LIMIT 1) AND b.name = 'Block B'$$,
    ARRAY['23505']);
SELECT sec_test.deny('A.manager', 'cannot move a row onto a number another block uses',
    $$UPDATE block_rows r SET row_number = 1 FROM orchard_blocks b
      WHERE r.block_id = b.id AND b.orchard_id = {A} AND b.name = 'Block B' AND r.row_number = 16 AND b.deleted_at IS NULL$$,
    ARRAY['23505']);
SELECT sec_test.deny('A.manager', 'cannot add rows with an invalid range',
    $$SELECT add_block_rows({A.block}, 5, 2)$$, ARRAY['22023']);
SELECT sec_test.allow('A.manager', 'sets variety and target for a range of rows',
    $$UPDATE block_rows SET variety = 'SecTest Royal Gala', target_buckets = 90 WHERE block_id = {A.block} AND row_number BETWEEN 1 AND 1$$);
SELECT sec_test.allow('A.manager', 'archives a row of own orchard',
    $$UPDATE block_rows SET deleted_at = now() WHERE id = {A.row}$$);
SELECT sec_test.deny('A.manager', 'cannot add rows to a block of another orchard',
    $$SELECT add_block_rows({B.block}, 2, 5)$$, ARRAY['42501', 'P0002']);
SELECT sec_test.deny('A.manager', 'cannot edit rows of another orchard',
    $$UPDATE block_rows SET variety = 'X' WHERE id = {B.row}$$);
SELECT sec_test.returns('A.admin', 'admin adds rows in any orchard',
    $$SELECT add_block_rows({B.block}, 2, 5)::text$$, '4');
SELECT sec_test.deny(w, 'cannot add or edit rows',
    $$UPDATE block_rows SET target_buckets = 1 WHERE id = {A.row}$$)
FROM unnest(ARRAY['A.team_leader', 'A.runner', 'A.qc_inspector', 'A.logistics', 'A.hr_admin',
                  'A.payroll_admin', 'A.manager@aal1', 'anon']) AS w;
SELECT sec_test.deny(w, 'cannot add rows in a batch',
    $$SELECT add_block_rows({A.block}, 20, 25)$$, ARRAY['42501', 'P0002'])
FROM unnest(ARRAY['A.team_leader', 'A.runner', 'anon']) AS w;
SELECT sec_test.deny(w, 'cannot delete rows (they are archived)',
    $$DELETE FROM block_rows WHERE id = {A.row}$$)
FROM unnest(ARRAY['A.manager', 'A.admin']) AS w;

-- ── Copiar la estructura a la temporada nueva ───────────────────────────────
SELECT sec_test.returns('A.manager', 'copies blocks and rows of a season into a new empty one',
    $$SELECT sec_test.after($a$INSERT INTO harvest_seasons (id, orchard_id, name, start_date, status)
                             VALUES ({A.season2}, {A}, 'SecTest copy', current_date, 'planning')$a$,
      $c$SELECT copy_season_structure({A.season}, {A.season2})::text$c$)$$, '1');
SELECT sec_test.deny('A.manager', 'cannot copy into a season that already has blocks',
    $$SELECT copy_season_structure({A.season}, {A.season})$$, ARRAY['22023']);
SELECT sec_test.deny('A.manager', 'cannot copy between orchards',
    $$SELECT copy_season_structure({A.season}, {B.season})$$, ARRAY['22023', 'P0002']);

-- ── Asistente de huerto nuevo ───────────────────────────────────────────────
SELECT sec_test.returns('A.admin', 'setup_orchard_atomic creates orchard, active season, blocks and rows',
    $$SELECT sec_test.after($a$SELECT setup_orchard_atomic('SECTEST-NEW', 'SecTest new orchard', NULL, 0, '07:00', 6.5, NULL, 23.95,
              'SecTest season', current_date, NULL,
              '[{"name":"Block A","row_from":1,"row_to":15,"variety":"Royal Gala","target_buckets":90},
                 {"name":"Block B","row_from":16,"row_to":20,"variety":"Braeburn"}]'::jsonb)$a$,
      $c$SELECT o.total_rows::text || '|' || (SELECT count(*) FROM orchard_blocks ob WHERE ob.orchard_id = o.id)::text || '|' ||
              (SELECT status FROM harvest_seasons s WHERE s.orchard_id = o.id) || '|' ||
              (SELECT string_agg(DISTINCT variety, ',') FROM block_rows br JOIN orchard_blocks ob ON ob.id = br.block_id
                 WHERE ob.orchard_id = o.id) || '|' ||
              (SELECT sum(target_buckets)::text FROM block_rows br JOIN orchard_blocks ob ON ob.id = br.block_id
                 WHERE ob.orchard_id = o.id)
       FROM orchards o WHERE o.code = 'SECTEST-NEW'$c$)$$,
    '20|2|active|Braeburn,Royal Gala|1850');
SELECT sec_test.deny('A.admin', 'setup_orchard_atomic rejects overlapping blocks',
    $$SELECT setup_orchard_atomic('SECTEST-OVL', 'SecTest overlap', NULL, 0, '07:00', 6.5, NULL, 23.95, NULL, NULL, NULL,
        '[{"name":"A","row_from":1,"row_to":5},{"name":"B","row_from":5,"row_to":8}]'::jsonb)$$, ARRAY['23505']);
SELECT sec_test.deny(w, 'cannot create orchards',
    $$SELECT setup_orchard_atomic('SECTEST-NO', 'SecTest no')$$)
FROM unnest(ARRAY['A.manager', 'A.hr_admin', 'A.team_leader', 'A.admin@aal1']) AS w;
SELECT sec_test.deny('anon', 'cannot create orchards', $$SELECT setup_orchard_atomic('SECTEST-NO', 'SecTest no')$$);

SELECT sec_test.finish();
ROLLBACK;
