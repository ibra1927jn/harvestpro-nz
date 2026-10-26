-- Filas huérfanas: para cada clave foránea de public, auth y storage (también
-- las NOT VALID), cuántas filas apuntan a un padre que no existe.
-- Salida: tabla<TAB>columnas<TAB>tabla padre<TAB>filas<TAB>restricción. Vacía = todo en orden.
-- Una sola SELECT (vale en READ ONLY y en la instantánea de la copia).
WITH fk AS (
  SELECT c.conname,
         (SELECT format('%I.%I', rn.nspname, r.relname) FROM pg_class r JOIN pg_namespace rn ON rn.oid = r.relnamespace
           WHERE r.oid = c.conrelid) AS child,
         (SELECT format('%I.%I', rn.nspname, r.relname) FROM pg_class r JOIN pg_namespace rn ON rn.oid = r.relnamespace
           WHERE r.oid = c.confrelid) AS parent,
         (SELECT string_agg(a.attname, ', ' ORDER BY k.i)
            FROM unnest(c.conkey) WITH ORDINALITY k(attnum, i)
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS cols,
         (SELECT string_agg(format('c.%I', a.attname), ', ' ORDER BY k.i)
            FROM unnest(c.conkey) WITH ORDINALITY k(attnum, i)
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS ccols,
         (SELECT string_agg(format('p.%I', a.attname), ', ' ORDER BY k.i)
            FROM unnest(c.confkey) WITH ORDINALITY k(attnum, i)
            JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum) AS pcols,
         (SELECT string_agg(format('c.%I IS NOT NULL', a.attname), ' AND ')
            FROM unnest(c.conkey) k(attnum)
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS nn_cond
  FROM pg_constraint c
  JOIN pg_namespace n ON n.oid = c.connamespace
  WHERE c.contype = 'f' AND n.nspname IN ('public', 'auth', 'storage')
), counted AS (
  SELECT child, cols, parent, conname,
         (xpath('/row/n/text()', query_to_xml(format(
            'SELECT count(*) AS n FROM %s c WHERE %s AND NOT EXISTS (SELECT 1 FROM %s p WHERE (%s) = (%s))',
            child, nn_cond, parent, pcols, ccols), false, true, '')))[1]::text::bigint AS n
  FROM fk
)
SELECT child, cols, parent, n, conname FROM counted WHERE n > 0 ORDER BY 1, 2;
