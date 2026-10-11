/**
 * harvestMetrics/perPicker.ts — Métricas del día por picker
 *
 * Pure helper — sin React. Horas y pago salen SIEMPRE de pay.ts
 * (shiftHours + dayPay), igual que en Payroll, HR, Informe y la Edge Function.
 *
 * - Horas: fichaje del día (entrada/salida/descanso que lleva el team leader);
 *   si no hay fichaje, estimación por primer y último escaneo (solo panel en vivo).
 * - Cubetas: las del día, excluyendo rechazos de QC y registros borrados.
 */
import type { Picker, BucketRecord, HarvestSettings } from '@/types';
import { shiftHours, dayPay, nzDateOf, isNZPublicHoliday, type HoursSource } from './pay';

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
    settings: Pick<HarvestSettings, 'piece_rate' | 'min_wage_rate' | 'shift_start_time'>,
    now: Date = new Date()
): PickerMetrics[] {
    const pieceRate = settings.piece_rate || 6.5;
    const minWage = settings.min_wage_rate || 23.95;
    const isPublicHoliday = isNZPublicHoliday(nzDateOf(now));

    // Cubetas y timestamps por picker (clave = picker_id del registro: UUID o código corto)
    const scansByPicker = new Map<string, string[]>();
    for (const r of bucketRecords) {
        if (!isPayableBucket(r)) continue;
        const key = r.picker_id as string;
        const list = scansByPicker.get(key) ?? [];
        list.push(r.scanned_at || r.created_at || '');
        scansByPicker.set(key, list);
    }

    const pickers = crew.filter(p => !p.role || p.role === 'picker');

    return pickers
        .map(p => {
            const scans = scansByPicker.get(p.id) ?? scansByPicker.get(p.picker_id) ?? [];
            const bins = scans.length;
            const shift = shiftHours({
                checkIn: p.check_in,
                checkOut: p.check_out,
                breakStart: p.break_start,
                breakMinutes: p.break_minutes,
                scanTimes: scans,
                now,
            });
            const pay = dayPay({ buckets: bins, hours: shift.hours, pieceRate, minWage, isPublicHoliday });

            return {
                pickerId: p.id,
                pickerName: p.name,
                bins,
                hoursWorked: shift.hours,
                hoursSource: shift.source,
                earned: pay.total,
                pieceRateEarnings: pay.pieceEarnings,
                topUp: pay.topUp,
                costPerBin: bins > 0 ? pay.total / bins : 0,
                teamLeaderId: p.team_leader_id,
            };
        })
        .filter(m => m.bins > 0 || m.hoursSource === 'timesheet' || m.hoursSource === 'open_shift');
}
