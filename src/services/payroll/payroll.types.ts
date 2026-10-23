/**
 * Tipos de nómina: resultado de calculate-payroll y hojas de horas.
 */
import type { PayDay } from '@/services/harvestMetrics/pay';

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
  /** Festivo: media parte extra de lo ganado por cubetas (Holidays Act s.50) */
  holiday_premium?: number;
  hourly_rate: number;
  minimum_required: number;
  top_up_required: number;
  total_earnings: number;
  /** Días con horas estimadas (turno sin cerrar): revisar antes de pagar */
  estimated_days?: number;
  is_below_minimum: boolean;
  /** Detalle día a día: huerto y horas de cada tramo, cubetas por variedad, pago */
  days?: PayDay[];
}

export interface PayrollResult {
  orchard_id: string;
  /** Semana cerrada: cifras = foto guardada al cerrar (lo que se pagó) */
  closed?: { closed_at: string | null; closed_by: string | null };
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
    /** Días-picker con horas estimadas en el periodo */
    total_estimated_days?: number;
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
  /** Rechazada (no aprobada): la corrige el jefe de equipo / manager */
  is_rejected?: boolean;
  rejection_reason?: string | null;
  orchard_id: string;
  updated_at?: string; // For optimistic locking on approval
  requires_review?: boolean; // Turno abierto de un día pasado o > 14 h
  /**
   * Más de 14 h (abierto o cerrado) sin corregir: no se aprueba hasta corregirlo
   * y solo se pagan 14 h (PAY_RULES.maxUnreviewedShiftHours)
   */
  long_shift?: boolean;
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
