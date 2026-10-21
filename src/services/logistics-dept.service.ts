/**
 * Logistics Department Service
 * Handles fleet management, bin tracking, transport requests, and route planning
 *
 * Architecture:
 *   READS  → Via domain repositories (logistics.repository)
 *   WRITES → Via syncService.addToQueue() for offline-first
 *   Conflict Resolution: Last-write-wins (documented decision)
 */
import { safeUUID } from '@/utils/uuid';
import { syncService } from '@/services/sync.service';
import { logger } from '@/utils/logger';
import { logisticsRepository } from '@/repositories/logistics.repository';

// ── Types ──────────────────────────────────────
/** Tipo de vehículo (fleet_vehicles.type); decide el papel del runner que lo lleva */
export type VehicleType = 'tractor' | 'forklift' | 'truck' | 'ute';

export interface Tractor {
    id: string;
    name: string;
    /** tractor por defecto (vehículos anteriores a la columna) */
    type: VehicleType;
    registration?: string;
    zone: string;
    driver_id?: string;
    driver_name: string;
    status: 'active' | 'idle' | 'maintenance' | 'offline';
    load_status: 'empty' | 'partial' | 'full';
    bins_loaded: number;
    max_capacity: number;
    fuel_level?: number;
    wof_expiry?: string;
    last_update: string;
}

export interface BinInventory {
    id: string;
    bin_code: string;
    status: 'empty' | 'filling' | 'full' | 'in_transit' | 'at_warehouse';
    zone: string;
    fill_percentage: number;
    assigned_tractor?: string;
    last_scan: string;
    variety?: string;
}

export interface TransportRequest {
    id: string;
    requested_by: string;
    requester_name: string;
    zone: string;
    bins_count: number;
    priority: 'normal' | 'high' | 'urgent';
    status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
    assigned_tractor?: string;
    assigned_by?: string;
    created_at: string;
    completed_at?: string;
    notes?: string;
    updated_at?: string;
}

export interface TransportLog {
    id: string;
    tractor_id: string;
    tractor_name: string;
    driver_name: string;
    from_zone: string;
    to_zone: string;
    bins_count: number;
    started_at: string;
    completed_at: string;
    duration_minutes: number;
}

export interface LogisticsSummary {
    fullBins: number;
    emptyBins: number;
    activeTractors: number;
    pendingRequests: number;
    binsInTransit: number;
}

// ── Service Functions ──────────────────────────

export async function fetchLogisticsSummary(orchardId?: string): Promise<LogisticsSummary> {
    try {
        const bins = await logisticsRepository.getBinStatuses(orchardId);
        const fullBins = bins.filter(b => b.status === 'full').length;
        const emptyBins = bins.filter(b => b.status === 'empty').length;
        const binsInTransit = bins.filter(b => b.status === 'collected').length;

        const fleet = await logisticsRepository.getFleetStatuses(orchardId);
        const activeTractors = fleet.filter(f => f.status === 'active').length;

        const requests = await logisticsRepository.getPendingRequestStatuses(orchardId);
        const pendingRequests = requests.length;

        return { fullBins, emptyBins, activeTractors, pendingRequests, binsInTransit };
    } catch (error) {
        logger.error('[Logistics] Error fetching summary:', error);
        return { fullBins: 0, emptyBins: 0, activeTractors: 0, pendingRequests: 0, binsInTransit: 0 };
    }
}

const VEHICLE_TYPES: readonly VehicleType[] = ['tractor', 'forklift', 'truck', 'ute'];

export function vehicleTypeOf(raw: unknown): VehicleType {
    return typeof raw === 'string' && (VEHICLE_TYPES as readonly string[]).includes(raw) ? raw as VehicleType : 'tractor';
}

export async function fetchFleet(orchardId?: string): Promise<Tractor[]> {
    try {
        const data = await logisticsRepository.getFleetAll(orchardId);
        return data.map(v => ({
            id: v.id,
            name: v.name,
            type: vehicleTypeOf(v.type),
            registration: v.registration || undefined,
            zone: v.zone || 'Unassigned',
            driver_id: v.driver_id || undefined,
            driver_name: v.driver_name || 'No driver',
            status: v.status,
            load_status: v.load_status,
            bins_loaded: v.bins_loaded,
            max_capacity: v.max_capacity,
            fuel_level: v.fuel_level || undefined,
            wof_expiry: v.wof_expiry || undefined,
            last_update: v.updated_at,
        }));
    } catch (error) {
        logger.error('[Logistics] Error fetching fleet:', error);
        return [];
    }
}

export async function fetchBinInventory(orchardId?: string): Promise<BinInventory[]> {
    try {
        const data = await logisticsRepository.getBinInventory(orchardId);
        return data.map(bin => ({
            id: bin.id,
            bin_code: bin.bin_code || bin.id.slice(0, 6),
            status: mapBinStatus(bin.status),
            zone: (bin.location as { zone?: string })?.zone || 'A1',
            fill_percentage: calculateFillPercentage(bin.status),
            assigned_tractor: undefined,
            last_scan: bin.filled_at || bin.created_at || new Date().toISOString(),
            variety: bin.variety,
        }));
    } catch (error) {
        logger.error('[Logistics] Error fetching bin inventory:', error);
        return [];
    }
}

function mapBinStatus(dbStatus: string): BinInventory['status'] {
    switch (dbStatus) {
        case 'empty': return 'empty';
        case 'partial': return 'filling';
        case 'full': return 'full';
        case 'collected': return 'in_transit';
        default: return 'empty';
    }
}

function calculateFillPercentage(status: string): number {
    switch (status) {
        case 'empty': return 0;
        case 'partial': return 50;
        case 'full': return 100;
        case 'collected': return 100;
        default: return 0;
    }
}

export async function fetchTransportRequests(orchardId?: string): Promise<TransportRequest[]> {
    try {
        const data = await logisticsRepository.getActiveRequests(orchardId);
        return data.map(mapTransportRequest);
    } catch (error) {
        logger.error('[Logistics] Error fetching transport requests:', error);
        return [];
    }
}

export async function fetchTransportHistory(orchardId?: string): Promise<TransportLog[]> {
    try {
        const data = await logisticsRepository.getCompletedRequests(orchardId);
        const vehicleIds = [...new Set(data.map(r => r.assigned_vehicle).filter(Boolean))] as string[];
        const vehicleNames = await logisticsRepository.getVehicleNames(vehicleIds);

        return data
            .filter(r => r.completed_at)
            .map(r => {
                const started = new Date(r.created_at).getTime();
                const completed = new Date(r.completed_at!).getTime();
                return {
                    id: r.id,
                    tractor_id: r.assigned_vehicle || '',
                    tractor_name: vehicleNames[r.assigned_vehicle || ''] || 'Unknown',
                    driver_name: r.requester_name,
                    from_zone: r.zone,
                    to_zone: 'Warehouse',
                    bins_count: r.bins_count,
                    started_at: r.created_at,
                    completed_at: r.completed_at!,
                    duration_minutes: Math.round((completed - started) / 60000),
                };
            });
    } catch (error) {
        logger.error('[Logistics] Error fetching transport history:', error);
        return [];
    }
}

export async function createTransportRequest(
    request: Omit<TransportRequest, 'id' | 'status' | 'created_at'> & { orchard_id: string }
): Promise<string> {
    // Id del móvil desde el principio: si la respuesta se pierde y la cola lo
    // reintenta, el servidor ya la tiene y no se crea una segunda petición
    return syncService.addToQueue('TRANSPORT', { action: 'create', ...request, id: safeUUID() });
}

export async function assignVehicleToRequest(
    requestId: string, vehicleId: string, assignedBy: string, currentUpdatedAt?: string
): Promise<string> {
    return syncService.addToQueue('TRANSPORT', { action: 'assign', requestId, vehicleId, assignedBy }, currentUpdatedAt);
}

export async function completeTransportRequest(requestId: string, currentUpdatedAt?: string): Promise<string> {
    return syncService.addToQueue('TRANSPORT', { action: 'complete', requestId }, currentUpdatedAt);
}

export async function cancelTransportRequest(requestId: string, currentUpdatedAt?: string): Promise<string> {
    return syncService.addToQueue('TRANSPORT', { action: 'cancel', requestId }, currentUpdatedAt);
}

function mapTransportRequest(row: Record<string, unknown>): TransportRequest {
    return {
        id: row.id as string,
        requested_by: row.requested_by as string,
        requester_name: row.requester_name as string,
        zone: row.zone as string,
        bins_count: row.bins_count as number,
        priority: row.priority as TransportRequest['priority'],
        status: row.status as TransportRequest['status'],
        assigned_tractor: (row.assigned_vehicle as string) || undefined,
        assigned_by: (row.assigned_by as string) || undefined,
        created_at: row.created_at as string,
        completed_at: (row.completed_at as string) || undefined,
        notes: (row.notes as string) || undefined,
        updated_at: (row.updated_at as string) || undefined,
    };
}
