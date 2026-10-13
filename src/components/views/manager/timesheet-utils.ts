/**
 * Timesheet utilities — pure helper functions for attendance time formatting
 * Extracted from TimesheetEditor.tsx
 * @module views/manager/timesheet-utils
 */
import { logger } from '@/utils/logger';
import { mealBreakMissing, shiftHours } from '@/services/harvestMetrics/pay';
import { todayNZST, nzOffsetOn } from '@/utils/nzst';

/** Attendance record row shape */
export interface AttendanceRow {
    id: string;
    picker_id: string;
    check_in: string | null;
    check_out: string | null;
    /** Hora del descanso de 30 min (no pagado) anotada por el team leader */
    break_start?: string | null;
    break_minutes?: number | null;
    deleted_at?: string | null;
    status: string;
    date: string;
    correction_reason?: string;
    corrected_at?: string;
    picker?: {
        id: string;
        name: string;
        picker_id: string;
    };
}

const NZ_TIME = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
});

/** HH:MM en hora de Nueva Zelanda (no la zona del navegador) */
function nzHHMM(isoString: string): string {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
    const parts = NZ_TIME.formatToParts(d);
    const hh = parts.find(p => p.type === 'hour')?.value ?? '00';
    const mm = parts.find(p => p.type === 'minute')?.value ?? '00';
    return `${hh.padStart(2, '0')}:${mm}`;
}

/** Format ISO timestamp to HH:MM (NZ time) for input fields */
export function formatTimeForInput(isoString: string): string {
    try {
        return nzHHMM(isoString);
    } catch (e) {
        logger.warn('[TimesheetEditor] Invalid date for input formatting:', isoString, e);
        return '';
    }
}

/** Format ISO timestamp to HH:MM (NZ time) for display */
export function formatTime(isoString: string | null): string {
    if (!isoString) return '—';
    try {
        return nzHHMM(isoString);
    } catch (e) {
        logger.warn('[TimesheetEditor] Invalid date for display formatting:', isoString, e);
        return '—';
    }
}

/**
 * Hora NZ de un día ("2026-10-05" + "07:30") → instante ISO en UTC.
 * Usa el desfase real de ese día (+12:00 en invierno, +13:00 en verano).
 * Antes se ponía siempre "+13:00": de abril a septiembre cada corrección
 * quedaba una hora desplazada.
 */
export function nzTimeToIso(dateYMD: string, hhmm: string): string {
    return new Date(`${dateYMD}T${hhmm}:00${nzOffsetOn(dateYMD)}`).toISOString();
}

/**
 * Horas pagables de una fila: cálculo único (descanso de 30 min no pagado).
 * - Sin entrada: null.
 * - Sin salida en un día pasado: null (turno sin cerrar, hay que corregirlo).
 * - Sin salida hoy: hasta ahora.
 */
export function calculateHours(
    row: Pick<AttendanceRow, 'check_in' | 'check_out' | 'date' | 'break_start' | 'break_minutes'>,
    today: string = todayNZST(),
    now: Date = new Date(),
): number | null {
    if (!row.check_in) return null;
    if (!row.check_out && row.date < today) return null;
    return shiftHours({
        checkIn: row.check_in,
        checkOut: row.check_out,
        breakStart: row.break_start,
        breakMinutes: row.break_minutes,
        now,
    }).hours;
}

/**
 * Turno de más de 4 h sin descanso de comida anotado (ERA 2000 Parte 6D).
 * El pago solo descuenta descansos anotados: el team leader debe anotarlo.
 * Un turno sin cerrar de un día pasado no cuenta (ya sale como "sin cerrar").
 */
export function isMealBreakMissing(
    row: Pick<AttendanceRow, 'check_in' | 'check_out' | 'date' | 'break_start'>,
    today: string = todayNZST(),
    now: Date = new Date(),
): boolean {
    if (!row.check_in) return false;
    if (!row.check_out && row.date < today) return false;
    return mealBreakMissing([{ checkIn: row.check_in, checkOut: row.check_out, breakStart: row.break_start }], now);
}

/** Flag abnormal hour counts (>12 or <0) */
export function isAbnormal(hours: number | null): boolean {
    return hours !== null && (hours > 12 || hours < 0);
}

/** Valores del formulario de corrección (HH:MM hora NZ) */
export interface CorrectionForm {
    checkIn: string;
    checkOut: string;
    breakStart: string;
    reason: string;
}

export const EMPTY_CORRECTION: CorrectionForm = { checkIn: '', checkOut: '', breakStart: '', reason: '' };

/** Formulario precargado con las horas actuales de la fila */
export function correctionFormFor(record: Pick<AttendanceRow, 'check_in' | 'check_out' | 'break_start'>): CorrectionForm {
    return {
        checkIn: record.check_in ? formatTimeForInput(record.check_in) : '',
        checkOut: record.check_out ? formatTimeForInput(record.check_out) : '',
        breakStart: record.break_start ? formatTimeForInput(record.break_start) : '',
        reason: '',
    };
}

/**
 * Cambios a guardar: horas NZ de ese día → instante UTC. Entrada y salida se
 * envían si tienen valor; el descanso solo si cambió (vacío = quitarlo).
 */
export function buildCorrectionUpdates(
    record: Pick<AttendanceRow, 'date' | 'break_start'>,
    form: Pick<CorrectionForm, 'checkIn' | 'checkOut' | 'breakStart'>,
): { check_in?: string; check_out?: string; break_start?: string | null } {
    const updates: { check_in?: string; check_out?: string; break_start?: string | null } = {};
    if (form.checkIn) updates.check_in = nzTimeToIso(record.date, form.checkIn);
    if (form.checkOut) updates.check_out = nzTimeToIso(record.date, form.checkOut);
    const previousBreak = record.break_start ? formatTimeForInput(record.break_start) : '';
    if (form.breakStart !== previousBreak) {
        updates.break_start = form.breakStart ? nzTimeToIso(record.date, form.breakStart) : null;
    }
    return updates;
}

/** Totales de la hoja diaria (pie de tabla) */
export function dailyTimesheetTotals(rows: Array<{
    hours_worked: number; buckets_total: number; buckets_rejected: number;
    piece_earnings: number; top_up: number; total_earnings: number; is_below_minimum: boolean;
}>): { hours: number; buckets: number; rejected: number; piece: number; topUp: number; total: number; belowMinimum: number } {
    const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
    return {
        hours: sum(r => r.hours_worked),
        buckets: sum(r => r.buckets_total),
        rejected: sum(r => r.buckets_rejected),
        piece: sum(r => r.piece_earnings),
        topUp: sum(r => r.top_up),
        total: sum(r => r.total_earnings),
        belowMinimum: rows.filter(r => r.is_below_minimum).length,
    };
}
