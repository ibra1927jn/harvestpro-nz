-- =============================================================================
-- Ausencias pedidas por el team leader: solo para SU equipo (auditoría 23-10, C)
--
-- Decisión del dueño (23-10): el team leader pide ausencias para su equipo
-- desde el móvil y RRHH las aprueba. La política "Request leave"
-- (20261022041000_leave_requests) dejaba al team leader pedirlas para
-- cualquier persona de su huerto. Ahora, como el resto de reglas de equipos
-- (20261016000000_picker_team_rules), solo para pickers cuyo team leader es él
-- (pickers.team_leader_id = auth.uid()). El manager sigue pudiendo pedirlas
-- para todo su huerto; RRHH y admin, como antes, para cualquiera y en
-- cualquier estado. El team leader y el manager, siempre como "requested".
-- Funciones de rol envueltas en (SELECT ...) (20261021000100_rls_initplan).
-- =============================================================================

DROP POLICY IF EXISTS "Request leave" ON public.leave_requests;
CREATE POLICY "Request leave" ON public.leave_requests
    FOR INSERT TO authenticated
    WITH CHECK (
        requested_by = (SELECT auth.uid())
        AND deleted_at IS NULL
        AND (
            (SELECT public.is_role(ARRAY['hr_admin', 'admin']))
            OR (
                (SELECT public.is_role(ARRAY['manager']))
                AND orchard_id = (SELECT public.get_my_orchard_id())
                AND status = 'requested'
            )
            OR (
                (SELECT public.is_role(ARRAY['team_leader']))
                AND orchard_id = (SELECT public.get_my_orchard_id())
                AND status = 'requested'
                AND EXISTS (
                    SELECT 1 FROM public.pickers p
                    WHERE p.id = leave_requests.picker_id
                      AND p.team_leader_id = (SELECT auth.uid())
                      AND p.deleted_at IS NULL
                )
            )
        )
    );
