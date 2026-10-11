-- =============================================================================
-- La gente rota entre huertos de la MISMA empresa (hoy en A, mañana en B...).
--
-- * La plantilla es de la empresa: cualquier usuario activo puede ver a todas
--   las personas (para fichar en su huerto a alguien que suele estar en otro).
-- * El huerto de cada día sale del fichaje (daily_attendance.orchard_id) y de
--   los escaneos (bucket_records.orchard_id); cada huerto sigue viendo y
--   escribiendo solo sus propios fichajes y escaneos.
-- * Nómina, HR, manager y admin leen fichajes y escaneos de todos los huertos
--   para la nómina semanal de cada persona (suma de todos los huertos).
--
-- Una instalación = una empresa (no hay tabla de empresas). Si algún día hay
-- varias empresas en la misma base, estas políticas deben filtrar por empresa.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_active_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active);
$$;

CREATE OR REPLACE FUNCTION public.can_read_company_payroll()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND is_active
          AND role IN ('admin', 'manager', 'payroll_admin', 'hr_admin')
    );
$$;

DROP POLICY IF EXISTS "Company staff can read all people" ON public.pickers;
CREATE POLICY "Company staff can read all people" ON public.pickers
    FOR SELECT USING (public.is_active_member());

DROP POLICY IF EXISTS "Payroll reads attendance of all orchards" ON public.daily_attendance;
CREATE POLICY "Payroll reads attendance of all orchards" ON public.daily_attendance
    FOR SELECT USING (public.can_read_company_payroll());

DROP POLICY IF EXISTS "Payroll reads buckets of all orchards" ON public.bucket_records;
CREATE POLICY "Payroll reads buckets of all orchards" ON public.bucket_records
    FOR SELECT USING (public.can_read_company_payroll());

DROP POLICY IF EXISTS "Company staff can read all orchards" ON public.orchards;
CREATE POLICY "Company staff can read all orchards" ON public.orchards
    FOR SELECT USING (public.is_active_member());

COMMENT ON COLUMN public.pickers.orchard_id IS
  'Huerto habitual de la persona. El huerto de cada día sale del fichaje (daily_attendance.orchard_id).';
