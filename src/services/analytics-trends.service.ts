/**
 * analytics-trends.service.ts
 * Historical HeatMap & Trend Analytics (Phase 6+)
 * Queries repositories for day_closures, attendance, bucket_records
 */
import { analyticsTrendsRepository } from '@/repositories/analytics-trends.repository';
import { attendanceRowOf, payForRange, pieceRateOn, nzDateOf, type DailyPieceRate } from '@/services/harvestMetrics/pay';
import { pieceRatesRepository } from '@/repositories/piece-rates.repository';
import { logger } from '@/utils/logger';

/** Punto de tendencia diaria devuelto por getDailyTrendsV2.
 *  label = fecha cruda 'YYYY-MM-DD'. El consumidor aplica el formato local (weekday, etc.). */
export interface DailyTrendPoint {
    label: string;
    value: number;
    meta?: { date: string; totalBuckets?: number; costPerBin?: number; topUpCost?: number };
}

export interface DailyTrendsV2 {
    totalBins: DailyTrendPoint[];
    /** Coste por cubeta de cada día (pago total / cubetas). Vacío si no se pasan ajustes de pago */
    costPerBin: DailyTrendPoint[];
    workforceSize: DailyTrendPoint[];
    breakEvenCost: number;
}

/** Ajustes de pago del huerto que necesita el cálculo diario (los del store) */
export interface PaySettingsInput {
    /** Precio general guardado (harvest_settings.piece_rate): solo si un día no tiene ninguno */
    piece_rate: number;
    min_wage_rate: number;
    /**
     * Precios por día (piece_rates) del rango. Si no se pasan, se cargan: cada
     * cubeta cobra el precio de SU día, así un cambio de hoy no reescribe la tendencia.
     */
    daily_rates?: ReadonlyArray<DailyPieceRate>;
}

/** Pago de un día NZ, sumado para todos los pickers */
export interface DailyPay {
    date: string;
    buckets: number;
    pieceEarnings: number;
    topUp: number;
    total: number;
}

/** Fechas NZ 'YYYY-MM-DD' de start a end, ambas incluidas */
export function nzDateRange(startDateNZ: string, endDateNZ: string): string[] {
    const out: string[] = [];
    const start = Date.parse(`${startDateNZ}T00:00:00Z`);
    const end = Date.parse(`${endDateNZ}T00:00:00Z`);
    if (Number.isNaN(start) || Number.isNaN(end) || start > end) return out;
    for (let ms = start; ms <= end; ms += 86_400_000) {
        out.push(new Date(ms).toISOString().slice(0, 10));
    }
    return out;
}

export class AnalyticsTrendsService {
    /**
     * Pago de cada día NZ del rango: fichajes y cubetas del huerto pasados por el
     * cálculo único (pay.ts), día a día. Es la misma fuente que la nómina y que
     * el informe semanal, así la tendencia y el sangrado cuadran con lo que se paga.
     */
    async getDailyPay(
        orchardId: string,
        startDateNZ: string,
        endDateNZ: string,
        settings: PaySettingsInput,
    ): Promise<Map<string, DailyPay>> {
        const [{ attendance, buckets }, dailyRates] = await Promise.all([
            analyticsTrendsRepository.getPayInputs(orchardId, startDateNZ, endDateNZ),
            settings.daily_rates
                ? Promise.resolve(settings.daily_rates)
                : pieceRatesRepository.loadRange(startDateNZ, endDateNZ, orchardId).catch((e: unknown) => {
                    logger.warn('[AnalyticsTrends] piece rates not loaded, using the stored rate', e);
                    return [] as DailyPieceRate[];
                }),
        ]);
        // Agrupar por día NZ una sola vez (no recorrer todas las cubetas por día)
        const attByDay = new Map<string, Parameters<typeof payForRange>[0]['attendance'][number][]>();
        for (const a of attendance) {
            const list = attByDay.get(a.date) ?? [];
            list.push(attendanceRowOf(a));
            attByDay.set(a.date, list);
        }
        const bktByDay = new Map<string, Parameters<typeof payForRange>[0]['buckets'][number][]>();
        for (const b of buckets) {
            const day = nzDateOf(b.scanned_at);
            const list = bktByDay.get(day) ?? [];
            list.push({
                pickerId: b.picker_id, scannedAt: b.scanned_at, qualityGrade: b.quality_grade,
                orchardId: b.orchard_id, variety: b.variety,
                pieceRate: pieceRateOn(dailyRates, b.orchard_id ?? orchardId, b.variety, day, settings.piece_rate),
            });
            bktByDay.set(day, list);
        }

        const out = new Map<string, DailyPay>();
        for (const date of nzDateRange(startDateNZ, endDateNZ)) {
            const dayRows = payForRange({
                attendance: attByDay.get(date) ?? [],
                buckets: bktByDay.get(date) ?? [],
                pieceRate: settings.piece_rate,
                minWage: settings.min_wage_rate,
            });
            const sum = dayRows.reduce((acc, r) => ({
                buckets: acc.buckets + r.buckets,
                pieceEarnings: acc.pieceEarnings + r.pieceEarnings,
                topUp: acc.topUp + r.topUp,
                total: acc.total + r.total,
            }), { buckets: 0, pieceEarnings: 0, topUp: 0, total: 0 });
            out.set(date, { date, ...sum });
        }
        return out;
    }

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
     * costPerBin: con `settings`, coste por cubeta de cada día con cubetas
     * (pago total del día, complemento al mínimo incluido, entre cubetas pagadas);
     * sin ajustes de pago queda vacío.
     */
    async getDailyTrendsV2(
        orchardId: string,
        startDate: string,
        endDate: string,
        breakEvenCost: number = 8.50,
        settings?: PaySettingsInput,
    ): Promise<DailyTrendsV2> {
        const [aggregates, dailyPay] = await Promise.all([
            analyticsTrendsRepository.getDailyAggregates(orchardId, startDate, endDate),
            settings ? this.getDailyPay(orchardId, startDate, endDate, settings) : Promise.resolve(null),
        ]);

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

        const costPerBin: DailyTrendPoint[] = dailyPay
            ? [...dailyPay.values()]
                .filter(d => d.buckets > 0)
                .map(d => ({
                    label: d.date,
                    value: Math.round((d.total / d.buckets) * 100) / 100,
                    meta: { date: d.date, totalBuckets: d.buckets, costPerBin: Math.round((d.total / d.buckets) * 100) / 100, topUpCost: Math.round(d.topUp * 100) / 100 },
                }))
            : [];

        return { totalBins, workforceSize, costPerBin, breakEvenCost };
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
        settings?: PaySettingsInput,
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
        const dailyPay = await this.getDailyPay(orchardId, startDateNZ, endDateNZ, settings);
        return slots.map(s => ({ label: s.label, value: Math.round(dailyPay.get(s.dateNZ)?.topUp ?? 0) }));
    }
}

export const analyticsTrendsService = new AnalyticsTrendsService();

