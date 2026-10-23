/**
 * Picker Repository — Domain queries for pickers table
 */
import { supabase } from '@/services/supabase';
import { fetchInChunks } from '@/utils/fetchInChunks';

export const pickerRepository = {
    /** Update picker status */
    async updateStatus(pickerId: string, status: string) {
        const { error } = await supabase
            .from('pickers')
            .update({ status })
            .eq('id', pickerId);
        if (error) throw error;
    },

    /** Get picker names by IDs */
    async getNamesByIds(ids: string[]): Promise<Record<string, string>> {
        if (ids.length === 0) return {};
        const data = await fetchInChunks(ids, (chunk, from, to) =>
            supabase.from('pickers').select('id, name').in('id', chunk).order('id').range(from, to),
        ).catch(() => [] as { id: string; name: string }[]);
        return Object.fromEntries(data.map(p => [p.id, p.name]));
    },
};
