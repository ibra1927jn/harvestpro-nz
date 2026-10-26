-- Recuento de filas de las tablas con datos de la app (public, auth, storage).
-- Una sola SELECT (vale dentro de una transacción READ ONLY): backup-local la
-- ejecuta en la misma instantánea que pg_dump, y restore-local la repite en la
-- base restaurada para comparar. Salida: tabla<TAB>filas.
SELECT n.nspname || '.' || c.relname,
       (xpath('/row/n/text()',
              query_to_xml(format('SELECT count(*) AS n FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition
  AND n.nspname IN ('public', 'auth', 'storage')
ORDER BY 1;
