-- =============================================================================
-- Calidad y Logística: lo que impedía usarlas en el día a día
--
-- 1) qc_inspections.picker_id apuntaba a users, pero Calidad inspecciona a la
--    cuadrilla (pickers): no se podía guardar ninguna inspección de un picker.
--    Ahora vale cualquier persona de la plantilla (pickers) o de oficina (users).
-- 2) Avisos (broadcasts): solo el manager podía crearlos; el runner que pide
--    bins y los team leaders no. Ahora cualquier usuario de su propio huerto,
--    siempre como remitente él mismo.
-- 3) Bins: el runner los pone "en uso" / "lleno" y Logística los recoge;
--    antes solo manager y team leader podían cambiarlos.
-- 4) Tiempo real de inspecciones de Calidad para el panel del manager.
-- =============================================================================

-- 1) Inspecciones: persona de la plantilla
ALTER TABLE public.qc_inspections DROP CONSTRAINT IF EXISTS qc_inspections_picker_id_fkey;

CREATE OR REPLACE FUNCTION public.check_qc_inspection_picker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.pickers WHERE id = NEW.picker_id)
       AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.picker_id) THEN
        RAISE EXCEPTION 'QC_PICKER_NOT_FOUND: % is not in the staff list', NEW.picker_id
            USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_qc_inspection_picker ON public.qc_inspections;
CREATE TRIGGER trg_check_qc_inspection_picker
    BEFORE INSERT OR UPDATE OF picker_id ON public.qc_inspections
    FOR EACH ROW EXECUTE FUNCTION public.check_qc_inspection_picker();

COMMENT ON COLUMN public.qc_inspections.picker_id IS
  'Persona inspeccionada: pickers.id (cuadrilla) o users.id. Se valida con trg_check_qc_inspection_picker.';

-- 2) Avisos: cualquiera de su huerto, como sí mismo
DROP POLICY IF EXISTS "broadcasts_insert_policy" ON public.broadcasts;
CREATE POLICY "broadcasts_insert_policy" ON public.broadcasts FOR INSERT
    WITH CHECK (
        auth.uid() = sender_id
        AND orchard_id = public.get_my_orchard_id()
    );

-- 3) Bins: runner y logística pueden cambiar el estado en su huerto
DROP POLICY IF EXISTS "Runners and logistics update bins" ON public.bins;
CREATE POLICY "Runners and logistics update bins" ON public.bins FOR UPDATE
    USING (
        orchard_id = public.get_my_orchard_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role IN ('runner', 'logistics')
        )
    )
    WITH CHECK (orchard_id = public.get_my_orchard_id());

-- 4) Tiempo real de Calidad
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (
           SELECT 1 FROM pg_publication_tables
           WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'qc_inspections'
       ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.qc_inspections;
    END IF;
END $$;
