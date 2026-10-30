/**
 * Bin Repository — Domain queries for bins table
 */
import { supabase } from '@/services/supabase';

export const binRepository = {
    /**
     * Bins del huerto: solo las columnas que usa la app (el historial de
     * movimientos y la ubicación no se muestran). Se pide en cada arranque y en
     * cada desbloqueo del móvil (prueba de carga 2026-10-21).
     */
    async getByOrchard(orchardId: string) {
        const { data, error } = await supabase
            .from('bins')
            .select('id, bin_code, status, variety, filled_at, deleted_at')
            .eq('orchard_id', orchardId)
            .is('deleted_at', null);
        if (error) throw error;
        return data || [];
    },

    /** Alta de un bin (los runners pueden darlos de alta en su huerto) */
    async insert(bin: { id: string; orchard_id: string; bin_code: string; status: string }): Promise<void> {
        const { error } = await supabase.from('bins').insert([bin]);
        if (error) throw error;
    },

    /** Update bin status */
    async updateStatus(binId: string, status: string, filledAt: string | null): Promise<void> {
        const { error } = await supabase
            .from('bins')
            .update({ status, filled_at: filledAt })
            .eq('id', binId);
        if (error) throw error;
    },
};
