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
