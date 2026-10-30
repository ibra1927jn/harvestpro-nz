-- =============================================================================
-- harvest_settings en realtime (auditoría 23-10, C: «Manager cambia ajustes →
-- TL, runner: solo al recargar»). La meta de toneladas, el mínimo de cubetas
-- por hora y el salario mínimo llegan en vivo al team leader y al runner
-- (storeSync, canal del huerto). El precio por cubeta va por piece_rates.
-- La RLS de harvest_settings (lectura por huerto) decide quién recibe el evento.
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'harvest_settings'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.harvest_settings;
    END IF;
END $$;
