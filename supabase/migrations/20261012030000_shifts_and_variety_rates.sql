-- =============================================================================
-- Tramos de trabajo y precio por variedad
--
-- 1) Varios tramos por persona y día: una persona puede trabajar por la mañana
--    en el huerto A y por la tarde en el B (o dos veces en el mismo). Cada fila
--    de daily_attendance es un tramo con su huerto, entrada, salida y descanso.
--    Regla: como mucho UN tramo abierto (sin salida) por persona y día (uno
--    olvidado de ayer no bloquea fichar hoy; la nómina lo marca para revisar).
--    El complemento al mínimo se sigue calculando por DÍA (suma de tramos).
-- 2) Precio por variedad: cada cubeta se paga según la variedad de la fila
--    donde se recogió. variety_rates guarda el precio por variedad (por huerto,
--    o para toda la empresa si orchard_id es NULL). Sin precio de variedad se usa
--    harvest_settings.piece_rate del huerto.
-- 3) bucket_records.variety: la variedad de la cubeta, rellenada al escanear a
--    partir de la fila (block_rows), para no recalcularla en cada informe.
-- =============================================================================

-- 1) Tramos
ALTER TABLE public.daily_attendance DROP CONSTRAINT IF EXISTS daily_attendance_unique;
CREATE UNIQUE INDEX IF NOT EXISTS daily_attendance_one_open_shift
    ON public.daily_attendance (picker_id, date)
    WHERE check_out IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_daily_attendance_picker_date
    ON public.daily_attendance (picker_id, date);
COMMENT ON TABLE public.daily_attendance IS
  'Tramos de trabajo: una fila por tramo (persona, día, huerto, entrada, salida, descanso). Varios tramos por día; como mucho uno abierto por persona y día.';

-- 2) Precio por variedad
CREATE TABLE IF NOT EXISTS public.variety_rates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    orchard_id uuid REFERENCES public.orchards(id) ON DELETE CASCADE,
    variety text NOT NULL,
    piece_rate numeric(10,2) NOT NULL CHECK (piece_rate >= 0),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS variety_rates_orchard_variety
    ON public.variety_rates (coalesce(orchard_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(variety));
COMMENT ON TABLE public.variety_rates IS
  'Precio por cubeta de cada variedad. orchard_id NULL = precio de la empresa para esa variedad; uno con huerto manda sobre el de la empresa.';

ALTER TABLE public.variety_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members read variety rates" ON public.variety_rates;
CREATE POLICY "Members read variety rates" ON public.variety_rates
    FOR SELECT USING (public.is_active_member());
DROP POLICY IF EXISTS "Managers manage variety rates" ON public.variety_rates;
CREATE POLICY "Managers manage variety rates" ON public.variety_rates
    FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active AND role IN ('admin', 'manager')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active AND role IN ('admin', 'manager')));

-- 3) Variedad de cada cubeta
ALTER TABLE public.bucket_records ADD COLUMN IF NOT EXISTS variety text;

CREATE OR REPLACE FUNCTION public.set_bucket_variety()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.variety IS NULL THEN
        SELECT r.variety INTO NEW.variety
        FROM public.block_rows r
        JOIN public.orchard_blocks b ON b.id = r.block_id
        WHERE (NEW.block_row_id IS NOT NULL AND r.id = NEW.block_row_id)
           OR (NEW.block_row_id IS NULL AND b.orchard_id = NEW.orchard_id AND r.row_number = NEW.row_number
               AND r.deleted_at IS NULL)
        LIMIT 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_bucket_variety ON public.bucket_records;
CREATE TRIGGER trg_set_bucket_variety
BEFORE INSERT ON public.bucket_records
FOR EACH ROW EXECUTE FUNCTION public.set_bucket_variety();

-- Rellenar las cubetas que ya existen
UPDATE public.bucket_records br
SET variety = r.variety
FROM public.block_rows r
JOIN public.orchard_blocks b ON b.id = r.block_id
WHERE br.variety IS NULL
  AND b.orchard_id = br.orchard_id
  AND r.row_number = br.row_number
  AND r.deleted_at IS NULL;
