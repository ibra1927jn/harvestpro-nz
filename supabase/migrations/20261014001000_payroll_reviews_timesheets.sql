-- =============================================================================
-- Nómina (payroll_admin) aprueba y rechaza hojas de horas (decisión del dueño,
-- 2026-10-14). Antes la pantalla de Nómina mostraba Aprobar/Rechazar pero
-- approve-timesheet solo admitía admin/manager (403) y "Rechazar" escribía
-- columnas que no existían (rejected, rejected_at): siempre daba error.
--
-- - Columnas de rechazo en daily_attendance (quién, cuándo, motivo).
-- - public.review_timesheet(id, 'approve' | 'reject', motivo): única puerta
--   para aprobar/rechazar. Quien aprueba o rechaza es SIEMPRE quien llama.
--     · payroll_admin y admin: cualquier huerto (la nómina es de la empresa)
--     · manager: solo su huerto
--     · nadie (salvo admin) revisa su propio fichaje
--     · semana de pago cerrada: no se cambia nada (trigger
--       block_closed_pay_week_attendance, también aquí)
--   El rol se mira con is_role(): exige 2FA (20261014000000).
-- - Corregir un fichaje rechazado (entrada, salida, descanso) quita el
--   rechazo: vuelve a "pendiente de aprobar".
-- =============================================================================

ALTER TABLE public.daily_attendance
    ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users(id),
    ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
    ADD COLUMN IF NOT EXISTS rejection_reason text CHECK (char_length(rejection_reason) <= 500);

COMMENT ON COLUMN public.daily_attendance.rejected_at IS
    'Hoja de horas rechazada por nómina/manager (review_timesheet). Se limpia al corregir el fichaje o al aprobarlo.';

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

    IF p_decision = 'approve' THEN
        UPDATE public.daily_attendance a
        SET verified_by = v_uid, verified_at = now(),
            rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL
        WHERE a.id = p_attendance_id;
    ELSE
        UPDATE public.daily_attendance a
        SET verified_by = NULL, verified_at = NULL,
            rejected_by = v_uid, rejected_at = now(), rejection_reason = NULLIF(trim(p_reason), '')
        WHERE a.id = p_attendance_id;
    END IF;

    RETURN QUERY
    SELECT a.id, a.picker_id, a.verified_by, a.rejected_by, a.rejection_reason, a.updated_at
    FROM public.daily_attendance a WHERE a.id = p_attendance_id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_timesheet(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_timesheet(uuid, text, text) TO authenticated, service_role;

-- Corregir un fichaje rechazado lo devuelve a "pendiente"
CREATE OR REPLACE FUNCTION public.clear_timesheet_rejection_on_correction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF OLD.rejected_at IS NOT NULL AND NEW.rejected_at IS NOT DISTINCT FROM OLD.rejected_at AND (
           NEW.check_in IS DISTINCT FROM OLD.check_in
        OR NEW.check_out IS DISTINCT FROM OLD.check_out
        OR NEW.break_start IS DISTINCT FROM OLD.break_start
        OR NEW.break_minutes IS DISTINCT FROM OLD.break_minutes
    ) THEN
        NEW.rejected_by := NULL;
        NEW.rejected_at := NULL;
        NEW.rejection_reason := NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_timesheet_rejection ON public.daily_attendance;
CREATE TRIGGER trg_clear_timesheet_rejection
    BEFORE UPDATE ON public.daily_attendance
    FOR EACH ROW EXECUTE FUNCTION public.clear_timesheet_rejection_on_correction();
