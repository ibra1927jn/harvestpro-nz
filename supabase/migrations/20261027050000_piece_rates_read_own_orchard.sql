-- =============================================================================
-- Precio por cubeta: cada uno lee solo el de SU huerto (decisión del dueño, 2026-10-27)
--
-- Antes (20261023020000_piece_rates_by_day): cualquier miembro activo leía los
-- precios de TODOS los huertos de la empresa (piece_rates, variety_rates), y
-- el manager leía además harvest_settings de todos (can_read_company_payroll).
--
-- Ahora, en todos los sitios donde vive el precio por cubeta:
--   - piece_rates      (precio por día, huerto y variedad; el que usa la nómina)
--   - variety_rates    (obsoleta, solo consulta)
--   - harvest_settings (piece_rate: el precio guardado, respaldo del cálculo)
--   - day_setups       (piece_rate del día)
-- la lectura es:
--   - cualquier miembro activo (manager, team leader, runner, QC, logística o
--     cuenta de picker): solo las filas de SU huerto (get_my_orchard_id() es
--     NULL si la cuenta está de baja: no ve nada);
--   - admin, hr_admin y payroll_admin (con 2FA: is_role lo exige): las de
--     todos los huertos.
-- variety_rates sin huerto (precio de la empresa, obsoleto): solo esos tres roles.
--
-- La escritura no cambia (manager de su huerto y admin; "Managers set piece
-- rates", "Managers manage variety rates", "Manage settings", "Manage day
-- setups"). Ojo: esas políticas son FOR ALL y por tanto también dan lectura,
-- pero solo del propio huerto (manager) o a admin, así que no abren nada.
--
-- La nómina de la empresa necesita el precio de cada huerto aunque la pida un
-- manager (la gente rota entre huertos y el complemento al mínimo se calcula con
-- el día entero): calculate-payroll y check-compliance cargan los precios con
-- la service role tras comprobar el rol (_shared/piece-rates.ts, rates-client.ts);
-- close-pay-week ya usaba la service role.
--
-- Funciones envueltas en (SELECT ...) (20261021000100_rls_initplan).
-- =============================================================================

-- ── piece_rates ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Members read piece rates" ON public.piece_rates;
DROP POLICY IF EXISTS "Read piece rates" ON public.piece_rates;
CREATE POLICY "Read piece rates" ON public.piece_rates
    FOR SELECT TO authenticated
    USING (
        orchard_id = (SELECT public.get_my_orchard_id())
        OR (SELECT public.is_role(ARRAY['admin', 'hr_admin', 'payroll_admin']))
    );

-- ── variety_rates (obsoleta) ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Members read variety rates" ON public.variety_rates;
DROP POLICY IF EXISTS "Read variety rates" ON public.variety_rates;
CREATE POLICY "Read variety rates" ON public.variety_rates
    FOR SELECT TO authenticated
    USING (
        orchard_id = (SELECT public.get_my_orchard_id())
        OR (SELECT public.is_role(ARRAY['admin', 'hr_admin', 'payroll_admin']))
    );

-- ── harvest_settings ────────────────────────────────────────────────────────
-- El manager ya no lee la de otros huertos (lleva el precio guardado)
DROP POLICY IF EXISTS "Read settings" ON public.harvest_settings;
CREATE POLICY "Read settings" ON public.harvest_settings
    FOR SELECT TO authenticated
    USING (
        orchard_id = (SELECT public.get_my_orchard_id())
        OR (SELECT public.is_role(ARRAY['admin', 'hr_admin', 'payroll_admin']))
    );

-- ── day_setups ──────────────────────────────────────────────────────────────
-- Seguía igual para su huerto ("Read day setups"); RRHH y nómina leen ahora la
-- de todos los huertos (admin ya la leía por "Manage day setups")
DROP POLICY IF EXISTS "Company roles read day setups" ON public.day_setups;
CREATE POLICY "Company roles read day setups" ON public.day_setups
    FOR SELECT TO authenticated
    USING ((SELECT public.is_role(ARRAY['admin', 'hr_admin', 'payroll_admin'])));

COMMENT ON TABLE public.piece_rates IS
  'Precio por cubeta por huerto, variedad (NULL = general del huerto) y día desde el que vale. El precio de un día es la fila con la mayor effective_date <= ese día; cambiarlo hoy no toca los días anteriores. Lectura: el propio huerto; admin, hr_admin y payroll_admin todos (20261027050000).';
