/**
 * timesheetLogic — lógica pura de las hojas de horas (sin Supabase).
 *
 * Reparto de horas del día por tramo, fila de hoja de horas, asignación de
 * cubetas a tramos y fila de la hoja diaria con pago. La usa payroll.service.
 */
import { shiftHours, shiftNeedsReview, correctionCovers, dayPay, PAY_RULES, minWageFloorOn, type PayDay } from '@/services/harvestMetrics/pay';
import type { DailyTimesheetRecord, TimesheetEntry } from './payroll.types';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Horas por encima de las cuales una hoja de horas pide revisión */
const REVIEW_HOURS_THRESHOLD = PAY_RULES.maxUnreviewedShiftHours;

/**
 * Horas de cada tramo cerrado = su parte de las horas pagables del día
 * (proporcional a tiempo bruto + trayecto). Los tramos vienen ordenados por
 * entrada, igual que los segmentos del día.
 */
export function splitDayHoursBySegment(
  closedShiftIds: string[],
  day: Pick<PayDay, 'hours' | 'segments'> | undefined
): Map<string, number> {
  const segs = day?.segments ?? [];
  const weight = segs.reduce((s, x) => s + x.grossHours + x.travelHours, 0);
  const out = new Map<string, number>();
  closedShiftIds.forEach((id, i) => {
    const seg = segs[i];
    const share = seg && weight > 0 ? (seg.grossHours + seg.travelHours) / weight : 0;
    out.set(id, round2((day?.hours ?? 0) * share));
  });
  return out;
}

export interface AttendanceForTimesheet {
  id: string;
  picker_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  break_start?: string | null;
  break_minutes?: number | null;
  verified_by: string | null;
  /** Rechazada por nómina/manager (vuelve a pendiente al corregirla) */
  rejected_at?: string | null;
  rejection_reason?: string | null;
  orchard_id: string;
  updated_at?: string;
  /** Corregida a mano (manage-attendance correct): un tramo largo ya está revisado */
  corrected_at?: string | null;
}

/**
 * Fila de hoja de horas. Horas = su parte del día (cálculo único); si no hay
 * cálculo del día, las del propio tramo. Turno sin salida → 0 h hasta que se
 * cierre. Revisar: turno abierto de un día pasado, o más de 14 h. Más de 14 h
 * sin corregir (abierto o cerrado) = long_shift: no se aprueba y se pagan 14 h.
 */
export function buildTimesheetEntry(
  a: AttendanceForTimesheet,
  pickerName: string | undefined,
  hoursFromDay: number | undefined,
  todayNZ: string,
  now: Date = new Date()
): TimesheetEntry {
  // Solo cuenta la corrección hecha después de la salida (correctionCovers)
  const corrected = correctionCovers(a.corrected_at, a.check_out);
  const shift = a.check_out && hoursFromDay === undefined
    ? shiftHours({ checkIn: a.check_in, checkOut: a.check_out, breakStart: a.break_start, breakMinutes: a.break_minutes, corrected })
    : null;
  const longShift = shiftNeedsReview({ checkIn: a.check_in, checkOut: a.check_out, corrected }, now);
  const hoursWorked = a.check_out ? (hoursFromDay ?? shift?.hours ?? 0) : 0;
  const staleOpen = !!a.check_in && !a.check_out && a.date < todayNZ;
  return {
    id: a.id,
    picker_id: a.picker_id,
    picker_name: pickerName || 'Unknown',
    date: a.date,
    check_in: a.check_in,
    check_out: a.check_out,
    break_start: a.break_start ?? null,
    break_minutes: a.break_minutes ?? PAY_RULES.mealBreakMinutes,
    hours_worked: hoursWorked,
    verified_by: a.verified_by,
    is_verified: !!a.verified_by,
    is_rejected: !a.verified_by && !!a.rejected_at,
    rejection_reason: a.rejection_reason ?? null,
    orchard_id: a.orchard_id,
    updated_at: a.updated_at,
    requires_review: staleOpen || longShift || hoursWorked > REVIEW_HOURS_THRESHOLD,
    ...(longShift ? { long_shift: true } : {}),
  };
}

/** Tramos de cada persona ordenados por entrada */
export function groupSegmentsByPicker<T extends { picker_id: string; check_in: string | null }>(
  timesheets: T[]
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const ts of timesheets) {
    const list = map.get(ts.picker_id) ?? [];
    list.push(ts);
    map.set(ts.picker_id, list);
  }
  for (const list of map.values()) list.sort((a, b) => (a.check_in ?? '').localeCompare(b.check_in ?? ''));
  return map;
}

export interface DayBucket {
  picker_id: string;
  orchard_id: string | null;
  variety: string | null;
  scanned_at: string;
  quality_grade: string | null;
}

export interface SegmentBuckets {
  total: number;
  rejected: number;
  earnings: number;
  grades: Record<string, number>;
}

/**
 * Cada cubeta va al tramo en que se recogió (una persona puede salir y
 * volver el mismo día): el último tramo que empezó antes de escanearla; si
 * ninguno, el primero. Las rechazadas no cobran.
 */
export function assignBucketsToSegments(
  buckets: DayBucket[],
  segmentsByPicker: Map<string, { id: string; check_in: string | null }[]>,
  rateOf: (b: DayBucket) => number
): Map<string, SegmentBuckets> {
  const bySegment = new Map<string, SegmentBuckets>();
  for (const br of buckets) {
    const segs = segmentsByPicker.get(br.picker_id);
    if (!segs?.length) continue;
    const seg = [...segs].reverse().find(s => (s.check_in ?? '') <= br.scanned_at) ?? segs[0];
    const entry = bySegment.get(seg.id) || { total: 0, rejected: 0, earnings: 0, grades: {} };
    if (br.quality_grade === 'reject') {
      entry.rejected++;
    } else {
      entry.total++;
      entry.earnings += rateOf(br);
    }
    const grade = br.quality_grade || 'ungraded';
    entry.grades[grade] = (entry.grades[grade] || 0) + 1;
    bySegment.set(seg.id, entry);
  }
  return bySegment;
}

export interface DayTopUp {
  topUp: number;
  belowMinimum: boolean;
  minimum: number;
}

/**
 * Complemento al mínimo del día de una persona en este huerto. Con el día
 * completo (todos sus huertos) a este huerto le toca su parte; sin él, se
 * calcula solo con lo de este huerto.
 */
export function dayTopUpFor(params: {
  day: Pick<PayDay, 'byOrchard' | 'belowMinimum' | 'isPublicHoliday'> | undefined;
  orchardId: string;
  hours: number;
  minWageRate: number;
  pieceRate: number;
  localBuckets: number;
  localEarnings: number;
  isPublicHoliday: boolean;
  /** Día (YYYY-MM-DD): decide el salario mínimo legal. Sin fecha, el de hoy */
  date?: string;
}): DayTopUp {
  const { day, orchardId, hours, minWageRate, pieceRate, localBuckets, localEarnings, isPublicHoliday, date } = params;
  const share = day?.byOrchard.find(o => o.orchardId === orchardId);
  if (day && share) {
    const multiplier = day.isPublicHoliday ? PAY_RULES.publicHolidayMultiplier : 1;
    const minimum = round2(hours * Math.max(minWageRate, minWageFloorOn(date)) * multiplier);
    return { topUp: share.topUp, belowMinimum: day.belowMinimum, minimum };
  }
  const p = dayPay({ buckets: localBuckets, pieceEarnings: localEarnings, hours, pieceRate, minWage: minWageRate, isPublicHoliday, date });
  return { topUp: p.topUp, belowMinimum: p.belowMinimum, minimum: p.minimumEarnings };
}

/**
 * Fila de la hoja diaria con producción y pago. El complemento y el mínimo
 * se muestran solo en el último tramo del día de la persona; en festivo las
 * cubetas van a tiempo y medio (Holidays Act s.50).
 */
export function buildDailyRecord(
  ts: TimesheetEntry,
  info: SegmentBuckets | undefined,
  isLastSegment: boolean,
  day: DayTopUp | undefined,
  pieceRate: number,
  isPublicHoliday: boolean
): DailyTimesheetRecord {
  const b = info || { total: 0, rejected: 0, earnings: 0, grades: {} };
  const pieceEarnings = round2(b.earnings);
  const topUp = isLastSegment ? (day?.topUp ?? 0) : 0;
  const holidayPremium = isPublicHoliday ? round2(pieceEarnings * (PAY_RULES.publicHolidayMultiplier - 1)) : 0;
  const belowMinimum = day?.belowMinimum ?? false;
  return {
    ...ts,
    buckets_total: b.total,
    buckets_rejected: b.rejected,
    quality_grades: b.grades,
    piece_rate: pieceRate,
    piece_earnings: pieceEarnings,
    minimum_required: isLastSegment ? (day?.minimum ?? 0) : 0,
    top_up: topUp,
    total_earnings: round2(pieceEarnings + holidayPremium + topUp),
    is_below_minimum: belowMinimum,
    pay_type: belowMinimum ? 'hourly_topup' : 'piece_rate',
  };
}
