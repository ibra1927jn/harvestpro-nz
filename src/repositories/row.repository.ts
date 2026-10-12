/**
 * Row Assignment Repository — persistence for row_assignments + picker current_row
 *
 * Escribe tanto en pickers.current_row como en row_assignments para que
 * el Team Leader reciba actualizaciones via Supabase realtime.
 */
import { supabase } from '@/services/supabase';
import { logger } from '@/utils/logger';
import type { RowAssignment, RowVisit } from '@/types';

export const rowRepository = {
    /** Bulk update picker current_row */
    async updatePickerRows(pickerIds: string[], row: number) {
        const { error } = await supabase.from('pickers')
            .update({ current_row: row }).in('id', pickerIds);
        return { error };
    },

    /**
     * Upsert row_assignments en Supabase — permite que Team Leader
     * reciba cambios via realtime subscription.
     */
    async upsertRowAssignments(
        orchardId: string,
        entries: RowAssignment[]
    ): Promise<{ error: { message: string } | null }> {
        if (entries.length === 0) return { error: null };

        const rows = entries.map(e => ({
            id: e.id,
            orchard_id: orchardId,
            row_number: e.row_number,
            side: e.side,
            assigned_pickers: e.assigned_pickers,
            completion_percentage: e.completion_percentage,
            team_leader_id: e.team_leader_id ?? null,
            status: 'active' as const,
        }));

        const { error } = await supabase
            .from('row_assignments')
            .upsert(rows, { onConflict: 'id' });

        if (error) {
            logger.warn('[RowRepo] Failed to upsert row_assignments:', error.message);
        }
        return { error };
    },

    /**
     * Retira asignaciones sustituidas por una nueva (borrado lógico), para que
     * al recargar el equipo no aparezca en todas las filas que tuvo antes.
     */
    async retireAssignments(ids: string[]) {
        if (ids.length === 0) return { error: null };
        // Se quedan como historial: el equipo estuvo ahí hasta ahora
        const { error } = await supabase.from('row_assignments')
            .update({ status: 'moved', ended_at: new Date().toISOString() })
            .in('id', ids).eq('status', 'active');
        return { error };
    },

    /** Recorrido de filas desde una fecha (todas las del huerto, o las de un equipo) */
    async getHistory(orchardId: string, sinceIso: string, teamLeaderId?: string): Promise<RowVisit[]> {
        let q = supabase.from('row_assignments')
            .select('id, row_number, side, team_leader_id, status, assigned_at, ended_at')
            .eq('orchard_id', orchardId)
            .is('deleted_at', null)
            .gte('assigned_at', sinceIso)
            .order('assigned_at', { ascending: true });
        if (teamLeaderId) q = q.eq('team_leader_id', teamLeaderId);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []) as RowVisit[];
    },

    /** Update row assignment progress */
    async updateProgress(rowId: string, percentage: number) {
        const { error } = await supabase.from('row_assignments')
            .update({ completion_percentage: percentage }).eq('id', rowId);
        if (error) throw error;
    },

    /** Complete a row assignment */
    async completeRow(rowId: string) {
        const { error } = await supabase.from('row_assignments')
            .update({ completion_percentage: 100, status: 'completed', ended_at: new Date().toISOString() }).eq('id', rowId);
        if (error) throw error;
    },
};
