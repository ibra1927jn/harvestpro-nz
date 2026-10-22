-- =============================================================================
-- A2 (auditoría 2026-10-23): el team leader corregía fichajes de otros equipos
--
-- 1) Se borra "attendance_update_policy" (UPDATE para manager/team leader sin
--    filtro de huerto). Existía para que manage-attendance cerrara el turno
--    abierto en el huerto anterior al fichar en otro (20261013101000), pero la
--    Edge Function ya lo hace con la clave de servicio (cliente `admin` en
--    check_in), que no pasa por RLS: la política sobraba y dejaba a cualquier
--    manager o team leader cambiar fichajes de cualquier huerto.
--
-- 2) "Manage attendance" (alta, cambios y borrado de fichajes) añade la regla de
--    equipos del 16-10 (20261016000000_picker_team_rules): el team leader solo
--    toca fichajes de personas de SU equipo o sin equipo (puede coger gente sin
--    equipo). Manager y RRHH: su huerto. Admin: todo.
--    La LECTURA no cambia: "Read attendance" sigue dejando leer los fichajes del
--    huerto (QC y runner necesitan saber quién está fichado).
-- =============================================================================

DROP POLICY IF EXISTS "attendance_update_policy" ON public.daily_attendance;

-- ¿La persona es del equipo del team leader con sesión, o no tiene equipo?
-- SECURITY DEFINER: mira pickers sin pasar por su RLS (una función por fila no
-- se puede envolver en SELECT; es una búsqueda por clave primaria).
CREATE OR REPLACE FUNCTION public.team_leader_can_touch_picker(p_picker_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.pickers p
        WHERE p.id = p_picker_id
          AND (p.team_leader_id = auth.uid() OR p.team_leader_id IS NULL)
    );
$$;

COMMENT ON FUNCTION public.team_leader_can_touch_picker(uuid) IS
    'Regla de equipos: la persona es del equipo del team leader con sesión o no tiene equipo.';

REVOKE ALL ON FUNCTION public.team_leader_can_touch_picker(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_leader_can_touch_picker(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Manage attendance" ON public.daily_attendance;
CREATE POLICY "Manage attendance" ON public.daily_attendance FOR ALL TO authenticated
    USING (
        (SELECT public.is_role(ARRAY['admin']))
        OR (
            orchard_id = (SELECT public.get_my_orchard_id())
            AND (
                (SELECT public.is_role(ARRAY['manager', 'hr_admin']))
                OR ((SELECT public.is_role(ARRAY['team_leader'])) AND public.team_leader_can_touch_picker(picker_id))
            )
        )
    )
    WITH CHECK (
        (SELECT public.is_role(ARRAY['admin']))
        OR (
            orchard_id = (SELECT public.get_my_orchard_id())
            AND (
                (SELECT public.is_role(ARRAY['manager', 'hr_admin']))
                OR ((SELECT public.is_role(ARRAY['team_leader'])) AND public.team_leader_can_touch_picker(picker_id))
            )
        )
    );
