/**
 * Logistics Repository — Domain queries for bins, fleet_vehicles, transport_requests
 */
import { supabase } from '@/services/supabase';
import { fetchAllRows } from '@/utils/fetchAllRows';

/** Columnas de fleet_vehicles que se pueden dar de alta o editar desde Flota */
export interface VehicleWrite {
    name?: string;
    registration?: string | null;
    type?: 'tractor' | 'forklift' | 'truck' | 'ute';
    zone?: string | null;
    max_capacity?: number;
    driver_name?: string | null;
    status?: 'active' | 'idle' | 'maintenance' | 'offline';
    wof_expiry?: string | null;
    cof_expiry?: string | null;
    next_service_date?: string | null;
}

/** Estados de bins.status que Logística pone a mano */
export type BinDbStatus = 'empty' | 'partial' | 'full' | 'collected';

/** Sin filas cambiadas = la RLS no dejó (o ya no existe): se dice, no se calla */
function requireRows(data: unknown[] | null, what: string): void {
    if (!data || data.length === 0) throw new Error(`${what} not saved (no permission or not found)`);
}

export const logisticsRepository = {
    /* ── Bins ── */
    async getBinStatuses(orchardId?: string) {
        let query = supabase.from('bins').select('status').is('deleted_at', null);
        if (orchardId) query = query.eq('orchard_id', orchardId);
        const { data } = await query;
        return data || [];
    },

    /** Bins vivos del huerto (todos: por páginas, orden estable), los últimos primero */
    async getBinInventory(orchardId?: string) {
        return fetchAllRows<Record<string, unknown> & { id: string; status: string; bin_code: string | null; created_at: string | null; filled_at: string | null; variety?: string; location?: unknown }>((from, to) => {
            let query = supabase.from('bins').select('*').is('deleted_at', null);
            if (orchardId) query = query.eq('orchard_id', orchardId);
            return query.order('created_at', { ascending: false }).order('id').range(from, to);
        });
    },

    /** Logística cambia el estado de un bin (vacío / lleno / recogido) */
    async updateBinStatus(binId: string, status: BinDbStatus): Promise<void> {
        const changes: Record<string, unknown> = { status };
        if (status === 'empty') changes.filled_at = null;
        if (status === 'full') changes.filled_at = new Date().toISOString();
        const { data, error } = await supabase.from('bins').update(changes).eq('id', binId).select('id');
        if (error) throw error;
        requireRows(data, 'Bin');
    },

    async insertBin(bin: { orchard_id: string; bin_code: string; zone?: string | null }): Promise<void> {
        const { error } = await supabase.from('bins').insert([{
            orchard_id: bin.orchard_id,
            bin_code: bin.bin_code,
            status: 'empty',
            ...(bin.zone ? { location: { zone: bin.zone } } : {}),
        }]);
        if (error) throw error;
    },

    /** Baja de un bin: deleted_at (no se borra: hay cubetas que apuntan a él) */
    async retireBin(binId: string): Promise<void> {
        const { data, error } = await supabase.from('bins').update({ deleted_at: new Date().toISOString() }).eq('id', binId).select('id');
        if (error) throw error;
        requireRows(data, 'Bin');
    },

    /* ── Fleet ── */
    async getFleetStatuses(orchardId?: string) {
        let query = supabase.from('fleet_vehicles').select('status').is('deleted_at', null);
        if (orchardId) query = query.eq('orchard_id', orchardId);
        const { data } = await query;
        return data || [];
    },

    async getFleetAll(orchardId?: string) {
        let query = supabase.from('fleet_vehicles').select('*').is('deleted_at', null).order('name');
        if (orchardId) query = query.eq('orchard_id', orchardId);
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    async insertVehicle(orchardId: string, v: VehicleWrite & { name: string }): Promise<void> {
        const { error } = await supabase.from('fleet_vehicles').insert([{ orchard_id: orchardId, status: 'idle', ...v }]);
        if (error) throw error;
    },

    async updateVehicle(id: string, changes: VehicleWrite): Promise<void> {
        const { data, error } = await supabase.from('fleet_vehicles').update(changes).eq('id', id).select('id');
        if (error) throw error;
        requireRows(data, 'Vehicle');
    },

    /** Baja de un vehículo: deleted_at (el historial de transportes lo sigue nombrando) */
    async retireVehicle(id: string): Promise<void> {
        const { data, error } = await supabase.from('fleet_vehicles').update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id');
        if (error) throw error;
        requireRows(data, 'Vehicle');
    },

    async getVehicleNames(ids: string[]): Promise<Record<string, string>> {
        if (ids.length === 0) return {};
        const { data } = await supabase.from('fleet_vehicles')
            .select('id, name, driver_name').in('id', ids);
        return Object.fromEntries((data || []).map(v => [v.id, v.name]));
    },

    /* ── Transport Requests ── */
    async getPendingRequestStatuses(orchardId?: string) {
        let query = supabase.from('transport_requests')
            .select('status').in('status', ['pending', 'assigned']);
        if (orchardId) query = query.eq('orchard_id', orchardId);
        const { data } = await query;
        return data || [];
    },

    async getActiveRequests(orchardId?: string) {
        let query = supabase.from('transport_requests').select('*')
            .in('status', ['pending', 'assigned', 'in_progress'])
            .order('created_at', { ascending: false });
        if (orchardId) query = query.eq('orchard_id', orchardId);
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    async getCompletedRequests(orchardId?: string, limit = 50) {
        let query = supabase.from('transport_requests')
            .select('id, zone, bins_count, created_at, completed_at, assigned_vehicle, requester_name, notes, status')
            .in('status', ['completed', 'cancelled'])
            .order('completed_at', { ascending: false }).limit(limit);
        if (orchardId) query = query.eq('orchard_id', orchardId);
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },
};
