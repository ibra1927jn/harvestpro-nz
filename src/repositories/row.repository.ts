/**
 * Row Assignment Repository — persistence for row_assignments + picker current_row
 *
 * Escribe tanto en pickers.current_row como en row_assignments para que
 * el Team Leader reciba actualizaciones via Supabase realtime.
 */
import { supabase } from '@/services/supabase';
import { logger } from '@/utils/logger';
import type { RowAssignment } from '@/types';

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
        const { error } = await supabase.from('row_assignments')
            .update({ deleted_at: new Date().toISOString() }).in('id', ids);
        return { error };
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
            .update({ completion_percentage: 100, status: 'completed' }).eq('id', rowId);
        if (error) throw error;
    },
};
