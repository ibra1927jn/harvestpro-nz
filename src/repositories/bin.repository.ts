/**
 * Bin Repository — Domain queries for bins table
 */
import { supabase } from '@/services/supabase';

export const binRepository = {
    /** Get all bins for an orchard */
    async getByOrchard(orchardId: string) {
        const { data, error } = await supabase
            .from('bins')
            .select('*')
            .eq('orchard_id', orchardId);
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
