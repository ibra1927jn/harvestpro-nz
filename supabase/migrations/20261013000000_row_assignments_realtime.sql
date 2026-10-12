-- =============================================================================
-- Filas asignadas en tiempo real
--
-- El team leader escucha row_assignments para recibir al momento las filas que
-- le asigna el manager, pero la tabla no estaba en la publicación de tiempo
-- real, así que nunca le llegaba nada hasta recargar.
-- =============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (
           SELECT 1 FROM pg_publication_tables
           WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'row_assignments'
       ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.row_assignments;
    END IF;
END $$;

-- El disparador de versión (bump_version) escribe NEW.updated_at, pero
-- row_assignments no tenía esa columna: cualquier cambio (retirar una
-- asignación, marcar fila completa, progreso) fallaba con
-- 'record "new" has no field "updated_at"'.
ALTER TABLE public.row_assignments
    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
