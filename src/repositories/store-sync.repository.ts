/**
 * Store Sync Repository — queries used by storeSync.ts for app boot hydration
 */
import { supabase } from '@/services/supabase';
import { fetchAllRows } from '@/utils/fetchAllRows';
import { todayNZST } from '@/utils/nzst';
import { pieceRatesRepository } from '@/repositories/piece-rates.repository';
import { pieceRateOn, type DailyPieceRate } from '@/services/harvestMetrics/pay';
import type { PresenceRow } from '@/stores/storeSyncLogic';

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
        if (!data) return data;
        // Precios por cubeta que valen HOY (piece_rates): el general y el de cada
        // variedad. piece_rate pasa a ser el general de hoy (lo que enseñan el TL,
        // el runner y el perfil del picker). Si no se pueden leer, el guardado.
        const today = todayNZST();
        let rates: DailyPieceRate[] = [];
        try {
            rates = await pieceRatesRepository.loadRange(today, today, orchardId);
        } catch {
            rates = [];
        }
        const stored = Number(data.piece_rate ?? 0);
        return {
            ...data,
            piece_rate: pieceRateOn(rates, orchardId, null, today, stored),
            piece_rates: rates,
        };
    },

    /**
     * Personas de la empresa con su fichaje de hoy en este huerto — query builder para el delta.
     * La carga completa filtra la plantilla (status active, sin borrar); el delta
     * NO filtra, para enterarse también de bajas y borrados y quitarlos del store.
     */
    getPickersQuery(orchardId: string, today: string, opts: { onlyStaff?: boolean } = { onlyStaff: true }) {
        // Plantilla de TODA la empresa (la gente rota entre huertos); el fichaje
        // unido es solo el de hoy EN ESTE huerto: presente aquí = fichado aquí.
        const q = supabase
            .from('pickers')
            .select(`*, daily_attendance!left(id, check_in, check_out, break_start, break_minutes, orchard_id, deleted_at)`)
            .eq('daily_attendance.date', today)
            .eq('daily_attendance.orchard_id', orchardId);
        return opts.onlyStaff ? q.eq('status', 'active').is('deleted_at', null) : q;
    },

    /**
     * Tramos abiertos hoy en OTROS huertos: quién está trabajando ahora en otro
     * huerto de la empresa (para mostrar "ahora en Huerto B").
     */
    async getOpenShiftsElsewhere(orchardId: string, today: string) {
        const { data } = await supabase
            .from('daily_attendance')
            .select('picker_id, orchard_id, check_in, orchards(name)')
            .eq('date', today)
            .is('check_out', null)
            .is('deleted_at', null)
            .neq('orchard_id', orchardId);
        return (data ?? []) as unknown as { picker_id: string; orchard_id: string; check_in: string | null; orchards: { name: string | null } | null }[];
    },

    /**
     * Quién está fichado hoy en el huerto, sin horas ni pago (presence_today):
     * lo usan los roles que no leen los fichajes de todos (runner, QC,
     * logística, y el team leader para la gente que no es de su equipo).
     */
    async getPresenceToday(orchardId: string): Promise<PresenceRow[]> {
        const { data, error } = await supabase.rpc('presence_today', { p_orchard_id: orchardId });
        if (error) throw error;
        return (data ?? []) as PresenceRow[];
    },

    /** Get bucket records since a date — returns query builder for delta chaining */
    getBucketRecordsQuery(orchardId: string, since: string) {
        return supabase
            .from('bucket_records').select('*').eq('orchard_id', orchardId)
            .gte('scanned_at', since).order('scanned_at', { ascending: false });
    },

    /** Get bucket records with count for payroll (hhrr.service remaining call) */
    async getBucketCounts(orchardId: string | undefined, since: string) {
        return fetchAllRows<{ picker_id: string; id: string; orchard_id: string | null; variety: string | null; scanned_at: string | null; quality_grade: string | null; deleted_at: string | null }>((from, to) => {
            let query = supabase.from('bucket_records').select('picker_id, id, orchard_id, variety, scanned_at, quality_grade, deleted_at').gte('scanned_at', since);
            if (orchardId) query = query.eq('orchard_id', orchardId);
            return query.order('scanned_at').order('id').range(from, to);
        });
    },

    /** Get harvest settings piece_rate — maybeSingle evita 406 si la fila no existe aún */
    async getPieceRate(orchardId: string) {
        const { data } = await supabase
            .from('harvest_settings').select('piece_rate').eq('orchard_id', orchardId).maybeSingle();
        return data?.piece_rate || null;
    },
};
