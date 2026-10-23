/**
 * Lógica pura de Logística (sin servicios: los tests de pantalla mockean el servicio).
 * @module components/views/logistics/logisticsLogic
 */
import type { Tractor, VehicleType } from '@/services/logistics-dept.service';

export type TransportVehicleFilter = VehicleType | 'all' | 'not_forklift';

/**
 * Vehículos que se ofrecen para un transporte: activos o parados, del tipo
 * elegido. Por defecto sin carretillas (mueven bins dentro de la zona).
 */
export function vehiclesForTransport(tractors: Tractor[], type: TransportVehicleFilter): Tractor[] {
    return tractors.filter(tr =>
        (tr.status === 'active' || tr.status === 'idle')
        && (type === 'all' || (type === 'not_forklift' ? tr.type !== 'forklift' : tr.type === type))
    );
}
