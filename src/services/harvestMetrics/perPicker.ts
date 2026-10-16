/**
 * harvestMetrics/perPicker.ts — Métricas del día por picker
 *
 * Pure helper — sin React. Horas y pago salen SIEMPRE de pay.ts
 * (shiftHours + dayPay), igual que en Payroll, HR, Informe y la Edge Function.
 *
 * - Horas: tramos del día (entrada/salida/descanso que lleva el team leader;
 *   puede haber varios si sale y vuelve, con un solo descanso no pagado);
 *   si no hay fichaje, estimación por primer y último escaneo (solo panel en vivo).
 * - Cubetas: las del día, excluyendo rechazos de QC y registros borrados; cada
 *   una al precio de su variedad (settings.variety_rates) o, si no, piece_rate.
 */
import type { Picker, BucketRecord, HarvestSettings } from '@/types';
import { shiftHours, payForRange, pieceRateFor, nzDateOf, type HoursSource, type AttendanceRow, type BucketRow } from './pay';
import { PAY_RULES } from '@/services/harvestMetrics/pay';

export interface PickerMetrics {
    pickerId: string;
    pickerName: string;
    bins: number;
    /** Horas pagables del día (descanso no pagado ya descontado) */
    hoursWorked: number;
    /** De dónde salen las horas: fichaje, turno abierto, estimación o nada */
    hoursSource: HoursSource;
    earned: number;
    pieceRateEarnings: number;
    /** Complemento al mínimo del día = max(0, mínimo × horas − cubetas × tarifa) */
    topUp: number;
    /** Coste real por cubeta (NZD), incluido el complemento */
    costPerBin: number;
    teamLeaderId?: string;
}

function isPayableBucket(r: BucketRecord): boolean {
    return !!r.picker_id && !r.deleted_at && r.quality_grade !== 'reject';
}

/**
 * Computa métricas del día por picker desde el store.
 * Incluye a los pickers (rol 'picker') con al menos una cubeta o con fichaje:
 * quien fichó y aún no ha escaneado cobra igualmente el mínimo por sus horas.
 */
export function computePerPicker(
    crew: Picker[],
    bucketRecords: BucketRecord[],
    settings: Pick<HarvestSettings, 'piece_rate' | 'min_wage_rate' | 'shift_start_time' | 'variety_rates'>,
    now: Date = new Date()
): PickerMetrics[] {
    const pieceRate = settings.piece_rate || 6.5;
    const minWage = settings.min_wage_rate || PAY_RULES.minWageFloor;
    const today = nzDateOf(now);
    const varietyRates = (settings.variety_rates ?? []).map(r => ({
        orchardId: r.orchard_id, variety: r.variety, pieceRate: Number(r.piece_rate),
    }));

    // Cubetas por picker (clave = picker_id del registro: UUID o código corto)
    const scansByPicker = new Map<string, BucketRecord[]>();
    for (const r of bucketRecords) {
        if (!isPayableBucket(r)) continue;
        const key = r.picker_id as string;
        const list = scansByPicker.get(key) ?? [];
        list.push(r);
        scansByPicker.set(key, list);
    }

    const pickers = crew.filter(p => !p.role || p.role === 'picker');

    return pickers
        .map(p => {
            const scans = scansByPicker.get(p.id) ?? scansByPicker.get(p.picker_id) ?? [];
            const bins = scans.length;
            const shifts = p.shifts?.length
                ? p.shifts
                : p.check_in
                    ? [{ check_in: p.check_in, check_out: p.check_out, break_start: p.break_start, break_minutes: p.break_minutes }]
                    : [];
            const attendance: AttendanceRow[] = shifts.map(s => ({
                pickerId: p.id,
                date: today,
                orchardId: s.orchard_id ?? null,
                checkIn: s.check_in,
                checkOut: s.check_out,
                breakStart: s.break_start,
                breakMinutes: s.break_minutes,
            }));
            const buckets: BucketRow[] = scans.map(r => ({
                pickerId: p.id,
                // Las cubetas del panel son del día que se mira
                scannedAt: r.scanned_at || r.created_at || now.toISOString(),
                orchardId: r.orchard_id ?? null,
                variety: r.variety ?? null,
                pieceRate: pieceRateFor({ orchardId: r.orchard_id, variety: r.variety }, { varietyRates, fallback: pieceRate }),
            }));
            const [range] = payForRange({ attendance, buckets, pieceRate, minWage, now });
            const day = range?.dayDetails.find(d => d.date === today) ?? range?.dayDetails[0];

            // De dónde salen las horas (mismo significado que shiftHours)
            const hoursSource: HoursSource = shifts.length === 0
                ? shiftHours({ scanTimes: buckets.map(b => b.scannedAt) }).source
                : shifts.some(s => !s.check_out) ? 'open_shift' : 'timesheet';
            const hours = day?.hours ?? 0;
            const total = day?.total ?? 0;

            return {
                pickerId: p.id,
                pickerName: p.name,
                bins,
                hoursWorked: hours,
                hoursSource,
                earned: total,
                pieceRateEarnings: day?.pieceEarnings ?? 0,
                topUp: day?.topUp ?? 0,
                costPerBin: bins > 0 ? total / bins : 0,
                teamLeaderId: p.team_leader_id,
            };
        })
        .filter(m => m.bins > 0 || m.hoursSource === 'timesheet' || m.hoursSource === 'open_shift');
}
