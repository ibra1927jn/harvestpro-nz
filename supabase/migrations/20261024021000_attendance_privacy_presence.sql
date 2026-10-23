-- =============================================================================
-- Privacidad de fichajes (ronda 24-10, encargo B.2)
--
-- Antes cualquiera del huerto (runner, QC, logística) leía todos los fichajes:
-- entradas, salidas, horas. Solo necesitan saber quién está fichado.
--
-- 1. Lectura de daily_attendance:
--      · admin, manager y RRHH de su huerto, y team leader de su equipo / gente
--        sin equipo de su huerto: «Manage attendance» (ALL, ya existía);
--      · admin, manager, nómina y RRHH de toda la empresa: «Payroll reads
--        attendance of all orchards» (ya existía);
--      · el team leader, su equipo también en otro huerto (rotan): nueva;
--      · cada uno lo suyo (pickers.id = users.id para la gente de campo): nueva.
--    Fuera: «Read attendance» (todo el huerto) y «attendance_view_policy».
--    Realtime respeta la RLS: runner, QC y logística dejan de recibir fichajes.
--
-- 2. presence_today(huerto): para todos los del huerto, por persona: si está
--    fichada aquí ahora, desde cuándo, si está en descanso, de permiso, si ya
--    salió hoy (y a qué hora) o si está ahora en otro huerto. Sin horas ni pago.
-- =============================================================================

-- ¿Es esta persona de mi equipo? (en cualquier huerto)
CREATE OR REPLACE FUNCTION public.is_my_team_member(p_picker_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.pickers p
        WHERE p.id = p_picker_id AND p.team_leader_id = auth.uid()
    );
$$;
REVOKE ALL ON FUNCTION public.is_my_team_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_my_team_member(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Read attendance" ON public.daily_attendance;
DROP POLICY IF EXISTS "attendance_view_policy" ON public.daily_attendance;

DROP POLICY IF EXISTS "Read own attendance" ON public.daily_attendance;
CREATE POLICY "Read own attendance" ON public.daily_attendance
    FOR SELECT TO authenticated
    USING (picker_id = (SELECT auth.uid()) AND (SELECT public.is_active_member()));

DROP POLICY IF EXISTS "Team leader reads own team attendance" ON public.daily_attendance;
CREATE POLICY "Team leader reads own team attendance" ON public.daily_attendance
    FOR SELECT TO authenticated
    USING ((SELECT public.is_role(ARRAY['team_leader'])) AND public.is_my_team_member(picker_id));

-- ── presence_today ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.presence_today(p_orchard_id uuid)
RETURNS TABLE (
    picker_id uuid,
    present boolean,
    since timestamptz,
    on_break boolean,
    on_leave boolean,
    checked_in_today boolean,
    left_at timestamptz,
    elsewhere_orchard_id uuid,
    elsewhere_orchard_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today date := (now() AT TIME ZONE 'Pacific/Auckland')::date;
BEGIN
    IF auth.uid() IS NULL OR NOT public.is_active_member() OR NOT public.mfa_satisfied() THEN
        RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
    -- Su huerto; admin y la oficina de la empresa, cualquiera
    IF NOT (p_orchard_id = public.get_my_orchard_id()
            OR public.is_role(ARRAY['admin'])
            OR public.can_read_company_payroll()) THEN
        RAISE EXCEPTION 'Not allowed to see presence of this orchard' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH shifts AS (
        SELECT a.picker_id, a.orchard_id, a.check_in, a.check_out, a.break_start, a.break_end
        FROM public.daily_attendance a
        WHERE a.date = v_today AND a.deleted_at IS NULL AND a.check_in IS NOT NULL
    ),
    here AS (
        SELECT s.picker_id,
               bool_or(s.check_out IS NULL) AS is_open,
               max(s.check_in) FILTER (WHERE s.check_out IS NULL) AS open_since,
               bool_or(s.check_out IS NULL AND s.break_start IS NOT NULL AND s.break_start <= now()
                       AND (s.break_end IS NULL OR now() < s.break_end)) AS in_break,
               max(s.check_out) AS last_out
        FROM shifts s
        WHERE s.orchard_id = p_orchard_id
        GROUP BY s.picker_id
    ),
    away AS (
        SELECT DISTINCT ON (s.picker_id) s.picker_id, s.orchard_id, o.name
        FROM shifts s JOIN public.orchards o ON o.id = s.orchard_id
        WHERE s.orchard_id <> p_orchard_id AND s.check_out IS NULL
        ORDER BY s.picker_id, s.check_in DESC
    ),
    leave AS (
        SELECT DISTINCT l.picker_id
        FROM public.leave_requests l
        WHERE l.status = 'approved' AND l.deleted_at IS NULL
          AND v_today BETWEEN l.start_date AND l.end_date
    )
    SELECT p.id,
           COALESCE(h.is_open, false),
           h.open_since,
           COALESCE(h.in_break, false),
           lv.picker_id IS NOT NULL,
           h.picker_id IS NOT NULL,
           CASE WHEN COALESCE(h.is_open, false) THEN NULL ELSE h.last_out END,
           aw.orchard_id,
           aw.name
    FROM public.pickers p
    LEFT JOIN here h ON h.picker_id = p.id
    LEFT JOIN away aw ON aw.picker_id = p.id
    LEFT JOIN leave lv ON lv.picker_id = p.id
    WHERE p.deleted_at IS NULL
      AND (h.picker_id IS NOT NULL OR aw.picker_id IS NOT NULL OR lv.picker_id IS NOT NULL);
END;
$$;
COMMENT ON FUNCTION public.presence_today(uuid) IS
    'Quién está fichado hoy en el huerto (desde cuándo, descanso, permiso, salió, en otro huerto). Sin horas ni pago: lo usan runner, QC, logística y el team leader para la gente fuera de su equipo.';
REVOKE ALL ON FUNCTION public.presence_today(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.presence_today(uuid) TO authenticated, service_role;
