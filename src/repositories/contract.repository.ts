/**
 * Contract Repository — Domain queries for contracts table
 */
import { supabase } from '@/services/supabase';
import { todayNZST } from '@/utils/nzst';
import { fetchAllRows } from '@/utils/fetchAllRows';

export interface OpenContractRow {
    id: string;
    employee_id: string;
    status: string;
    end_date: string | null;
}

export const contractRepository2 = {
    /**
     * Contratos abiertos (borrador, activo o caducando) para el resumen de
     * RRHH: de ahí salen los pendientes (borradores, caducando y activos sin
     * copia firmada). Por páginas: una empresa grande pasa de 1000 contratos.
     */
    async listOpen(orchardId?: string): Promise<OpenContractRow[]> {
        return fetchAllRows<OpenContractRow>((from, to) => {
            let query = supabase
                .from('contracts')
                .select('id, employee_id, status, end_date')
                .in('status', ['draft', 'active', 'expiring'])
                .is('deleted_at', null);
            if (orchardId) query = query.eq('orchard_id', orchardId);
            return query.order('id').range(from, to);
        });
    },

    /** Get all contracts with full details (ordered by status + end_date) */
    async getAll(orchardId?: string) {
        let query = supabase
            .from('contracts')
            .select('id, employee_id, type, status, start_date, end_date, hourly_rate, notes, created_at, updated_at')
            .order('status')
            .order('end_date', { ascending: true, nullsFirst: false });
        if (orchardId) query = query.eq('orchard_id', orchardId);
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    /** Get contracts expiring within N days */
    async getExpiringSoon(orchardId: string | undefined, today: string, cutoffDate: string) {
        let query = supabase
            .from('contracts')
            .select('id, employee_id, type, end_date, hourly_rate')
            .not('end_date', 'is', null)
            .lte('end_date', cutoffDate)
            .gte('end_date', today)
            .in('status', ['active', 'expiring']);
        if (orchardId) query = query.eq('orchard_id', orchardId);
        const { data } = await query;
        return data || [];
    },

    /** Get expired contracts still marked active */
    async getExpiredButActive(orchardId?: string) {
        const today = todayNZST();
        let query = supabase
            .from('contracts')
            .select('id, employee_id')
            .lt('end_date', today)
            .eq('status', 'active');
        if (orchardId) query = query.eq('orchard_id', orchardId);
        const { data } = await query;
        return data || [];
    },

    /** Get contracts by employee IDs (for enrichment) */
    async getByEmployeeIds(employeeIds: string[]) {
        if (employeeIds.length === 0) return [];
        const { data } = await supabase
            .from('contracts')
            .select('id, employee_id, type, status, start_date, end_date, hourly_rate, updated_at')
            .in('employee_id', employeeIds)
            .in('status', ['active', 'expiring'])
            .is('deleted_at', null)
            .order('start_date', { ascending: false });
        return data || [];
    },

    /** Nuevo contrato (RRHH). Lanza el error para que la pantalla lo diga. */
    async insertOne(row: {
        employee_id: string; orchard_id: string; type: string; status: string;
        start_date: string; end_date: string | null; hourly_rate: number;
        notes?: string | null; created_by?: string | null;
    }) {
        const { data, error } = await supabase.from('contracts').insert([row]).select().single();
        if (error) throw error;
        return data;
    },

    /** Cambia un contrato por SU id. Lanza si no existe o no se puede. */
    async updateOne(contractId: string, updates: Record<string, unknown>) {
        const { data, error } = await supabase.from('contracts')
            .update(updates).eq('id', contractId).select('id').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Contract not found or not allowed');
    },
};
