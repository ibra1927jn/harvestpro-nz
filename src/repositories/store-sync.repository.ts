/**
 * Store Sync Repository — queries used by storeSync.ts for app boot hydration
 */
import { supabase } from '@/services/supabase';
import { fetchAllRows } from '@/utils/fetchAllRows';

export const storeSyncRepository = {
    /** Get first orchard */
    async getFirstOrchard() {
        const { data } = await supabase.from('orchards').select('*').limit(1);
        return data?.[0] || null;
    },

    /** Get harvest settings for an orchard — maybeSingle evita 406 si la fila no existe aún */
    async getSettings(orchardId: string) {
        const { data } = await supabase
            .from('harvest_settings').select('*').eq('orchard_id', orchardId).maybeSingle();
        return data;
    },

    /** Get pickers with attendance join — returns query builder for delta chaining */
    getPickersQuery(orchardId: string, today: string) {
        return supabase
            .from('pickers')
            .select(`*, daily_attendance!left(check_in, check_out, break_start, break_minutes)`)
            .eq('orchard_id', orchardId)
            .eq('status', 'active')
            .is('deleted_at', null)
            .eq('daily_attendance.date', today);
    },

    /** Get bucket records since a date — returns query builder for delta chaining */
    getBucketRecordsQuery(orchardId: string, since: string) {
        return supabase
            .from('bucket_records').select('*').eq('orchard_id', orchardId)
            .gte('scanned_at', since).order('scanned_at', { ascending: false });
    },

    /** Get bucket records with count for payroll (hhrr.service remaining call) */
    async getBucketCounts(orchardId: string | undefined, since: string) {
        return fetchAllRows<{ picker_id: string; id: string; scanned_at: string | null; quality_grade: string | null; deleted_at: string | null }>((from, to) => {
            let query = supabase.from('bucket_records').select('picker_id, id, scanned_at, quality_grade, deleted_at').gte('scanned_at', since);
            if (orchardId) query = query.eq('orchard_id', orchardId);
            return query.order('id').range(from, to);
        });
    },

    /** Get harvest settings piece_rate — maybeSingle evita 406 si la fila no existe aún */
    async getPieceRate(orchardId: string) {
        const { data } = await supabase
            .from('harvest_settings').select('piece_rate').eq('orchard_id', orchardId).maybeSingle();
        return data?.piece_rate || null;
    },
};
