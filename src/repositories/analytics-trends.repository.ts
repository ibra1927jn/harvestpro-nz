/**
 * Analytics Trends Repository — Domain queries for day_closures, daily_attendance, bucket_records
 */
import { supabase } from '@/services/supabase';

export interface DailyAggregate {
    /** Fecha en formato YYYY-MM-DD (fecha local NZ, no UTC) */
    date: string;
    /** Número de scans (cubetas) en ese día NZ */
    total_buckets: number;
    /** Número de pickers distintos con al menos un scan ese día NZ */
    workforce_count: number;
}

export interface PayInputs {
    attendance: { picker_id: string; date: string; check_in: string | null; check_out: string | null; break_start: string | null; break_minutes: number | null }[];
    buckets: { picker_id: string; scanned_at: string; quality_grade: string | null }[];
}

export const analyticsTrendsRepository = {
    /** Fichajes y cubetas de un rango de días NZ — entrada del cálculo único de pago */
    async getPayInputs(orchardId: string, startDate: string, endDate: string): Promise<PayInputs> {
        const offset = (d: string) =>
            new Intl.DateTimeFormat('en-US', { timeZone: 'Pacific/Auckland', timeZoneName: 'longOffset' })
                .formatToParts(new Date(`${d}T12:00:00Z`))
                .find(p => p.type === 'timeZoneName')?.value.replace('GMT', '') || '+13:00';
        const [att, bkt] = await Promise.all([
            supabase
                .from('daily_attendance')
                .select('picker_id, date, check_in, check_out, break_start, break_minutes')
                .eq('orchard_id', orchardId)
                .gte('date', startDate)
                .lte('date', endDate),
            supabase
                .from('bucket_records')
                .select('picker_id, scanned_at, quality_grade')
                .eq('orchard_id', orchardId)
                .is('deleted_at', null)
                .gte('scanned_at', `${startDate}T00:00:00${offset(startDate)}`)
                .lte('scanned_at', `${endDate}T23:59:59${offset(endDate)}`),
        ]);
        if (att.error) throw att.error;
        if (bkt.error) throw bkt.error;
        return { attendance: att.data || [], buckets: (bkt.data || []) as PayInputs['buckets'] };
    },

    /** Get bucket records for a date range grouped by row */
    async getBucketsByRowInRange(orchardId: string, startDate: string, endDate: string) {
        const { data, error } = await supabase
            .from('bucket_records')
            .select('row_number, picker_id, scanned_at')
            .eq('orchard_id', orchardId)
            .gte('scanned_at', `${startDate}T00:00:00`)
            .lte('scanned_at', `${endDate}T23:59:59`);
        if (error) throw error;
        return data || [];
    },

    /** Get day closures for a date range */
    async getDayClosures(orchardId: string, startDate: string, endDate: string) {
        const { data, error } = await supabase
            .from('day_closures')
            .select('*')
            .eq('orchard_id', orchardId)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date');
        if (error) throw error;
        return data || [];
    },

    /** Get distinct attendance dates for a date range */
    async getAttendanceDates(orchardId: string, startDate: string, endDate: string) {
        const { data, error } = await supabase
            .from('daily_attendance')
            .select('date, picker_id')
            .eq('orchard_id', orchardId)
            .gte('date', startDate)
            .lte('date', endDate);
        if (error) throw error;
        return data || [];
    },

    /**
     * Agrega bucket_records por día calendario NZ para un rango de fechas.
     *
     * Por qué no usar day_closures: esa tabla solo existe cuando el manager
     * ejecuta DayClosureButton. En desarrollo y en días sin cierre explícito
     * está vacía → los charts mostrarían demo data. Este método agrega
     * directamente desde la fuente de verdad.
     *
     * Rango UTC calculado explícitamente desde NZ:
     * - NZ usa NZST (UTC+12, abril–septiembre) o NZDT (UTC+13, octubre–marzo).
     * - Buffer = 14h = max offset (13h NZDT) + 1h de margen para transiciones DST.
     * - Garantiza cubrir medianoche NZ en ambos regímenes sin perder filas en el borde.
     *
     * Paginación: supabase-js tiene page size por defecto de 1000 filas.
     * Con ~2000 scans/día × 7 días = 14.000 filas, es necesario paginar
     * para no truncar los resultados.
     */
    async getDailyAggregates(
        orchardId: string,
        startDate: string,
        endDate: string,
    ): Promise<DailyAggregate[]> {
        // NZ usa NZST (UTC+12, abril–septiembre) o NZDT (UTC+13, octubre–marzo).
        // Buffer = 14h = max offset (13h NZDT) + 1h de margen para transiciones DST.
        // Garantiza cubrir medianoche NZ en ambos regímenes sin perder filas en el borde.
        const utcFrom = new Date(`${startDate}T00:00:00Z`);
        utcFrom.setUTCHours(utcFrom.getUTCHours() - 14);
        const utcFromStr = utcFrom.toISOString();

        // End: endDate+1 00:00 UTC cubre hasta las 11:00-12:00 UTC del día siguiente → holgura completa.
        const utcTo = new Date(`${endDate}T00:00:00Z`);
        utcTo.setUTCDate(utcTo.getUTCDate() + 1);
        const utcToStr = utcTo.toISOString();

        // Paginación completa: 1000 filas por página (default supabase-js)
        const PAGE_SIZE = 1000;
        const allRows: { scanned_at: string; picker_id: string | null }[] = [];
        let page = 0;

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const from = page * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;

            const { data, error } = await supabase
                .from('bucket_records')
                .select('scanned_at, picker_id')
                .eq('orchard_id', orchardId)
                .gte('scanned_at', utcFromStr)
                .lt('scanned_at', utcToStr)
                .is('deleted_at', null)
                .order('scanned_at')
                .range(from, to);

            if (error) throw error;
            if (!data || data.length === 0) break;

            allRows.push(...(data as { scanned_at: string; picker_id: string | null }[]));

            if (data.length < PAGE_SIZE) break; // última página
            page++;
        }

        // Agrupar por fecha NZ usando Intl (maneja NZST/NZDT automáticamente)
        const nzFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' });
        const byDay = new Map<string, { total_buckets: number; pickers: Set<string> }>();

        for (const row of allRows) {
            const dayNZ = nzFmt.format(new Date(row.scanned_at));
            // Descartar días fuera del rango exacto (artefactos del buffer UTC)
            if (dayNZ < startDate || dayNZ > endDate) continue;
            if (!byDay.has(dayNZ)) {
                byDay.set(dayNZ, { total_buckets: 0, pickers: new Set() });
            }
            const entry = byDay.get(dayNZ)!;
            entry.total_buckets++;
            if (row.picker_id) entry.pickers.add(row.picker_id);
        }

        return Array.from(byDay.entries())
            .map(([date, { total_buckets, pickers }]) => ({
                date,
                total_buckets,
                workforce_count: pickers.size,
            }))
            .sort((a, b) => a.date.localeCompare(b.date));
    },
};
