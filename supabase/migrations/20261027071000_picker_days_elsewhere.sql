-- =============================================================================
-- picker_days_elsewhere: días en que una persona trabajó también en OTRO huerto
--
-- Desde 20261027070000 el manager solo lee los fichajes y cubetas de su huerto.
-- El historial de una persona (cajón del picker) calcula horas y pago de cada
-- día con lo que puede leer; un día partido entre huertos saldría con el pago
-- de solo una parte (el complemento al mínimo es del día entero). Con esta
-- función sabe QUÉ días fueron así y pone «—» en el pago de esos días.
--
-- Solo fechas: ni el huerto, ni horas, ni cubetas de allí. Para la gente de tu
-- huerto (su plantilla o quien ha trabajado en él en el periodo), como mucho
-- 62 días atrás.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.picker_days_elsewhere(p_picker_id uuid, p_since date)
RETURNS TABLE (day date)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_orchard uuid := public.get_my_orchard_id();
    v_today date := (now() AT TIME ZONE 'Pacific/Auckland')::date;
    v_since date := GREATEST(COALESCE(p_since, v_today), v_today - 62);
BEGIN
    IF auth.uid() IS NULL OR NOT public.is_active_member() OR NOT public.mfa_satisfied() THEN
        RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
    IF v_orchard IS NULL THEN
        RETURN;
    END IF;
    -- Solo gente de mi huerto
    IF NOT (
        EXISTS (SELECT 1 FROM public.pickers p WHERE p.id = p_picker_id AND p.orchard_id = v_orchard)
        OR EXISTS (SELECT 1 FROM public.daily_attendance a
                   WHERE a.picker_id = p_picker_id AND a.orchard_id = v_orchard
                     AND a.deleted_at IS NULL AND a.date >= v_since)
        OR EXISTS (SELECT 1 FROM public.bucket_records b
                   WHERE b.picker_id = p_picker_id AND b.orchard_id = v_orchard
                     AND b.deleted_at IS NULL AND b.scanned_at >= (v_since::timestamp AT TIME ZONE 'Pacific/Auckland'))
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT DISTINCT x.d FROM (
        SELECT a.date AS d
        FROM public.daily_attendance a
        WHERE a.picker_id = p_picker_id AND a.orchard_id IS DISTINCT FROM v_orchard
          AND a.deleted_at IS NULL AND a.check_in IS NOT NULL AND a.date >= v_since
        UNION
        SELECT (b.scanned_at AT TIME ZONE 'Pacific/Auckland')::date
        FROM public.bucket_records b
        WHERE b.picker_id = p_picker_id AND b.orchard_id IS DISTINCT FROM v_orchard
          AND b.deleted_at IS NULL AND b.scanned_at >= (v_since::timestamp AT TIME ZONE 'Pacific/Auckland')
    ) x
    ORDER BY 1;
END;
$$;
COMMENT ON FUNCTION public.picker_days_elsewhere(uuid, date) IS
    'Fechas (NZ, máx. 62 días) en que una persona de mi huerto trabajó también en otro huerto. Solo fechas: el historial pone «—» en el pago de esos días (el manager no lee los fichajes de otro huerto, 20261027070000).';
REVOKE ALL ON FUNCTION public.picker_days_elsewhere(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.picker_days_elsewhere(uuid, date) TO authenticated, service_role;
