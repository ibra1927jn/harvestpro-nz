/**
 * harvestMetrics/weekly.ts — Rollups diarios para el rango semanal
 *
 * Pure TypeScript, sin imports de React.
 * Garantiza paridad numérica con useHarvestMetrics usando el mismo
 * computePerPicker + computeKPIs para cada día del rango.
 */
import type { BucketRecord, Picker, HarvestSettings } from '@/types';
import { computePerPicker } from './perPicker';
import { computeKPIs, type HarvestKPIs } from './kpis';
import { nzDateOf } from './pay';

export interface DayRollup {
    /** Fecha en formato "YYYY-MM-DD" (fecha local NZ) */
    date: string;
    bins: number;
    hoursWorked: number;
    /** Ganancia total = piece rate earnings + min wage top-up */
    totalLabour: number;
    costPerBin: number;
    /** Pickers con ≥1 scan en ese día */
    pickerCount: number;
    /** KPIs completos para consumidores que los necesiten */
    kpis: HarvestKPIs;
}

/**
 * Genera un array de fechas YYYY-MM-DD desde `from` hasta `to` inclusive.
 */
function buildDateRange(from: string, to: string): string[] {
    const dates: string[] = [];
    // Parsear sin zona horaria — tratar como fecha local
    const [fromY, fromM, fromD] = from.split('-').map(Number);
    const [toY, toM, toD] = to.split('-').map(Number);

    const current = new Date(fromY, fromM - 1, fromD);
    const end = new Date(toY, toM - 1, toD);

    while (current <= end) {
        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, '0');
        const d = String(current.getDate()).padStart(2, '0');
        dates.push(`${y}-${m}-${d}`);
        current.setDate(current.getDate() + 1);
    }

    return dates;
}

/**
 * Fecha NZ (YYYY-MM-DD) de un scan. Antes se cortaba el ISO en UTC, lo que
 * asignaba al día anterior todo lo escaneado antes de las 12:00/13:00 NZ.
 */
function extractDate(scan: BucketRecord): string {
    const ts = scan.scanned_at ?? scan.created_at ?? scan.timestamp;
    return ts ? nzDateOf(ts) : '';
}

/**
 * weeklySeries — Rollups por día para un rango de fechas.
 *
 * Para cada día de `from` a `to` (inclusive), filtra los scans de ese día
 * calendario y llama a computePerPicker + computeKPIs con el mismo crew y
 * settings que usa useHarvestMetrics. Esto garantiza que el rollup de "hoy"
 * produce NÚMEROS IDÉNTICOS a los que devuelve useHarvestMetrics.
 */
export function weeklySeries(params: {
    scans: BucketRecord[];
    crew: Picker[];
    settings: Pick<HarvestSettings, 'piece_rate' | 'min_wage_rate' | 'shift_start_time'>;
    /** "YYYY-MM-DD" fecha inicio (NZ local) */
    from: string;
    /** "YYYY-MM-DD" fecha fin inclusive (NZ local) */
    to: string;
    /** Override del "now" para tests. Si se omite, usa las 23:59:59 de cada día. */
    nowOverride?: Date;
}): DayRollup[] {
    const { scans, crew, settings, from, to, nowOverride } = params;
    const dates = buildDateRange(from, to);

    return dates.map(date => {
        // Filtrar scans que corresponden a este día calendario
        const scansForDay = scans.filter(s => extractDate(s) === date);

        // "now" para este día: fin del día calendario (23:59:59)
        // para que deriveHoursWorked no recorte con un now pasado
        let endOfDay: Date;
        if (nowOverride !== undefined) {
            endOfDay = nowOverride;
        } else {
            const [y, m, d] = date.split('-').map(Number);
            endOfDay = new Date(y, m - 1, d, 23, 59, 59, 999);
        }

        const perPicker = computePerPicker(crew, scansForDay, settings, endOfDay);
        const kpis = computeKPIs(perPicker);

        // Horas totales trabajadas en el día (suma de todos los pickers)
        const hoursWorked = perPicker.reduce((s, p) => s + p.hoursWorked, 0);

        // Pickers con ≥1 bin ese día
        const pickerCount = perPicker.filter(p => p.bins > 0).length;

        return {
            date,
            bins: kpis.totalBins,
            hoursWorked,
            totalLabour: kpis.totalLabour,
            costPerBin: kpis.costPerBin,
            pickerCount,
            kpis,
        };
    });
}
