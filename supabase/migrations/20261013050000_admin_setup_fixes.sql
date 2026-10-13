-- =============================================================================
-- Admin: crear huertos y desactivar usuarios
--
-- 1) "Nuevo huerto" (setup_orchard_atomic) fallaba siempre: metía texto en
--    day_setups.date (tipo date) y start_time (tipo time). Además cualquiera
--    con sesión podía llamarla (SECURITY DEFINER sin comprobar rol) y no
--    creaba la configuración de pago del huerto (harvest_settings).
--    Ahora: solo admin; crea huerto + ajustes de pago + día inicial.
-- 2) Desactivar / reactivar usuario (manage-admin) escribía columnas que no
--    existían en public.users.
-- =============================================================================

-- La firma cambia (variedad y hora de fin): se elimina la anterior
DROP FUNCTION IF EXISTS public.setup_orchard_atomic(text, text, text, integer, text, numeric);

CREATE OR REPLACE FUNCTION public.setup_orchard_atomic(
    p_code text,
    p_name text,
    p_location text DEFAULT NULL,
    p_total_rows integer DEFAULT 0,
    p_start_time text DEFAULT '07:00',
    p_piece_rate numeric DEFAULT 6.5,
    p_variety text DEFAULT NULL,
    p_min_wage numeric DEFAULT 23.95
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_orchard RECORD;
    v_today date := (now() AT TIME ZONE 'Pacific/Auckland')::date;
BEGIN
    IF NOT public.is_role(ARRAY['admin']) THEN
        RAISE EXCEPTION 'Only an admin can create orchards' USING ERRCODE = '42501';
    END IF;
    IF p_min_wage < 23.95 THEN
        RAISE EXCEPTION 'Minimum wage cannot be below the NZ legal minimum (23.95)' USING ERRCODE = '23514';
    END IF;

    INSERT INTO orchards (code, name, location, total_rows)
    VALUES (NULLIF(trim(p_code), ''), trim(p_name), NULLIF(trim(p_location), ''), COALESCE(p_total_rows, 0))
    RETURNING * INTO v_orchard;

    -- Configuración de pago del huerto (sin ella la nómina usaba valores sueltos)
    INSERT INTO harvest_settings (orchard_id, piece_rate, min_wage_rate, variety, shift_start_time)
    VALUES (v_orchard.id, p_piece_rate, p_min_wage, NULLIF(trim(p_variety), ''), COALESCE(p_start_time, '07:00'))
    ON CONFLICT (orchard_id) DO NOTHING;

    INSERT INTO day_setups (orchard_id, date, start_time, piece_rate, min_wage_rate, variety, created_by)
    VALUES (v_orchard.id, v_today, COALESCE(p_start_time, '07:00')::time, p_piece_rate, p_min_wage,
            NULLIF(trim(p_variety), ''), auth.uid());

    RETURN json_build_object('id', v_orchard.id, 'code', v_orchard.code, 'name', v_orchard.name);
END;
$$;

REVOKE ALL ON FUNCTION public.setup_orchard_atomic(text, text, text, integer, text, numeric, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.setup_orchard_atomic(text, text, text, integer, text, numeric, text, numeric) TO authenticated;

-- 2) Desactivar / reactivar usuarios
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
    ADD COLUMN IF NOT EXISTS deactivated_by uuid,
    ADD COLUMN IF NOT EXISTS reactivated_at timestamptz,
    ADD COLUMN IF NOT EXISTS reactivated_by uuid;
