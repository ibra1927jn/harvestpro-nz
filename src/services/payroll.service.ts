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
import { todayNZST, toNZST } from '@/utils/nzst';
import { PayrollResultSchema, validateResponse } from '@/schemas/api.schemas';
import { analytics } from '@/config/analytics';
import { shiftHours, dayPay, isNZPublicHoliday, PAY_RULES } from '@/services/harvestMetrics/pay';

export interface PickerBreakdown {
  picker_id: string;
  picker_name: string;
  buckets: number;
  hours_worked: number;
  /** Hours ordinary (Holidays Act split, optional backcompat). */
  hours_ordinary?: number;
  /** Hours trabajadas en public holidays — pagadas a 1.5x min wage. */
  hours_holiday?: number;
  /** Días alternativos en lieu owed por trabajar public holidays (Holidays Act s.60). */
  alternative_holidays_owed?: number;
  piece_rate_earnings: number;
  hourly_rate: number;
  minimum_required: number;
  top_up_required: number;
  total_earnings: number;
  is_below_minimum: boolean;
}

export interface PayrollResult {
  orchard_id: string;
  date_range: {
    start: string;
    end: string;
  };
  summary: {
    total_buckets: number;
    total_hours: number;
    total_piece_rate_earnings: number;
    total_top_up: number;
    total_earnings: number;
    /** Alternative days owed across all pickers (Holidays Act s.60). */
    total_alternative_holidays_owed?: number;
  };
  compliance: {
    workers_below_minimum: number;
    workers_total: number;
    compliance_rate: number;
  };
  picker_breakdown: PickerBreakdown[];
  settings: {
    bucket_rate: number;
    min_wage_rate: number;
  };
}

// Phase 2: Timesheet types for approval workflow
export interface TimesheetEntry {
  id: string;
  picker_id: string;
  picker_name: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  /** Hora del descanso de 30 min (no pagado) que anota el team leader */
  break_start?: string | null;
  break_minutes?: number;
  hours_worked: number;
  verified_by: string | null;
  is_verified: boolean;
  orchard_id: string;
  updated_at?: string; // For optimistic locking on approval
  requires_review?: boolean; // Turno abierto de un día pasado o > 14 h
}

/** Registro completo de timesheet diario con produccion y earnings */
export interface DailyTimesheetRecord extends TimesheetEntry {
  buckets_total: number;
  buckets_rejected: number;
  quality_grades: Record<string, number>;
  piece_rate: number;
  piece_earnings: number;
  minimum_required: number;
  top_up: number;
  total_earnings: number;
  is_below_minimum: boolean;
  pay_type: 'piece_rate' | 'hourly_topup';
}

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
    orchardId: string,
    startDate: string,
    endDate: string
  ): Promise<PayrollResult> {
    // 🔧 L3: Via repository — guarantees automatic JWT refresh
    const data = await payrollRepository.invokeCalculatePayroll(orchardId, startDate, endDate);
    return validateResponse(PayrollResultSchema, data, 'calculatePayroll');
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
    // 🔧 L1: Use Intl.DateTimeFormat for correct NZST day-of-week
    // The old +12h offset gave the wrong day during NZDT (+13, Oct-Apr).
    const endDate = todayNZST(); // today in NZST

    // Get NZST weekday via Intl (handles DST automatically)
    const nzWeekday = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Pacific/Auckland',
      weekday: 'short',
    }).format(new Date());
    const dayMap: Record<string, number> = {
      Sun: 6,
      Mon: 0,
      Tue: 1,
      Wed: 2,
      Thu: 3,
      Fri: 4,
      Sat: 5,
    };
    const daysSinceMonday = dayMap[nzWeekday] ?? 0;

    // Subtract from today's NZST date to find Monday
    const [y, m, d] = endDate.split('-').map(Number);
    const monday = new Date(y, m - 1, d);
    monday.setDate(monday.getDate() - daysSinceMonday);
    const startDate = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

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

    const { data: attendance, error } = await payrollRepository.fetchTimesheetAttendance(
      orchardId,
      targetDate
    );

    if (error) {
      logger.error('[Payroll] Error fetching timesheets:', error);
      return [];
    }

    // Get picker names
    const pickerIds = [...new Set(attendance.map(a => a.picker_id))];
    const pickerNames = await payrollRepository.fetchPickerNames(pickerIds);

    return (attendance || []).map(a => {
      // Horas = cálculo único (pay.ts): salida − entrada − descanso no pagado.
      // Turno sin salida → 0 h hasta que el team leader lo cierre.
      const shift = a.check_out
        ? shiftHours({ checkIn: a.check_in, checkOut: a.check_out, breakStart: a.break_start, breakMinutes: a.break_minutes })
        : null;
      const hoursWorked = shift?.hours ?? 0;

      // Revisar: turno abierto de un día pasado, o más de 14 h
      const staleOpen = !!a.check_in && !a.check_out && a.date < todayNZST();
      const requiresReview = staleOpen || hoursWorked > 14;
      if (requiresReview) {
        logger.warn(`[Payroll] Picker ${a.picker_id} timesheet needs review (${staleOpen ? 'no check-out' : `${hoursWorked}h`})`);
      }

      return {
        id: a.id,
        picker_id: a.picker_id,
        picker_name: pickerNames[a.picker_id] || 'Unknown',
        date: a.date,
        check_in: a.check_in,
        check_out: a.check_out,
        break_start: a.break_start ?? null,
        break_minutes: a.break_minutes ?? PAY_RULES.mealBreakMinutes,
        hours_worked: hoursWorked,
        verified_by: a.verified_by,
        is_verified: !!a.verified_by,
        orchard_id: a.orchard_id,
        updated_at: a.updated_at,
        requires_review: requiresReview, // 🔧 L14: flagged if >14h
      };
    });
  },

  /**
   * Approve timesheet — via Edge Function (server-side, with optimistic locking)
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
   * Generar timesheet diario completo para firma de fin de dia.
   * Agrega: horas trabajadas (attendance), buckets escaneados, grades de calidad,
   * piece rate vs hourly, y total earnings.
   */
  async generateDailyTimesheet(
    orchardId: string,
    date?: string
  ): Promise<DailyTimesheetRecord[]> {
    const targetDate = date || todayNZST();

    // 1. Obtener attendance (horas trabajadas)
    const timesheets = await this.fetchTimesheets(orchardId, targetDate);

    if (timesheets.length === 0) return [];

    // 2. Obtener bucket_records del dia (excluir rejected)
    // Límites del día en hora NZ (no la zona del navegador)
    const nzOffset = toNZST(new Date(`${targetDate}T12:00:00Z`)).slice(-6);
    const startISO = `${targetDate}T00:00:00${nzOffset}`;
    const endISO = `${targetDate}T23:59:59${nzOffset}`;

    const { data: bucketRecords } = await supabase
      .from('bucket_records')
      .select('picker_id, quality_grade')
      .eq('orchard_id', orchardId)
      .is('deleted_at', null)
      .gte('scanned_at', startISO)
      .lte('scanned_at', endISO);

    // 3. Obtener settings (piece_rate, min_wage_rate)
    const { data: settings } = await supabase
      .from('harvest_settings')
      .select('piece_rate, min_wage_rate')
      .eq('orchard_id', orchardId)
      .single();

    const pieceRate = settings?.piece_rate ?? 6.5;
    const minWageRate = settings?.min_wage_rate ?? PAY_RULES.minWageFloor;

    // 4. Agregar por picker: buckets (sin reject), grades, earnings
    const bucketsByPicker = new Map<string, { total: number; rejected: number; grades: Record<string, number> }>();
    (bucketRecords || []).forEach((br: { picker_id: string; quality_grade: string | null }) => {
      const entry = bucketsByPicker.get(br.picker_id) || { total: 0, rejected: 0, grades: {} };
      if (br.quality_grade === 'reject') {
        entry.rejected++;
      } else {
        entry.total++;
      }
      const grade = br.quality_grade || 'ungraded';
      entry.grades[grade] = (entry.grades[grade] || 0) + 1;
      bucketsByPicker.set(br.picker_id, entry);
    });

    // 5. Construir timesheet completo por picker
    return timesheets.map(ts => {
      const bucketInfo = bucketsByPicker.get(ts.picker_id) || { total: 0, rejected: 0, grades: {} };
      const pay = dayPay({ buckets: bucketInfo.total, hours: ts.hours_worked, pieceRate, minWage: minWageRate, isPublicHoliday: isNZPublicHoliday(targetDate) });
      return {
        ...ts,
        buckets_total: bucketInfo.total,
        buckets_rejected: bucketInfo.rejected,
        quality_grades: bucketInfo.grades,
        piece_rate: pieceRate,
        piece_earnings: pay.pieceEarnings,
        minimum_required: pay.minimumEarnings,
        top_up: pay.topUp,
        total_earnings: pay.total,
        is_below_minimum: pay.belowMinimum,
        pay_type: pay.belowMinimum ? ('hourly_topup' as const) : ('piece_rate' as const),
      };
    });
  },
};

