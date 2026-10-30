-- =============================================================================
-- Semanas de pago cerradas (pay_weeks): solo nómina, RRHH y admin
-- (decisión del dueño, 2026-10-27: en Nómina el manager ve solo la parte de su huerto)
--
-- pay_weeks.snapshot es la foto de la nómina de la EMPRESA al cerrar la semana:
-- cada persona, cada día, los tramos y cubetas de todos los huertos y las
-- líneas de precio por variedad (pieceLines.rate). Con «Payroll reads pay weeks»
-- (can_read_company_payroll(), 20261012040000) también la leía el manager por
-- la API, y con ella lo pagado y los precios de los otros huertos.
--
-- Ahora la leen solo admin, payroll_admin y hr_admin (is_role exige cuenta
-- activa y 2FA). El manager ve la semana cerrada a través de calculate-payroll,
-- que lee la foto con la service role y le devuelve solo la parte de su huerto
-- (_shared/payroll-orchard.ts). Escritura: sin cambios (solo close-pay-week,
-- con la service role). is_pay_day_closed() es SECURITY DEFINER: no cambia.
--
-- Función envuelta en (SELECT ...) (20261021000100_rls_initplan).
-- =============================================================================

DROP POLICY IF EXISTS "Payroll reads pay weeks" ON public.pay_weeks;
CREATE POLICY "Payroll reads pay weeks" ON public.pay_weeks
    FOR SELECT TO authenticated
    USING ((SELECT public.is_role(ARRAY['admin', 'payroll_admin', 'hr_admin'])));
