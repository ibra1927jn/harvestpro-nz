-- =============================================================================
-- B2 (auditoría 2026-10-23): el cierre del día llega en vivo a TL y runner
--
-- Al cerrar el día el manager escribe day_closures; el TL y el runner solo se
-- enteraban por «escaneo rechazado». Con la tabla en la publicación de
-- realtime, el store (storeSync) pone dayClosed al momento y la app enseña
-- «El día está cerrado». La lectura ya la permiten las políticas existentes.
-- =============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'day_closures') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.day_closures;
    END IF;
END;
$$;
