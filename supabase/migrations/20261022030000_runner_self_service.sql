-- =============================================================================
-- Runner: autoservicio (revisión por roles 2026-10-21, puntos 12 y 13)
--
-- 1) Tipo de vehículo. fleet_vehicles no distinguía tractor de forklift: para
--    saber qué está haciendo cada runner (driver / forklift / a pie) hace falta
--    el tipo del vehículo que lleva. Logística lo rellena en Flota.
-- 2) Un runner puede cancelar SU solicitud de transporte mientras esté
--    pendiente. Hasta ahora solo Logística/manager podían tocar solicitudes
--    (política «Manage transport requests»), así que el runner que pedía
--    transporte por error no podía deshacerlo.
-- =============================================================================

-- 1) Tipo de vehículo --------------------------------------------------------
ALTER TABLE public.fleet_vehicles
    ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'tractor'
    CHECK (type IN ('tractor', 'forklift', 'truck', 'ute'));
COMMENT ON COLUMN public.fleet_vehicles.type IS
    'tractor | forklift | truck | ute. Decide el papel del runner que lo lleva (driver / forklift).';

-- 2) El solicitante cancela su propia solicitud pendiente -----------------------
DROP POLICY IF EXISTS "Requester cancels own pending request" ON public.transport_requests;
CREATE POLICY "Requester cancels own pending request" ON public.transport_requests
    FOR UPDATE TO authenticated
    USING (
        requested_by = (SELECT auth.uid())
        AND status = 'pending'
        AND orchard_id = (SELECT get_my_orchard_id())
    )
    WITH CHECK (
        requested_by = (SELECT auth.uid())
        AND status = 'cancelled'
        AND orchard_id = (SELECT get_my_orchard_id())
    );
COMMENT ON POLICY "Requester cancels own pending request" ON public.transport_requests IS
    'Quien pidió el transporte puede pasarlo de pending a cancelled (y nada más).';
