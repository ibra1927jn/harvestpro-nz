-- =============================================================================
-- B6 (auditoría 2026-10-23): flota y bins de Logística
--
-- 1) Asignar un vehículo a una solicitud de transporte actualiza su carga y
--    estado: bins_loaded = bins de sus solicitudes asignadas / en curso (tope
--    max_capacity), load_status empty/partial/full y status active mientras
--    lleva algo, idle cuando termina (mantenimiento y fuera de servicio no se
--    tocan). Se recalcula (no se suma) en cada cambio, así un reintento de la
--    cola sin conexión no cuenta dos veces. Trigger SECURITY DEFINER: el runner
--    que cancela su propia solicitud no puede escribir fleet_vehicles.
-- 2) bins en la publicación de realtime: el runner ve al momento el bin que
--    Logística pone vacío / lleno / recogido o da de alta / baja.
-- Las altas y bajas de vehículos y bins ya las permiten las políticas
-- existentes («Manage fleet»: logística / manager / admin del huerto; bins:
-- alta cualquier miembro del huerto, cambios runner / logística / manager / TL);
-- la baja es deleted_at (no se borran filas).
-- =============================================================================

-- 1) Carga del vehículo ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_vehicle_load(p_vehicle uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bins integer;
BEGIN
    IF p_vehicle IS NULL THEN
        RETURN;
    END IF;
    SELECT COALESCE(sum(bins_count), 0)::integer INTO v_bins
    FROM public.transport_requests
    WHERE assigned_vehicle = p_vehicle AND status IN ('assigned', 'in_progress');

    UPDATE public.fleet_vehicles fv SET
        bins_loaded = LEAST(v_bins, COALESCE(fv.max_capacity, v_bins)),
        load_status = CASE
            WHEN v_bins = 0 THEN 'empty'
            WHEN fv.max_capacity IS NOT NULL AND v_bins >= fv.max_capacity THEN 'full'
            ELSE 'partial' END,
        status = CASE
            WHEN fv.status IN ('maintenance', 'offline') THEN fv.status
            WHEN v_bins > 0 THEN 'active'
            ELSE 'idle' END,
        updated_at = now()
    WHERE fv.id = p_vehicle
      AND (fv.bins_loaded IS DISTINCT FROM LEAST(v_bins, COALESCE(fv.max_capacity, v_bins))
           OR fv.status NOT IN ('maintenance', 'offline') AND fv.status IS DISTINCT FROM CASE WHEN v_bins > 0 THEN 'active' ELSE 'idle' END
           OR fv.load_status IS DISTINCT FROM CASE
                WHEN v_bins = 0 THEN 'empty'
                WHEN fv.max_capacity IS NOT NULL AND v_bins >= fv.max_capacity THEN 'full'
                ELSE 'partial' END);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_vehicle_load(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_transport_vehicle_load()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        PERFORM public.sync_vehicle_load(NEW.assigned_vehicle);
    END IF;
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.assigned_vehicle IS DISTINCT FROM
        (CASE WHEN TG_OP = 'UPDATE' THEN NEW.assigned_vehicle ELSE NULL END) THEN
        PERFORM public.sync_vehicle_load(OLD.assigned_vehicle);
    END IF;
    RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.trg_transport_vehicle_load() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_transport_vehicle_load ON public.transport_requests;
CREATE TRIGGER trg_transport_vehicle_load
    AFTER INSERT OR DELETE OR UPDATE OF assigned_vehicle, status, bins_count ON public.transport_requests
    FOR EACH ROW EXECUTE FUNCTION public.trg_transport_vehicle_load();

-- 2) Realtime de bins -------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bins') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.bins;
    END IF;
END;
$$;
