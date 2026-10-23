-- Recuento de filas de las tablas con datos de la app (public, auth, storage).
-- Lo usan backup-local.* (lo guarda junto a la copia) y restore-local.* (lo
-- compara con la base restaurada). Salida: tabla<TAB>filas, ordenada.
CREATE TEMP TABLE _hp_counts (tbl text, n bigint);
DO $$
DECLARE r record; c bigint;
BEGIN
  FOR r IN SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition
             AND n.nspname IN ('public', 'auth', 'storage')
           ORDER BY 1, 2 LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I', r.nspname, r.relname) INTO c;
    INSERT INTO _hp_counts VALUES (r.nspname || '.' || r.relname, c);
  END LOOP;
END $$;
SELECT tbl, n FROM _hp_counts ORDER BY tbl;
