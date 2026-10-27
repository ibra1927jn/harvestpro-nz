-- =============================================================================
-- Fichajes y cubetas: el manager solo los de SU huerto (decisión del dueño,
-- 2026-10-27)
--
-- Hasta ahora el manager leía los fichajes (daily_attendance) y las cubetas
-- (bucket_records) de TODOS los huertos: «Payroll reads … of all orchards»
-- usaba can_read_company_payroll(), que incluye al manager, y
-- «bucket_records_view_policy» daba todas las cubetas a is_manager(). Lo
-- mismo por presence_today(otro huerto) (entrada y salida de hoy) y por la
-- auditoría (old_values/new_values de cada fichaje).
--
-- Ahora:
--   · admin, nómina y RRHH: todos los huertos (sin cambios);
--   · manager: solo su huerto, también si la persona trabajó parte del día en
--     otro. El reparto de horas y el complemento de quien rota los calcula el
--     servidor (calculate-payroll / check-compliance con service role después
--     de comprobar el rol) y solo devuelve la parte de su huerto;
--   · team leader: sin cambios en fichajes (su huerto según su equipo, y su
--     equipo también en otro huerto). Cubetas: su huerto y su equipo en otro
--     huerto (antes: las de cualquier persona de la plantilla de su huerto);
--   · runner, QC, logística: cubetas de su huerto (antes también las de su
--     plantilla escaneadas en otro huerto);
--   · cada uno, sus propias cubetas (antes llegaban por la plantilla).
--
-- La escritura no cambia.
-- =============================================================================

-- ── daily_attendance ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Payroll reads attendance of all orchards" ON public.daily_attendance;
DROP POLICY IF EXISTS "Company office reads attendance of all orchards" ON public.daily_attendance;
CREATE POLICY "Company office reads attendance of all orchards" ON public.daily_attendance
    FOR SELECT TO authenticated
    USING ((SELECT public.is_role(ARRAY['admin', 'payroll_admin', 'hr_admin'])));
-- El manager lee los de su huerto por «Manage attendance» (ALL, su huerto)

-- ── bucket_records ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Payroll reads buckets of all orchards" ON public.bucket_records;
DROP POLICY IF EXISTS "bucket_records_view_policy" ON public.bucket_records;

DROP POLICY IF EXISTS "Company office reads buckets of all orchards" ON public.bucket_records;
CREATE POLICY "Company office reads buckets of all orchards" ON public.bucket_records
    FOR SELECT TO authenticated
    USING ((SELECT public.is_role(ARRAY['admin', 'payroll_admin', 'hr_admin'])));

-- También las borradas de su huerto (corregir y deshacer devuelven la fila)
DROP POLICY IF EXISTS "Managers read bucket records of their orchard" ON public.bucket_records;
CREATE POLICY "Managers read bucket records of their orchard" ON public.bucket_records
    FOR SELECT TO authenticated
    USING ((SELECT public.is_role(ARRAY['manager'])) AND orchard_id = (SELECT public.get_my_orchard_id()));

DROP POLICY IF EXISTS "Team leader reads own team buckets" ON public.bucket_records;
CREATE POLICY "Team leader reads own team buckets" ON public.bucket_records
    FOR SELECT TO authenticated
    USING ((SELECT public.is_role(ARRAY['team_leader'])) AND public.is_my_team_member(picker_id));

DROP POLICY IF EXISTS "Read own bucket records" ON public.bucket_records;
CREATE POLICY "Read own bucket records" ON public.bucket_records
    FOR SELECT TO authenticated
    USING (picker_id = (SELECT auth.uid()) AND (SELECT public.is_active_member()));
-- Su huerto (cualquier rol): «Read bucket records» (sin cambios)

-- ── audit_logs ───────────────────────────────────────────────────────────────
-- El manager sigue leyendo la auditoría, pero de fichajes, cubetas y precios
-- solo las filas de su huerto (old_values/new_values llevan entrada, salida y
-- precio). Admin, todo.
DROP POLICY IF EXISTS "Managers and admins read audit logs" ON public.audit_logs;
CREATE POLICY "Managers and admins read audit logs" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (
        (SELECT public.is_role(ARRAY['admin']))
        OR (
            (SELECT public.is_role(ARRAY['manager']))
            AND (
                table_name NOT IN ('daily_attendance', 'bucket_records', 'piece_rates')
                OR (
                    (new_values IS NOT NULL OR old_values IS NOT NULL)
                    AND (new_values IS NULL OR new_values->>'orchard_id' = (SELECT public.get_my_orchard_id())::text)
                    AND (old_values IS NULL OR old_values->>'orchard_id' = (SELECT public.get_my_orchard_id())::text)
                )
            )
        )
    );

-- ── presence_today ───────────────────────────────────────────────────────────
-- Otro huerto: solo admin, nómina y RRHH (antes también el manager, por
-- can_read_company_payroll: veía entrada y salida de hoy en otro huerto).
-- Mismo cuerpo que 20261024022000.
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
    IF NOT (p_orchard_id = public.get_my_orchard_id()
            OR public.is_role(ARRAY['admin', 'payroll_admin', 'hr_admin'])) THEN
        RAISE EXCEPTION 'Not allowed to see presence of this orchard' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH shifts AS (
        -- Los de hoy y el turno de noche que empezó ayer y sigue abierto
        SELECT a.picker_id, a.orchard_id, a.check_in, a.check_out, a.break_start, a.break_end
        FROM public.daily_attendance a
        WHERE a.deleted_at IS NULL AND a.check_in IS NOT NULL
          AND (a.date = v_today OR (a.date = v_today - 1 AND a.check_out IS NULL))
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
    -- Gente de este huerto: su plantilla o quien ha fichado aquí hoy
    crew AS (
        SELECT p.id FROM public.pickers p
        WHERE p.deleted_at IS NULL AND p.orchard_id = p_orchard_id
        UNION
        SELECT h.picker_id FROM here h
    ),
    away AS (
        SELECT DISTINCT ON (s.picker_id) s.picker_id, s.orchard_id, o.name
        FROM shifts s
        JOIN crew c ON c.id = s.picker_id
        JOIN public.orchards o ON o.id = s.orchard_id
        WHERE s.orchard_id <> p_orchard_id AND s.check_out IS NULL
        ORDER BY s.picker_id, s.check_in DESC
    ),
    leave AS (
        SELECT DISTINCT l.picker_id
        FROM public.leave_requests l
        JOIN crew c ON c.id = l.picker_id
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
    JOIN crew c ON c.id = p.id
    LEFT JOIN here h ON h.picker_id = p.id
    LEFT JOIN away aw ON aw.picker_id = p.id
    LEFT JOIN leave lv ON lv.picker_id = p.id
    WHERE p.deleted_at IS NULL
      AND (h.picker_id IS NOT NULL OR aw.picker_id IS NOT NULL OR lv.picker_id IS NOT NULL);
END;
$$;
COMMENT ON FUNCTION public.presence_today(uuid) IS
    'Quién de este huerto está fichado hoy (desde cuándo, descanso, permiso, salió, en otro huerto; incluye el turno de noche abierto desde ayer). Sin horas ni pago. Otro huerto: solo admin, nómina y RRHH.';
REVOKE ALL ON FUNCTION public.presence_today(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.presence_today(uuid) TO authenticated, service_role;
