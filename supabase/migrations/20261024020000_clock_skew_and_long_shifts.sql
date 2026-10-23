-- =============================================================================
-- Hora fiable de fichajes y cubetas (ronda 24-10, encargo B.1)
--
-- 1. Desfase del reloj del móvil. La hora la pone el servidor; solo cuando el
--    móvil la manda (pase de lista o cubetas sin red) se usa la del móvil,
--    corregida con su desfase conocido y nunca del futuro. Aquí queda apuntado
--    ese desfase (ms, servidor − móvil) para que nómina vea de dónde salió la
--    hora. NULL = hora del servidor (o móvil antiguo que no lo dice).
--      · bucket_records.clock_skew_ms
--      · daily_attendance.check_in_clock_skew_ms / check_out_clock_skew_ms
--    (los descansos lo dejan en audit_logs, en la fila de break_start/break_end)
--
-- 2. Turnos de más de 14 h sin corregir (salida olvidada). El cálculo de pago
--    (pay.ts / pay-rules.ts, maxUnreviewedShiftHours) paga como mucho 14 h
--    hasta que alguien corrija la hoja (corrected_at). Aquí: nadie la aprueba
--    sin corregirla, ni por review_timesheet ni con un UPDATE directo de
--    verified_by. Un turno abierto ya no se podía aprobar (SHIFT_OPEN).
-- =============================================================================

ALTER TABLE public.bucket_records
    ADD COLUMN IF NOT EXISTS clock_skew_ms integer;
COMMENT ON COLUMN public.bucket_records.clock_skew_ms IS
    'Desfase del reloj del móvil al subir el escaneo (ms, servidor − móvil). NULL = sin dato. record-bucket corrige la hora con él.';

ALTER TABLE public.daily_attendance
    ADD COLUMN IF NOT EXISTS check_in_clock_skew_ms integer,
    ADD COLUMN IF NOT EXISTS check_out_clock_skew_ms integer;
COMMENT ON COLUMN public.daily_attendance.check_in_clock_skew_ms IS
    'Entrada con la hora del móvil (pase de lista sin red): desfase aplicado (ms, servidor − móvil). NULL = hora del servidor.';
COMMENT ON COLUMN public.daily_attendance.check_out_clock_skew_ms IS
    'Salida con la hora del móvil (pase de lista sin red): desfase aplicado (ms, servidor − móvil). NULL = hora del servidor.';

-- Tope de horas sin revisar: el mismo que PAY_RULES.maxUnreviewedShiftHours
CREATE OR REPLACE FUNCTION public.shift_needs_review(
    p_check_in timestamptz,
    p_check_out timestamptz,
    p_corrected_at timestamptz
) RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
    SELECT p_check_in IS NOT NULL
       AND p_check_out IS NOT NULL
       AND p_corrected_at IS NULL
       AND p_check_out - p_check_in > interval '14 hours';
$$;
COMMENT ON FUNCTION public.shift_needs_review(timestamptz, timestamptz, timestamptz) IS
    'Tramo cerrado de más de 14 h sin corregir (igual que shiftNeedsReview de pay.ts para tramos cerrados).';

-- Aprobar un tramo así: no, hasta corregirlo. Solo cuando lo hace una persona
-- (auth.uid()): la clave de servicio y el SQL directo quedan libres, como en
-- el resto de bloqueos de fichajes.
CREATE OR REPLACE FUNCTION public.require_long_shift_correction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NOT NULL
       AND NEW.verified_by IS NOT NULL
       AND (OLD.verified_by IS DISTINCT FROM NEW.verified_by OR OLD.verified_at IS DISTINCT FROM NEW.verified_at)
       AND public.shift_needs_review(NEW.check_in, NEW.check_out, NEW.corrected_at)
    THEN
        RAISE EXCEPTION 'LONG_SHIFT: this shift is longer than 14 hours and has not been corrected. Fix the check-out time in Timesheet before approving it.'
            USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;

-- Nombre posterior a trg_clear_timesheet_approval (los triggers van por orden
-- alfabético): una corrección que quita la aprobación pasa primero por aquel
DROP TRIGGER IF EXISTS trg_require_long_shift_correction ON public.daily_attendance;
CREATE TRIGGER trg_require_long_shift_correction
    BEFORE UPDATE ON public.daily_attendance
    FOR EACH ROW EXECUTE FUNCTION public.require_long_shift_correction();
