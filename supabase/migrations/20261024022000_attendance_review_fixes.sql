-- =============================================================================
-- Revisión del PR #86 (encargo B)
--
-- 1. Una corrección solo da por revisado un tramo largo si es POSTERIOR a la
--    salida (corrected_at >= check_out). Antes bastaba con corrected_at: el TL
--    corregía la entrada por la mañana, olvidaba la salida y un check_out normal
--    20–25 h después se aprobaba sin revisar. Igual que correctionCovers de
--    pay.ts / pay-rules.ts. El trigger de aprobación usa esta función.
-- 2. Desfase del reloj del móvil en bigint: un móvil desfasado más de ~25 días
--    no cabía en integer (22003) y la cubeta se rechazaba para siempre.
-- 3. presence_today: solo la gente de este huerto (plantilla del huerto o que
--    ha fichado aquí hoy). Antes el permiso y el «en otro huerto» salían para
--    personas de otros huertos. Un turno abierto que empezó ayer (noche) cuenta
--    como presente.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.shift_needs_review(
    p_check_in timestamptz,
    p_check_out timestamptz,
    p_corrected_at timestamptz
) RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
    SELECT p_check_in IS NOT NULL
       AND p_check_out IS NOT NULL
       AND p_check_out - p_check_in > interval '14 hours'
       AND (p_corrected_at IS NULL OR p_corrected_at < p_check_out);
$$;
COMMENT ON FUNCTION public.shift_needs_review(timestamptz, timestamptz, timestamptz) IS
    'Tramo cerrado de más de 14 h sin una corrección posterior a la salida (igual que shiftNeedsReview + correctionCovers de pay.ts).';

ALTER TABLE public.bucket_records ALTER COLUMN clock_skew_ms TYPE bigint;
ALTER TABLE public.daily_attendance
    ALTER COLUMN check_in_clock_skew_ms TYPE bigint,
    ALTER COLUMN check_out_clock_skew_ms TYPE bigint;

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
            OR public.is_role(ARRAY['admin'])
            OR public.can_read_company_payroll()) THEN
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
    'Quién de este huerto está fichado hoy (desde cuándo, descanso, permiso, salió, en otro huerto; incluye el turno de noche abierto desde ayer). Sin horas ni pago.';
REVOKE ALL ON FUNCTION public.presence_today(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.presence_today(uuid) TO authenticated, service_role;
