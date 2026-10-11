/**
 * analytics-trends.service.ts
 * Historical HeatMap & Trend Analytics (Phase 6+)
 * Queries repositories for day_closures, attendance, bucket_records
 */
import { analyticsTrendsRepository } from '@/repositories/analytics-trends.repository';
import { payForRange, pieceRateFor, nzDateOf } from '@/services/harvestMetrics/pay';
import type { VarietyRate } from '@/types';

/** Punto de tendencia diaria devuelto por getDailyTrendsV2.
 *  label = fecha cruda 'YYYY-MM-DD'. El consumidor aplica el formato local (weekday, etc.). */
export interface DailyTrendPoint {
    label: string;
    value: number;
    meta?: { date: string; totalBuckets?: number };
}

export interface DailyTrendsV2 {
    totalBins: DailyTrendPoint[];
    costPerBin: DailyTrendPoint[];  // [] hasta Paso 3 (requiere daily_attendance + harvest_settings)
    workforceSize: DailyTrendPoint[];
    breakEvenCost: number;
}

export class AnalyticsTrendsService {
    /**
     * Obtener densidad de cosecha por row para un rango de fechas
     */
    async getRowDensity(
        orchardId: string,
        startDate: string,
        endDate: string,
        targetBucketsPerRow: number = 100
    ): Promise<{
        orchard_id: string;
        date_range: { start: string; end: string };
        total_buckets: number;
        total_rows_harvested: number;
        density_by_row: Array<{
            row_number: number;
            total_buckets: number;
            unique_pickers: number;
            avg_buckets_per_picker: number;
            density_score: number;
            target_completion: number;
        }>;
        top_rows: number[];
        pending_rows: number[];
    }> {
        const events = await analyticsTrendsRepository.getBucketsByRowInRange(orchardId, startDate, endDate);

        if (!events || events.length === 0) {
            return {
                orchard_id: orchardId,
                date_range: { start: startDate, end: endDate },
                total_buckets: 0, total_rows_harvested: 0,
                density_by_row: [], top_rows: [], pending_rows: []
            };
        }

        // Agrupar por row_number
        const rowStatsMap = new Map<number, { buckets: number; pickers: Set<string> }>();
        events.forEach((event) => {
            if (!rowStatsMap.has(event.row_number)) {
                rowStatsMap.set(event.row_number, { buckets: 0, pickers: new Set() });
            }
            const stats = rowStatsMap.get(event.row_number)!;
            stats.buckets++;
            stats.pickers.add(event.picker_id);
        });

        const density_by_row: Array<{
            row_number: number; total_buckets: number; unique_pickers: number;
            avg_buckets_per_picker: number; density_score: number; target_completion: number;
        }> = [];
        let total_buckets = 0;
        const top_rows: number[] = [];
        const pending_rows: number[] = [];

        for (const [row_number, stats] of rowStatsMap) {
            const avg = stats.pickers.size > 0 ? stats.buckets / stats.pickers.size : 0;
            const target_completion = (stats.buckets / targetBucketsPerRow) * 100;
            density_by_row.push({
                row_number, total_buckets: stats.buckets, unique_pickers: stats.pickers.size,
                avg_buckets_per_picker: parseFloat(avg.toFixed(2)),
                density_score: parseFloat(Math.min(100, target_completion).toFixed(2)),
                target_completion: parseFloat(target_completion.toFixed(2)),
            });
            total_buckets += stats.buckets;
            if (target_completion >= 100) top_rows.push(row_number);
            else if (target_completion < 50) pending_rows.push(row_number);
        }

        density_by_row.sort((a, b) => a.row_number - b.row_number);
        return {
            orchard_id: orchardId, date_range: { start: startDate, end: endDate },
            total_buckets, total_rows_harvested: density_by_row.length,
            density_by_row, top_rows: top_rows.sort((a, b) => a - b),
            pending_rows: pending_rows.sort((a, b) => a - b),
        };
    }

    /**
     * Tendencia diaria de producción usando datos reales de bucket_records.
     *
     * Recibe fechas NZ ya calculadas por el consumidor (YYYY-MM-DD, timezone-aware).
     * label = fecha cruda (YYYY-MM-DD). El consumidor aplica Intl para el weekday localizado.
     * costPerBin = [] — requiere daily_attendance + harvest_settings (pendiente).
     */
    async getDailyTrendsV2(
        orchardId: string,
        startDate: string,
        endDate: string,
        breakEvenCost: number = 8.50,
    ): Promise<DailyTrendsV2> {
        const aggregates = await analyticsTrendsRepository.getDailyAggregates(orchardId, startDate, endDate);

        const totalBins: DailyTrendPoint[] = aggregates.map(d => ({
            label: d.date,
            value: d.total_buckets,
            meta: { date: d.date, totalBuckets: d.total_buckets },
        }));

        const workforceSize: DailyTrendPoint[] = aggregates.map(d => ({
            label: d.date,
            value: d.workforce_count,
            meta: { date: d.date },
        }));

        return { totalBins, workforceSize, costPerBin: [], breakEvenCost };
    }

    /**
     * Sangrado salarial diario: diferencia entre costo a salario mínimo y ganancias a tarifa por pieza.
     *
     * Si se proveen orchardId + settings, consulta bucket_records vía getDailyAggregates
     * y estima el sangrado usando workforce_count × SHIFT_HOURS × min_wage - total_buckets × piece_rate.
     * Sin datos (sin orchardId o sin settings), devuelve ceros (no hay datos para mostrar).
     *
     * SHIFT_HOURS = 8h por día (turno estándar NZ cosecha). Sin check_in/check_out real, es la mejor
     * estimación disponible hasta conectar daily_attendance.check_in/check_out.
     */
    async getDailyBleed(
        orchardId: string | undefined,
        days: number = 7,
        locale: string = 'en-NZ',
        settings?: { piece_rate: number; min_wage_rate: number; variety_rates?: VarietyRate[] },
    ): Promise<{ label: string; value: number }[]> {
        const nzFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' });
        const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'Pacific/Auckland' });

        const today = new Date();
        const endDateNZ = nzFmt.format(today);
        // Empezamos `days - 1` atrás para incluir hoy como último día
        const startMs = today.getTime() - (days - 1) * 86_400_000;
        const startDateNZ = nzFmt.format(new Date(startMs));

        // Construir slot de días vacíos en orden cronológico
        const slots: { dateNZ: string; label: string }[] = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today.getTime() - i * 86_400_000);
            const dateNZ = nzFmt.format(d);
            const label = i === 0 ? 'Today' : weekdayFmt.format(d);
            slots.push({ dateNZ, label });
        }

        // Sin orchardId o settings: devolver ceros (no hay base de datos disponible)
        if (!orchardId || !settings) {
            return slots.map(s => ({ label: s.label, value: 0 }));
        }

        // Complemento al mínimo de cada día = suma por picker del cálculo único
        // (pay.ts): horas del fichaje con descanso no pagado, cubetas sin rechazos.
        const { attendance, buckets } = await analyticsTrendsRepository.getPayInputs(orchardId, startDateNZ, endDateNZ);
        // Agrupar por día NZ una sola vez (no recorrer todas las cubetas por día)
        const attByDay = new Map<string, Parameters<typeof payForRange>[0]['attendance'][number][]>();
        for (const a of attendance) {
            const list = attByDay.get(a.date) ?? [];
            list.push({ pickerId: a.picker_id, date: a.date, orchardId: a.orchard_id, checkIn: a.check_in, checkOut: a.check_out, breakStart: a.break_start, breakMinutes: a.break_minutes });
            attByDay.set(a.date, list);
        }
        const varietyRates = (settings.variety_rates ?? []).map(r => ({ orchardId: r.orchard_id, variety: r.variety, pieceRate: Number(r.piece_rate) }));
        const bktByDay = new Map<string, Parameters<typeof payForRange>[0]['buckets'][number][]>();
        for (const b of buckets) {
            const day = nzDateOf(b.scanned_at);
            const list = bktByDay.get(day) ?? [];
            list.push({
                pickerId: b.picker_id, scannedAt: b.scanned_at, qualityGrade: b.quality_grade,
                orchardId: b.orchard_id, variety: b.variety,
                pieceRate: pieceRateFor({ orchardId: b.orchard_id, variety: b.variety }, { varietyRates, fallback: settings.piece_rate }),
            });
            bktByDay.set(day, list);
        }

        return slots.map(s => {
            const dayRows = payForRange({
                attendance: attByDay.get(s.dateNZ) ?? [],
                buckets: bktByDay.get(s.dateNZ) ?? [],
                pieceRate: settings.piece_rate,
                minWage: settings.min_wage_rate,
            });
            const topUp = dayRows.reduce((sum, r) => sum + r.topUp, 0);
            return { label: s.label, value: Math.round(topUp) };
        });
    }
}

export const analyticsTrendsService = new AnalyticsTrendsService();

