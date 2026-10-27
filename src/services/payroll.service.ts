/**
 * Payroll Service - Cliente para Edge Function de cálculo de nómina
 *
 * Este servicio REEMPLAZA la lógica local de calculations.service.ts
 * para garantizar que los cálculos se hagan en el servidor (inmutables)
 */

import { logger } from '@/utils/logger';
import { payrollRepository } from '@/repositories/payroll.repository';
import { edgeFunctionsRepository } from '@/repositories/edge-functions.repository';
import { supabase } from '@/services/supabase';
import { todayNZST, nzMidnight, nzEndOfDay } from '@/utils/nzst';
import { PayrollResultSchema, validateResponse } from '@/schemas/api.schemas';
import { analytics } from '@/config/analytics';
import { payForRange, correctionCovers, payWeekOf, pieceRateOn, nzDateOf, isNZPublicHoliday, PAY_RULES, type PayDay } from '@/services/harvestMetrics/pay';
import type { DailyTimesheetRecord, PayrollResult, TimesheetEntry } from './payroll/payroll.types';
import {
  assignBucketsToSegments,
  buildDailyRecord,
  buildTimesheetEntry,
  dayTopUpFor,
  groupSegmentsByPicker,
  splitDayHoursBySegment,
  splitOrchardDayBySegment,
  type DayBucket,
  type DayTopUp,
} from './payroll/timesheetLogic';
import { pieceRatesRepository } from '@/repositories/piece-rates.repository';
import { fetchAllRows } from '@/utils/fetchAllRows';

// Tipos en payroll/payroll.types.ts; se re-exportan para no cambiar los imports
export type { PickerBreakdown, PayrollResult, TimesheetEntry, DailyTimesheetRecord } from './payroll/payroll.types';

/**
 * Día completo de cada persona (todos sus tramos y cubetas de cualquier huerto)
 * con el cálculo único. Las hojas de horas de un huerto muestran SU parte:
 * horas del día repartidas por tramo (tiempo + mitad de trayectos, un solo
 * descanso), igual que Nómina y el coste por huerto. Los tramos sin cerrar no
 * cuentan hasta que se cierren.
 */
async function computeDayOfPeople(pickerIds: string[], date: string, minWage: number = PAY_RULES.minWageFloor) {
  // Limites del dia NZ con el desfase de cada extremo (el dia del cambio de hora difieren)
  const { shifts, buckets } = await payrollRepository.fetchDayOfPeople(
    pickerIds, date, nzMidnight(date), nzEndOfDay(date),
  );
  // Precio de ESE día de cada variedad y huerto (piece_rates)
  const { rates, orchardFallbacks } = await pieceRatesRepository.loadForPay(date, date)
    .catch(() => ({ rates: [], orchardFallbacks: {} as Record<string, number> }));
  const holiday = isNZPublicHoliday(date);
  const byPicker = new Map<string, { day: PayDay | undefined; segHours: Map<string, number> }>();
  for (const id of pickerIds) {
    const closed = shifts.filter(s => s.picker_id === id && s.check_in && s.check_out)
      .sort((a, b) => (a.check_in ?? '').localeCompare(b.check_in ?? ''));
    const [range] = payForRange({
      attendance: closed.map(s => ({ pickerId: id, date, orchardId: s.orchard_id, checkIn: s.check_in, checkOut: s.check_out, breakStart: s.break_start, breakMinutes: s.break_minutes, corrected: correctionCovers(s.corrected_at, s.check_out) })),
      buckets: buckets.filter(b => b.picker_id === id).map(b => ({
        pickerId: id, scannedAt: b.scanned_at, qualityGrade: b.quality_grade, orchardId: b.orchard_id, variety: b.variety,
        pieceRate: pieceRateOn(rates, b.orchard_id, b.variety, nzDateOf(b.scanned_at), orchardFallbacks[b.orchard_id ?? ''] ?? 6.5),
      })),
      pieceRate: 6.5,
      minWage: Math.max(minWage, PAY_RULES.minWageFloor),
      isPublicHoliday: () => holiday,
    });
    const day = range?.dayDetails.find(d => d.date === date);
    // Horas de cada tramo = su parte de las horas pagables del día
    const segHours = splitDayHoursBySegment(closed.map(s => s.id), day);
    byPicker.set(id, { day, segHours });
  }
  return byPicker;
}

/** Día `date` de cada persona según calculate-payroll; null si el servidor falla */
async function serverDaysOf(result: Promise<PayrollResult>, date: string): Promise<Map<string, PayDay> | null> {
  try {
    const { picker_breakdown } = await result;
    const out = new Map<string, PayDay>();
    for (const p of picker_breakdown) {
      const day = p.days?.find(d => d.date === date);
      if (day) out.set(p.picker_id, day);
    }
    return out;
  } catch (e) {
    logger.warn('[Payroll] calculate-payroll unavailable for the daily sheet; local top-up', e);
    return null;
  }
}

/**
 * Hojas de horas de un huerto en un día. Las horas de cada tramo son su parte
 * de las horas pagables del día de la persona, calculado con el día ENTERO:
 * - del servidor (calculate-payroll, vista del huerto): el manager solo lee los
 *   fichajes de SU huerto (migración 20261027070000) y quien rota tiene parte
 *   del día en otro; el servidor reparte con el día entero y solo devuelve lo
 *   de aquí;
 * - sin servidor (o sin esa persona), el cálculo local con lo que se pueda
 *   leer: para un manager, solo este huerto (el reparto de un día partido
 *   sale aproximado, nunca se rompe).
 */
async function timesheetsOf(
  orchardId: string,
  targetDate: string,
  loadServerDays: () => Promise<Map<string, PayDay> | null>,
): Promise<TimesheetEntry[]> {
  const { data: attendance, error } = await payrollRepository.fetchTimesheetAttendance(
    orchardId,
    targetDate
  );

  if (error) {
    logger.error('[Payroll] Error fetching timesheets:', error);
    return [];
  }

  const pickerIds = [...new Set(attendance.map(a => a.picker_id))];
  const [pickerNames, serverDays] = await Promise.all([
    payrollRepository.fetchPickerNames(pickerIds),
    pickerIds.length > 0 ? loadServerDays() : Promise.resolve(null),
  ]);
  const segHoursOf = new Map<string, Map<string, number>>();
  for (const id of pickerIds) {
    const closed = attendance.filter(a => a.picker_id === id && a.check_in && a.check_out);
    const split = splitOrchardDayBySegment(closed, serverDays?.get(id));
    if (split) segHoursOf.set(id, split);
  }
  const missing = pickerIds.filter(id => !segHoursOf.has(id));
  const local = missing.length > 0 ? await computeDayOfPeople(missing, targetDate).catch(() => null) : null;
  for (const id of missing) {
    const hours = local?.get(id)?.segHours;
    if (hours) segHoursOf.set(id, hours);
  }

  const today = todayNZST();
  return (attendance || []).map(a => {
    const entry = buildTimesheetEntry(a, pickerNames[a.picker_id], segHoursOf.get(a.picker_id)?.get(a.id), today);
    if (entry.requires_review) {
      const staleOpen = !!a.check_in && !a.check_out;
      logger.warn(`[Payroll] Picker ${a.picker_id} timesheet needs review (${staleOpen ? 'no check-out' : entry.long_shift ? 'over 14 h, not corrected' : `${entry.hours_worked}h`})`);
    }
    return entry;
  });
}

/** Hojas por llamada en «Aprobar todas» (el servidor admite hasta 500) */
export const TIMESHEET_BATCH_SIZE = 200;

export const payrollService = {
  /**
   * Calcular nómina usando Edge Function (servidor)
   *
   * @param orchardId - ID del orchard
   * @param startDate - Fecha inicio (YYYY-MM-DD)
   * @param endDate - Fecha fin (YYYY-MM-DD)
   * @returns PayrollResult con cálculos completos
   */
  async calculatePayroll(
    /** undefined = toda la empresa (la gente rota entre huertos) */
    orchardId: string | undefined,
    startDate: string,
    endDate: string
  ): Promise<PayrollResult> {
    // 🔧 L3: Via repository — guarantees automatic JWT refresh
    const data = await payrollRepository.invokeCalculatePayroll(orchardId, startDate, endDate);
    return validateResponse(PayrollResultSchema, data, 'calculatePayroll');
  },

  /** Cerrar la semana de pago (lunes = weekStart): guarda la foto y bloquea cambios */
  async closePayWeek(weekStart: string) {
    return payrollRepository.invokePayWeek({ action: 'close', week_start: weekStart });
  },

  /** Reabrir una semana cerrada (motivo obligatorio, queda auditado) */
  async reopenPayWeek(weekStart: string, reason: string) {
    return payrollRepository.invokePayWeek({ action: 'reopen', week_start: weekStart, reason });
  },

  /**
   * Calcular nómina para el día actual
   */
  async calculateToday(orchardId: string): Promise<PayrollResult> {
    const today = todayNZST();
    return this.calculatePayroll(orchardId, today, today);
  },

  /**
   * Calcular nómina para la semana actual
   */
  async calculateThisWeek(orchardId: string): Promise<PayrollResult> {
    // Lunes de la semana NZ hasta hoy (misma semana de pago que Nómina)
    const endDate = todayNZST();
    const startDate = payWeekOf(endDate).start;
    return this.calculatePayroll(orchardId, startDate, endDate);
  },

  /**
   * Obtener resumen simplificado para dashboard
   */
  async getDashboardSummary(orchardId: string) {
    const result = await this.calculateToday(orchardId);

    return {
      totalBuckets: result.summary.total_buckets,
      totalCost: result.summary.total_earnings,
      workersAtRisk: result.compliance.workers_below_minimum,
      complianceRate: result.compliance.compliance_rate,
    };
  },

  /**
   * Fetch timesheets from daily_attendance (Phase 2)
   */
  async fetchTimesheets(orchardId: string, date?: string): Promise<TimesheetEntry[]> {
    const targetDate = date || todayNZST();
    return timesheetsOf(orchardId, targetDate, () => serverDaysOf(this.calculatePayroll(orchardId, targetDate, targetDate), targetDate));
  },

  /**
   * Approve timesheet — via Edge Function (server-side, with optimistic locking).
   * Aprueba quien llama (admin, payroll_admin o manager de ese huerto).
   */
  async approveTimesheet(
    attendanceId: string,
    verifiedBy: string,
    currentUpdatedAt?: string
  ): Promise<{
    success: boolean;
    attendance_id: string;
    updated_at: string;
  }> {
    const { data, error } = await edgeFunctionsRepository.invoke<{
      success: boolean;
      attendance_id: string;
      picker_id: string;
      verified_by: string;
      updated_at: string;
    }>('approve-timesheet', {
      attendance_id: attendanceId,
      verified_by: verifiedBy,
      current_updated_at: currentUpdatedAt,
    });

    if (error) throw new Error(error.message);
    // 📊 PostHog: Track timesheet approval
    analytics.trackTimesheetAction('approve', attendanceId);
    return data!;
  },

  /**
   * Aprobar varias hojas de una vez («Aprobar todas»): una llamada por lote.
   * Cada una se aprueba en el servidor igual que sola; vuelve cuáles salieron.
   */
  async approveTimesheets(
    items: { id: string; updated_at?: string }[]
  ): Promise<{ approved: { id: string; updated_at?: string }[]; failed: { id: string; reason: string }[] }> {
    const approved: { id: string; updated_at?: string }[] = [];
    const failed: { id: string; reason: string }[] = [];
    for (let i = 0; i < items.length; i += TIMESHEET_BATCH_SIZE) {
      const chunk = items.slice(i, i + TIMESHEET_BATCH_SIZE);
      const { data, error } = await edgeFunctionsRepository.invoke<{
        success: boolean;
        approved: number;
        results: { attendance_id: string; status: 'approved' | 'conflict' | 'error'; updated_at?: string; reason?: string }[];
      }>('approve-timesheet', {
        items: chunk.map(it => ({ attendance_id: it.id, current_updated_at: it.updated_at })),
      });
      if (error || !data) {
        failed.push(...chunk.map(it => ({ id: it.id, reason: error?.message ?? 'no response' })));
        continue;
      }
      for (const r of data.results) {
        if (r.status === 'approved') approved.push({ id: r.attendance_id, updated_at: r.updated_at });
        else failed.push({ id: r.attendance_id, reason: r.reason ?? r.status });
      }
    }
    analytics.trackTimesheetAction('approve', `batch:${approved.length}`);
    return { approved, failed };
  },

  /**
   * Rechazar una hoja de horas — misma Edge Function (decision 'reject').
   * Vuelve al jefe de equipo / manager para corregirla; al corregirla queda
   * otra vez pendiente. Semana de pago cerrada → error PAY_WEEK_CLOSED.
   */
  async rejectTimesheet(
    attendanceId: string,
    currentUpdatedAt?: string,
    reason?: string
  ): Promise<{ success: boolean; attendance_id: string; updated_at: string }> {
    const { data, error } = await edgeFunctionsRepository.invoke<{
      success: boolean;
      attendance_id: string;
      rejected_by: string;
      updated_at: string;
    }>('approve-timesheet', {
      attendance_id: attendanceId,
      decision: 'reject',
      current_updated_at: currentUpdatedAt,
      ...(reason ? { reason } : {}),
    });

    if (error) throw new Error(error.message);
    analytics.trackTimesheetAction('reject', attendanceId);
    return data!;
  },

  /**
   * Generar timesheet diario completo para firma de fin de dia.
   * Agrega: horas trabajadas (attendance), buckets escaneados, grades de calidad,
   * piece rate vs hourly, y total earnings.
   */
  async generateDailyTimesheet(
    orchardId: string,
    date?: string
  ): Promise<DailyTimesheetRecord[]> {
    const targetDate = date || todayNZST();

    // 1. Obtener attendance (horas trabajadas). El día entero de cada persona
    //    sale del cálculo de nómina (servidor), una sola vez para horas y complemento
    let serverDaysPromise: Promise<Map<string, PayDay> | null> | null = null;
    const loadServerDays = () => (serverDaysPromise ??= serverDaysOf(this.calculatePayroll(orchardId, targetDate, targetDate), targetDate));
    const timesheets = await timesheetsOf(orchardId, targetDate, loadServerDays);

    if (timesheets.length === 0) return [];

    // 2. Obtener bucket_records del dia (excluir rejected)
    // Límites del día en hora NZ (no la zona del navegador)
    const startISO = nzMidnight(targetDate);
    const endISO = nzEndOfDay(targetDate);

    // Paginado: un huerto hace ~3.000 cubetas al día y PostgREST corta en 1000
    // (la hoja del día pagaba sobre un tercio de las cubetas; prueba de carga 2026-10-21)
    const bucketRecords = await fetchAllRows<DayBucket>((from, to) =>
      supabase
        .from('bucket_records')
        .select('picker_id, orchard_id, variety, scanned_at, quality_grade')
        .eq('orchard_id', orchardId)
        .is('deleted_at', null)
        .gte('scanned_at', startISO)
        .lte('scanned_at', endISO)
        .order('id')
        .range(from, to)
    ).catch(() => [] as DayBucket[]);

    // 3. Obtener settings (piece_rate, min_wage_rate) y precios por variedad
    const { data: settings } = await supabase
      .from('harvest_settings')
      .select('piece_rate, min_wage_rate')
      .eq('orchard_id', orchardId)
      .single();

    const storedPieceRate = Number(settings?.piece_rate ?? 6.5);
    const minWageRate = settings?.min_wage_rate ?? PAY_RULES.minWageFloor;
    // Precio de ESE día (piece_rates): cambiarlo hoy no reescribe la hoja de ayer
    const dayRates = await pieceRatesRepository.loadRange(targetDate, targetDate).catch(() => []);
    const pieceRate = pieceRateOn(dayRates, orchardId, null, targetDate, storedPieceRate);
    const rateOf = (b: DayBucket) =>
      pieceRateOn(dayRates, b.orchard_id, b.variety, nzDateOf(b.scanned_at), b.orchard_id === orchardId ? storedPieceRate : pieceRate);

    // 4. Cada cubeta va al tramo en que se recogió (ver timesheetLogic)
    const segmentsByPicker = groupSegmentsByPicker(timesheets);
    const bySegment = assignBucketsToSegments((bucketRecords || []) as DayBucket[], segmentsByPicker, rateOf);

    // 5. Complemento al mínimo: se calcula con el DÍA entero de la persona
    //    (todos sus tramos y cubetas, de cualquier huerto) y a este huerto le
    //    toca su parte (según horas, igual que el coste por huerto en Nómina).
    //    Se muestra en su último tramo del día en este huerto.
    //    El día entero sale del cálculo de nómina (servidor): el manager solo lee
    //    los precios de SU huerto (migración 20261027050000) y aquí no sabría lo
    //    ganado en otro. Sin servidor (o sin esa persona), el cálculo local.
    const holiday = isNZPublicHoliday(targetDate);
    const serverDays = await loadServerDays();
    const missing = [...segmentsByPicker.keys()].filter(id => !serverDays?.has(id));
    const days = missing.length > 0
      ? await computeDayOfPeople(missing, targetDate, minWageRate).catch(() => null)
      : null;
    const dayTopUp = new Map<string, DayTopUp>();
    for (const [pickerId, segs] of segmentsByPicker) {
      dayTopUp.set(pickerId, dayTopUpFor({
        day: serverDays?.get(pickerId) ?? days?.get(pickerId)?.day,
        orchardId,
        hours: segs.reduce((s, t) => s + t.hours_worked, 0),
        minWageRate,
        pieceRate,
        localBuckets: segs.reduce((s, t) => s + (bySegment.get(t.id)?.total ?? 0), 0),
        localEarnings: segs.reduce((s, t) => s + (bySegment.get(t.id)?.earnings ?? 0), 0),
        isPublicHoliday: holiday,
        date: targetDate,
      }));
    }

    return timesheets.map(ts => {
      const segs = segmentsByPicker.get(ts.picker_id) ?? [ts];
      const isLast = segs[segs.length - 1].id === ts.id;
      return buildDailyRecord(ts, bySegment.get(ts.id), isLast, dayTopUp.get(ts.picker_id), pieceRate, holiday);
    });
  },
};

