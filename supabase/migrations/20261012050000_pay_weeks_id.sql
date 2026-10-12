-- pay_weeks necesita un id uuid: audit_logs.record_id es uuid (la clave
-- week_start es una fecha y la auditoría de cierre/reapertura no se guardaba).
ALTER TABLE public.pay_weeks
    ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS pay_weeks_id_key ON public.pay_weeks (id);
