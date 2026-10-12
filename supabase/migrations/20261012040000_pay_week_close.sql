-- =============================================================================
-- Cierre de la semana de pago
--
-- La nómina es semanal (lunes–domingo, hora NZ) y se paga tras cerrarla el
-- lunes siguiente. Al cerrar:
--   1) se guarda una foto exacta de la nómina pagada (snapshot) y
--   2) la base de datos BLOQUEA cualquier cambio en fichajes y cubetas de esos
--      días (alta, edición o borrado), venga de la app, de una función o de
--      una sincronización offline tardía.
-- Reabrir es posible (con motivo, queda auditado); al volver a cerrar se
-- guarda una foto nueva.
-- Una sola empresa por base de datos: la semana se cierra para todos los huertos.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pay_weeks (
    week_start date PRIMARY KEY,
    week_end date NOT NULL,
    status text NOT NULL CHECK (status IN ('closed', 'reopened')),
    closed_by uuid REFERENCES public.users(id),
    closed_at timestamptz,
    -- Resultado de calculate-payroll en el momento del cierre (lo que se paga)
    snapshot jsonb NOT NULL,
    total_earnings numeric(12,2) NOT NULL DEFAULT 0,
    reopened_by uuid REFERENCES public.users(id),
    reopened_at timestamptz,
    reopen_reason text,
    updated_at timestamptz DEFAULT now(),
    CHECK (week_end = week_start + 6)
);
COMMENT ON TABLE public.pay_weeks IS
  'Semanas de pago cerradas: foto de la nómina pagada. Mientras status = closed, los fichajes y cubetas de esos días no se pueden cambiar.';

ALTER TABLE public.pay_weeks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Payroll reads pay weeks" ON public.pay_weeks;
CREATE POLICY "Payroll reads pay weeks" ON public.pay_weeks
    FOR SELECT USING (public.can_read_company_payroll());
-- Sin políticas de escritura: solo la Edge Function close-pay-week (service role).

-- ¿Ese día está en una semana cerrada?
CREATE OR REPLACE FUNCTION public.is_pay_day_closed(d date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.pay_weeks
        WHERE status = 'closed' AND d BETWEEN week_start AND week_end
    );
$$;

-- Fichajes: bloquear cambios en días de una semana cerrada
CREATE OR REPLACE FUNCTION public.block_closed_pay_week_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') AND public.is_pay_day_closed(OLD.date) THEN
        RAISE EXCEPTION 'PAY_WEEK_CLOSED: the pay week containing % is closed. Reopen it to change timesheets.', OLD.date
            USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') AND public.is_pay_day_closed(NEW.date) THEN
        RAISE EXCEPTION 'PAY_WEEK_CLOSED: the pay week containing % is closed. Reopen it to change timesheets.', NEW.date
            USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_closed_pay_week_attendance ON public.daily_attendance;
CREATE TRIGGER trg_block_closed_pay_week_attendance
    BEFORE INSERT OR UPDATE OR DELETE ON public.daily_attendance
    FOR EACH ROW EXECUTE FUNCTION public.block_closed_pay_week_attendance();

-- Cubetas: el día es el día NZ del escaneo
CREATE OR REPLACE FUNCTION public.block_closed_pay_week_buckets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.scanned_at IS NOT NULL
       AND public.is_pay_day_closed((OLD.scanned_at AT TIME ZONE 'Pacific/Auckland')::date) THEN
        RAISE EXCEPTION 'PAY_WEEK_CLOSED: the pay week of this bucket (%) is closed.', OLD.scanned_at
            USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.scanned_at IS NOT NULL
       AND public.is_pay_day_closed((NEW.scanned_at AT TIME ZONE 'Pacific/Auckland')::date) THEN
        RAISE EXCEPTION 'PAY_WEEK_CLOSED: the pay week of this bucket (%) is closed.', NEW.scanned_at
            USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_closed_pay_week_buckets ON public.bucket_records;
CREATE TRIGGER trg_block_closed_pay_week_buckets
    BEFORE INSERT OR UPDATE OR DELETE ON public.bucket_records
    FOR EACH ROW EXECUTE FUNCTION public.block_closed_pay_week_buckets();
