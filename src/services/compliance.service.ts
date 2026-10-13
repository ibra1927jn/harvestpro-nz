import { NZ_DEFAULT_PIECE_RATE } from '@/constants/nz-law';
import { NZ_MINIMUM_WAGE_2026 } from '@/constants/nz-law';

// B6-01 FIX: Use authoritative NZ law constants — NZ Minimum Wage Order 2026: $23.95/hr
// Operational rates are configured per job type in wage_rates table (Admin → Settings → Wage Rates)
const NZ_MINIMUM_WAGE = NZ_MINIMUM_WAGE_2026;

import { nowNZST } from '@/utils/nzst';
import { edgeFunctionsRepository } from '@/repositories/edge-functions.repository';
import { logger } from '@/utils/logger';

/**
 * Break type definitions per NZ law
 */
export type BreakType = 'rest' | 'meal' | 'hydration';

/**
 * Compliance status for a picker
 */
export interface ComplianceStatus {
  pickerId: string;
  isCompliant: boolean;
  violations: ComplianceViolation[];
  nextBreakDue?: {
    type: BreakType;
    dueAt: Date;
    overdue: boolean;
    minutesOverdue?: number;
  };
  wageCompliance: {
    isCompliant: boolean;
    effectiveHourlyRate: number;
    minimumWage: number;
    shortfall?: number;
  };
  workHours: {
    consecutiveMinutes: number;
    totalToday: number;
    maxRecommended: number;
    needsBreak: boolean;
  };
}

/**
 * Compliance violation record
 */
export interface ComplianceViolation {
  type:
    | 'break_overdue'
    | 'wage_below_minimum'
    | 'excessive_hours'
    | 'hydration_reminder'
    /** BUG-07: cubetas registradas sin check-in */
    | 'scans_without_attendance'
    /** BUG-08: horas de asistencia sin actividad de cosecha */
    | 'attendance_without_scans';
  severity: 'low' | 'medium' | 'high';
  message: string;
  details?: Record<string, unknown>;
  occurredAt: Date;
}

/**
 * NZ Employment law break requirements
 */
export const NZ_BREAK_REQUIREMENTS = {
  REST_BREAK_INTERVAL_MINUTES: 120, // 10min break every 2 hours
  REST_BREAK_DURATION_MINUTES: 10,
  MEAL_BREAK_INTERVAL_MINUTES: 240, // 30min break every 4 hours
  MEAL_BREAK_DURATION_MINUTES: 30,
  HYDRATION_REMINDER_INTERVAL_MINUTES: 45, // Field work recommendation
  MAX_CONSECUTIVE_WORK_HOURS: 10,
  RECOMMENDED_MAX_DAILY_HOURS: 12,
} as const;

// NZ_MINIMUM_WAGE is imported from nz-law.ts at top of file — B6-01 fix

// =============================================
// BREAK COMPLIANCE
// =============================================

/**
 * Calculate when next break is due
 */
export function calculateNextBreakDue(
  lastBreakAt: Date | null,
  breakType: BreakType,
  workStartTime: Date
): Date {
  const baseTime = lastBreakAt || workStartTime;

  let intervalMinutes: number;
  switch (breakType) {
    case 'rest':
      intervalMinutes = NZ_BREAK_REQUIREMENTS.REST_BREAK_INTERVAL_MINUTES;
      break;
    case 'meal':
      intervalMinutes = NZ_BREAK_REQUIREMENTS.MEAL_BREAK_INTERVAL_MINUTES;
      break;
    case 'hydration':
      intervalMinutes = NZ_BREAK_REQUIREMENTS.HYDRATION_REMINDER_INTERVAL_MINUTES;
      break;
    default:
      intervalMinutes = NZ_BREAK_REQUIREMENTS.REST_BREAK_INTERVAL_MINUTES;
  }

  return new Date(baseTime.getTime() + intervalMinutes * 60 * 1000);
}

/**
 * Check if a break is overdue
 */
export function isBreakOverdue(
  lastBreakAt: Date | null,
  breakType: BreakType,
  workStartTime: Date
): {
  overdue: boolean;
  minutesOverdue: number;
  dueAt: Date;
} {
  // 🔧 L7: Use NZST time, not UTC — prevents 12-13h error in break checks
  const now = new Date(nowNZST());
  const dueAt = calculateNextBreakDue(lastBreakAt, breakType, workStartTime);
  const overdue = now > dueAt;
  const minutesOverdue = overdue ? Math.floor((now.getTime() - dueAt.getTime()) / 60000) : 0;

  return { overdue, minutesOverdue, dueAt };
}

/**
 * Get required break duration in minutes
 */
export function getRequiredBreakDuration(breakType: BreakType): number {
  switch (breakType) {
    case 'rest':
      return NZ_BREAK_REQUIREMENTS.REST_BREAK_DURATION_MINUTES;
    case 'meal':
      return NZ_BREAK_REQUIREMENTS.MEAL_BREAK_DURATION_MINUTES;
    case 'hydration':
      return 5; // Quick hydration break
    default:
      return NZ_BREAK_REQUIREMENTS.REST_BREAK_DURATION_MINUTES;
  }
}

// =============================================
// WAGE COMPLIANCE
// =============================================

/**
 * Calculate effective hourly rate for piece-rate worker
 */
export function calculateEffectiveHourlyRate(
  bucketCount: number,
  hoursWorked: number,
  pieceRate: number = NZ_DEFAULT_PIECE_RATE
): number {
  if (hoursWorked <= 0) return 0;
  return (bucketCount * pieceRate) / hoursWorked;
}

/**
 * Check if piece-rate earnings meet minimum wage
 * @param minWage — optional configurable min wage from settings (defaults to NZ_MINIMUM_WAGE)
 */
export function checkWageCompliance(
  bucketCount: number,
  hoursWorked: number,
  pieceRate: number = NZ_DEFAULT_PIECE_RATE,
  minWage: number = NZ_MINIMUM_WAGE
): {
  isCompliant: boolean;
  effectiveHourlyRate: number;
  minimumWage: number;
  shortfall: number;
  topUpRequired: number;
} {
  const effectiveRate = calculateEffectiveHourlyRate(bucketCount, hoursWorked, pieceRate);
  const isCompliant = effectiveRate >= minWage;
  const shortfall = isCompliant ? 0 : minWage - effectiveRate;

  // Calculate top-up required to meet minimum wage
  const earnedAmount = bucketCount * pieceRate;
  const minimumRequired = hoursWorked * minWage;
  const topUpRequired = Math.max(0, minimumRequired - earnedAmount);

  return {
    isCompliant,
    effectiveHourlyRate: Math.round(effectiveRate * 100) / 100,
    minimumWage: minWage,
    shortfall: Math.round(shortfall * 100) / 100,
    topUpRequired: Math.round(topUpRequired * 100) / 100,
  };
}

/**
 * Calculate minimum buckets needed per hour to earn minimum wage
 * @param minWage — optional configurable min wage from settings (defaults to NZ_MINIMUM_WAGE)
 */
export function getMinimumBucketsPerHour(
  pieceRate: number = NZ_DEFAULT_PIECE_RATE,
  minWage: number = NZ_MINIMUM_WAGE
): number {
  // Redondeo hacia arriba a 1 decimal; se quita el ruido de coma flotante antes
  // (24.60 / 6 = 4.1 exacto daba 4.1000000000000005 → 4.2)
  return Math.ceil(Number(((minWage / pieceRate) * 10).toFixed(9))) / 10;
}

// =============================================
// WORK HOURS COMPLIANCE
// =============================================

/**
 * Check work hours compliance
 */
export function checkWorkHoursCompliance(
  consecutiveMinutes: number,
  totalMinutesToday: number
): {
  needsBreak: boolean;
  maxRecommendedReached: boolean;
  warning?: string;
} {
  const maxConsecutiveMinutes = NZ_BREAK_REQUIREMENTS.MAX_CONSECUTIVE_WORK_HOURS * 60;
  const maxDailyMinutes = NZ_BREAK_REQUIREMENTS.RECOMMENDED_MAX_DAILY_HOURS * 60;

  const needsBreak = consecutiveMinutes >= 110; // 10 minutes before 2-hour mark
  const maxRecommendedReached = totalMinutesToday >= maxDailyMinutes;

  let warning: string | undefined;
  if (consecutiveMinutes >= maxConsecutiveMinutes) {
    warning = `Worker has been working ${Math.round(consecutiveMinutes / 60)} hours without a mandatory break`;
  } else if (maxRecommendedReached) {
    warning = `Worker has exceeded recommended ${NZ_BREAK_REQUIREMENTS.RECOMMENDED_MAX_DAILY_HOURS} hours for the day`;
  }

  return { needsBreak, maxRecommendedReached, warning };
}

// =============================================
// FULL COMPLIANCE CHECK
// =============================================

/**
 * Perform full compliance check for a picker
 */
export function checkPickerCompliance(input: {
  pickerId: string;
  bucketCount: number;
  hoursWorked: number;
  consecutiveMinutesWorked: number;
  totalMinutesToday: number;
  lastRestBreakAt: Date | null;
  lastMealBreakAt: Date | null;
  lastHydrationAt: Date | null;
  workStartTime: Date;
  /** Resultado del cálculo único (harvestMetrics/pay.ts dayPay); si se pasa, manda */
  pay?: { belowMinimum: boolean; pieceHourlyRate: number; minWageApplied: number; topUp: number };
}): ComplianceStatus {
  // 🔧 L17: Use NZST, not UTC — violation timestamps must match NZST break checks
  const now = new Date(nowNZST());
  const violations: ComplianceViolation[] = [];

  // Check wage compliance
  const legacy = checkWageCompliance(input.bucketCount, input.hoursWorked);
  const wage = input.pay
    ? {
        below: input.pay.belowMinimum,
        rate: input.pay.pieceHourlyRate,
        min: input.pay.minWageApplied,
        shortfall: Math.max(0, Math.round((input.pay.minWageApplied - input.pay.pieceHourlyRate) * 100) / 100),
        topUp: input.pay.topUp,
      }
    : { below: !legacy.isCompliant, rate: legacy.effectiveHourlyRate, min: NZ_MINIMUM_WAGE, shortfall: legacy.shortfall, topUp: legacy.topUpRequired };
  if (wage.below && input.hoursWorked >= 1) {
    violations.push({
      type: 'wage_below_minimum',
      severity: 'high',
      message: `Effective rate $${wage.rate}/hr is below minimum wage $${wage.min}/hr`,
      details: { shortfall: wage.shortfall, topUpRequired: wage.topUp },
      occurredAt: now,
    });
  }

  // Check rest break compliance
  const restBreakCheck = isBreakOverdue(input.lastRestBreakAt, 'rest', input.workStartTime);
  if (restBreakCheck.overdue) {
    violations.push({
      type: 'break_overdue',
      severity: restBreakCheck.minutesOverdue > 30 ? 'high' : 'medium',
      message: `Rest break overdue by ${restBreakCheck.minutesOverdue} minutes`,
      details: { breakType: 'rest', dueAt: restBreakCheck.dueAt },
      occurredAt: now,
    });
  }

  // Check meal break compliance
  const mealBreakCheck = isBreakOverdue(input.lastMealBreakAt, 'meal', input.workStartTime);
  if (mealBreakCheck.overdue) {
    violations.push({
      type: 'break_overdue',
      severity: 'high',
      message: `Meal break overdue by ${mealBreakCheck.minutesOverdue} minutes`,
      details: { breakType: 'meal', dueAt: mealBreakCheck.dueAt },
      occurredAt: now,
    });
  }

  // Check hydration (lower severity, field work recommendation)
  const hydrationCheck = isBreakOverdue(input.lastHydrationAt, 'hydration', input.workStartTime);
  if (hydrationCheck.overdue && hydrationCheck.minutesOverdue > 15) {
    violations.push({
      type: 'hydration_reminder',
      severity: 'low',
      message: `Hydration reminder - ${hydrationCheck.minutesOverdue} minutes since last water break`,
      occurredAt: now,
    });
  }

  // Check work hours
  const hoursCheck = checkWorkHoursCompliance(
    input.consecutiveMinutesWorked,
    input.totalMinutesToday
  );
  if (hoursCheck.warning) {
    violations.push({
      type: 'excessive_hours',
      severity: 'high',
      message: hoursCheck.warning,
      occurredAt: now,
    });
  }

  // Determine next break due

  const breakChecks = [
    { type: 'rest' as BreakType, check: restBreakCheck },
    { type: 'meal' as BreakType, check: mealBreakCheck },
    { type: 'hydration' as BreakType, check: hydrationCheck },
  ];

  // Find the soonest break that's due or overdue
  const sortedBreaks = breakChecks.sort(
    (a, b) => a.check.dueAt.getTime() - b.check.dueAt.getTime()
  );
  const nextBreak = sortedBreaks[0];
  const nextBreakDue: ComplianceStatus['nextBreakDue'] = {
    type: nextBreak.type,
    dueAt: nextBreak.check.dueAt,
    overdue: nextBreak.check.overdue,
    minutesOverdue: nextBreak.check.minutesOverdue,
  };

  return {
    pickerId: input.pickerId,
    isCompliant: violations.filter(v => v.severity !== 'low').length === 0,
    violations,
    nextBreakDue,
    wageCompliance: {
      isCompliant: !wage.below,
      effectiveHourlyRate: wage.rate,
      minimumWage: wage.min,
      shortfall: wage.shortfall,
    },
    workHours: {
      consecutiveMinutes: input.consecutiveMinutesWorked,
      totalToday: input.totalMinutesToday,
      maxRecommended: NZ_BREAK_REQUIREMENTS.RECOMMENDED_MAX_DAILY_HOURS * 60,
      needsBreak: hoursCheck.needsBreak,
    },
  };
}

// =============================================
// EXPORTS
// =============================================

/**
 * Fetch compliance status from server-side Edge Function (authoritative).
 * Use this for display and enforcement — the server-side check cannot be bypassed.
 */
async function fetchComplianceFromServer(orchardId: string, pickerIds: string[]) {
  try {
    const { data, error } = await edgeFunctionsRepository.invoke<{
      orchard_id: string;
      date: string;
      pickers: Array<{
        picker_id: string;
        picker_name: string;
        is_compliant: boolean;
        violations: Array<{
          type: string;
          severity: string;
          message: string;
          details: Record<string, unknown>;
        }>;
        metrics: {
          hours_worked: number;
          buckets_today: number;
          effective_hourly_rate: number;
          minimum_wage: number;
          is_below_minimum: boolean;
          top_up_required: number;
        };
      }>;
      summary: {
        total_checked: number;
        compliant: number;
        with_violations: number;
        total_violations: number;
      };
    }>('check-compliance', {
      orchard_id: orchardId,
      picker_ids: pickerIds,
    });

    if (error) throw new Error(error.message);
    return data;
  } catch (err) {
    logger.error('[Compliance] Server-side check failed:', err);
    throw err;
  }
}

export const complianceService = {
  // Break compliance (local — for offline/UI)
  calculateNextBreakDue,
  isBreakOverdue,
  getRequiredBreakDuration,

  // Wage compliance (local — for offline/UI)
  calculateEffectiveHourlyRate,
  checkWageCompliance,
  getMinimumBucketsPerHour,

  // Work hours (local)
  checkWorkHoursCompliance,

  // Full check — local (offline)
  checkPickerCompliance,

  // Server-side check (authoritative)
  fetchComplianceFromServer,

  // Constants
  NZ_BREAK_REQUIREMENTS,
  NZ_MINIMUM_WAGE,
};

export default complianceService;

