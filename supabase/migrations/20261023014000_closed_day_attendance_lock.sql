-- =============================================================================
-- B3 (auditoría 2026-10-23): un día cerrado bloqueaba las cubetas pero no los
-- fichajes de ese día (se podían corregir horas ya cerradas por el manager).
--
-- Trigger en daily_attendance, equivalente a enforce_closed_day_bucket_records:
-- con day_closures cerrado para (huerto, fecha) no se puede dar de alta, cambiar
-- ni borrar un fichaje de ese día, salvo admin.
--   · Aprobar / rechazar (review_timesheet: verified_*, rejected_*) SÍ se puede:
--     nómina revisa los días después de cerrarlos.
--   · Clave de servicio y SQL directo (auth.uid() NULL): sin bloqueo, como en
--     guard_user_changes (manage-attendance cierra con ella el turno que quedó
--     abierto en otro huerto; los seeds y la semana de pago).
--   · Se mira el día de antes y el de después (no se puede sacar un fichaje de
--     un día cerrado cambiándole la fecha).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_attendance_day_closed(p_orchard_id uuid, p_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.day_closures dc
        WHERE dc.orchard_id = p_orchard_id
          AND dc.date = p_date
          AND dc.status = 'closed'
          AND dc.deleted_at IS NULL
    );
$$;

REVOKE ALL ON FUNCTION public.is_attendance_day_closed(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_attendance_day_closed(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_closed_day_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- Columnas de la revisión de nómina: cambiarlas no toca las horas
    v_review_cols text[] := ARRAY['verified_by', 'verified_at', 'rejected_by', 'rejected_at',
                                  'rejection_reason', 'updated_at'];
BEGIN
    IF auth.uid() IS NULL OR public.is_role(ARRAY['admin']) THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - v_review_cols) = (to_jsonb(OLD) - v_review_cols) THEN
        RETURN NEW;
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE') AND public.is_attendance_day_closed(OLD.orchard_id, OLD.date) THEN
        RAISE EXCEPTION 'DAY_CLOSED: day % is closed for this orchard. Only an admin can change its timesheets.', OLD.date
            USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') AND public.is_attendance_day_closed(NEW.orchard_id, NEW.date) THEN
        RAISE EXCEPTION 'DAY_CLOSED: day % is closed for this orchard. Only an admin can change its timesheets.', NEW.date
            USING ERRCODE = 'P0001';
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_closed_day_attendance() IS
    'Día cerrado (day_closures): sin altas, cambios ni borrados de fichajes de ese día salvo admin; aprobar/rechazar sí.';

DROP TRIGGER IF EXISTS trg_enforce_closed_day_attendance ON public.daily_attendance;
CREATE TRIGGER trg_enforce_closed_day_attendance
    BEFORE INSERT OR UPDATE OR DELETE ON public.daily_attendance
    FOR EACH ROW EXECUTE FUNCTION public.enforce_closed_day_attendance();
