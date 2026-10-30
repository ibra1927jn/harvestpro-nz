-- =============================================================================
-- A3 (auditoría 2026-10-23): una hoja aprobada que se corrige seguía aprobada;
-- se podía aprobar un turno abierto (0,0 h). B10: rechazo sin motivo.
--
-- 1) Trigger: cambiar entrada, salida, descanso u horas de un fichaje aprobado
--    le quita la aprobación (verified_by / verified_at a NULL): vuelve a
--    "pendiente de aprobar". Igual que trg_clear_timesheet_rejection con el
--    rechazo, y para todas las vías (manage-attendance correct / correct_batch,
--    check_out, PostgREST). Semana de pago cerrada: ya lo bloquea
--    trg_block_closed_pay_week_attendance.
-- 2) review_timesheet: no aprueba un turno sin salida (SHIFT_OPEN) y un rechazo
--    necesita motivo (3–200 caracteres).
-- =============================================================================

-- 1) Corregir quita la aprobación --------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_timesheet_approval_on_correction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF (OLD.verified_by IS NOT NULL OR OLD.verified_at IS NOT NULL)
       AND NEW.verified_by IS NOT DISTINCT FROM OLD.verified_by
       AND NEW.verified_at IS NOT DISTINCT FROM OLD.verified_at
       AND (
              NEW.check_in IS DISTINCT FROM OLD.check_in
           OR NEW.check_out IS DISTINCT FROM OLD.check_out
           OR NEW.break_start IS DISTINCT FROM OLD.break_start
           OR NEW.break_minutes IS DISTINCT FROM OLD.break_minutes
           OR NEW.hours_worked IS DISTINCT FROM OLD.hours_worked
       ) THEN
        NEW.verified_by := NULL;
        NEW.verified_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.clear_timesheet_approval_on_correction() IS
    'Corregir entrada/salida/descanso/horas de un fichaje aprobado lo devuelve a pendiente (verified_by/at a NULL).';

DROP TRIGGER IF EXISTS trg_clear_timesheet_approval ON public.daily_attendance;
CREATE TRIGGER trg_clear_timesheet_approval
    BEFORE UPDATE ON public.daily_attendance
    FOR EACH ROW EXECUTE FUNCTION public.clear_timesheet_approval_on_correction();

-- 2) review_timesheet: sin aprobar turnos abiertos; rechazo con motivo --------
-- Igual que 20261014001000 salvo las dos comprobaciones nuevas (tras las de
-- permisos, para que quien no puede revisar siga recibiendo 42501).
CREATE OR REPLACE FUNCTION public.review_timesheet(
    p_attendance_id uuid,
    p_decision text,
    p_reason text DEFAULT NULL
)
RETURNS TABLE (id uuid, picker_id uuid, verified_by uuid, rejected_by uuid, rejection_reason text, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_row public.daily_attendance%ROWTYPE;
    v_reason text := NULLIF(trim(p_reason), '');
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
    END IF;
    IF p_decision NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'decision must be approve or reject' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_row FROM public.daily_attendance a
    WHERE a.id = p_attendance_id AND a.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Timesheet not found' USING ERRCODE = 'P0002';
    END IF;

    IF NOT (
        public.is_role(ARRAY['admin', 'payroll_admin'])
        OR (public.is_role(ARRAY['manager']) AND v_row.orchard_id = public.get_my_orchard_id())
    ) THEN
        RAISE EXCEPTION 'Not allowed to review this timesheet' USING ERRCODE = '42501';
    END IF;
    IF v_row.picker_id = v_uid AND NOT public.is_role(ARRAY['admin']) THEN
        RAISE EXCEPTION 'Cannot review your own timesheet' USING ERRCODE = '42501';
    END IF;

    -- Un turno sin salida no tiene horas que aprobar (nómina pagaría 0 h o lo
    -- que se corrija después sin que nadie lo revise)
    IF p_decision = 'approve' AND v_row.check_out IS NULL THEN
        RAISE EXCEPTION 'SHIFT_OPEN: this shift has no check-out yet and cannot be approved'
            USING ERRCODE = '22023';
    END IF;
    -- El rechazo vuelve al team leader / manager: tiene que saber qué corregir
    IF p_decision = 'reject' AND (v_reason IS NULL OR char_length(v_reason) < 3 OR char_length(v_reason) > 200) THEN
        RAISE EXCEPTION 'REJECTION_REASON: a rejection needs a reason of 3 to 200 characters'
            USING ERRCODE = '22023';
    END IF;

    IF p_decision = 'approve' THEN
        UPDATE public.daily_attendance a
        SET verified_by = v_uid, verified_at = now(),
            rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL
        WHERE a.id = p_attendance_id;
    ELSE
        UPDATE public.daily_attendance a
        SET verified_by = NULL, verified_at = NULL,
            rejected_by = v_uid, rejected_at = now(), rejection_reason = v_reason
        WHERE a.id = p_attendance_id;
    END IF;

    RETURN QUERY
    SELECT a.id, a.picker_id, a.verified_by, a.rejected_by, a.rejection_reason, a.updated_at
    FROM public.daily_attendance a WHERE a.id = p_attendance_id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_timesheet(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_timesheet(uuid, text, text) TO authenticated, service_role;
