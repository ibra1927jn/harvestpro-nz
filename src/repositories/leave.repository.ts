/**
 * Leave Repository — consultas de la tabla leave_requests (ausencias y permisos).
 *
 * Solo acceso a datos; la lógica (quién puede, qué estado) está en
 * services/leave.service.ts y en las políticas RLS de la tabla.
 */
import { supabase } from '@/services/supabase';
import { fetchAllRows } from '@/utils/fetchAllRows';
import type { NewLeaveRequest } from '@/schemas/zod.schemas';

// Un solo literal: el tipado de supabase-js no entiende una cadena concatenada
const COLUMNS = 'id, orchard_id, picker_id, type, start_date, end_date, half_day, reason, status, requested_by, decided_by, decided_at, decision_note, created_at, updated_at';

/** Fila tal cual llega de la BD (se valida con Zod en el servicio) */
export type LeaveRequestRow = Record<string, unknown>;

export const leaveRepository = {
    /**
     * Ausencias que tocan un rango de fechas (solapan: empiezan antes del fin
     * y acaban después del inicio). Toda la empresa salvo que se pase huerto.
     * Por páginas con orden estable: una temporada entera pasa de 1000 filas.
     */
    async listInRange(from: string, to: string, orchardId?: string): Promise<LeaveRequestRow[]> {
        return fetchAllRows<LeaveRequestRow>((start, end) => {
            let query = supabase
                .from('leave_requests')
                .select(COLUMNS)
                .is('deleted_at', null)
                .lte('start_date', to)
                .gte('end_date', from);
            if (orchardId) query = query.eq('orchard_id', orchardId);
            return query.order('id').range(start, end);
        });
    },

    /** Historial de una persona, la más reciente primero */
    async listByPerson(pickerId: string): Promise<LeaveRequestRow[]> {
        return fetchAllRows<LeaveRequestRow>((start, end) => supabase
            .from('leave_requests')
            .select(COLUMNS)
            .eq('picker_id', pickerId)
            .is('deleted_at', null)
            .order('start_date', { ascending: false })
            .order('id')
            .range(start, end));
    },

    /** Lo que pidió una persona (el team leader) desde una fecha, lo más nuevo primero */
    async listRequestedBy(userId: string, sinceYmd: string): Promise<LeaveRequestRow[]> {
        return fetchAllRows<LeaveRequestRow>((start, end) => supabase
            .from('leave_requests')
            .select(COLUMNS)
            .eq('requested_by', userId)
            .is('deleted_at', null)
            .gte('end_date', sinceYmd)
            .order('created_at', { ascending: false })
            .order('id')
            .range(start, end));
    },

    /** Nueva ausencia. Lanza el error para que la pantalla lo diga. */
    async insert(row: NewLeaveRequest): Promise<LeaveRequestRow> {
        const { data, error } = await supabase
            .from('leave_requests')
            .insert([row])
            .select(COLUMNS)
            .single();
        if (error) throw error;
        return data as LeaveRequestRow;
    },

    /**
     * Cambia el estado por el id. Si la política RLS no deja (p. ej. la propia
     * ausencia) no vuelve fila: se avisa en vez de decir que se guardó.
     */
    async setStatus(
        id: string,
        updates: { status: 'approved' | 'rejected' | 'cancelled'; decided_by: string | null; decided_at: string; decision_note: string | null },
    ): Promise<LeaveRequestRow> {
        const { data, error } = await supabase
            .from('leave_requests')
            .update(updates)
            .eq('id', id)
            .select(COLUMNS)
            .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Leave request not found or not allowed');
        return data as LeaveRequestRow;
    },
};
