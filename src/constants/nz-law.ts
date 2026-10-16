/**
 * nz-law.ts — New Zealand Employment Law Constants
 *
 * ⚠️ These are LEGAL FLOOR values, NOT operational rates.
 * Operational wage rates are configured per job type in the database
 * (wage_rates table) and editable from Admin/HR Settings.
 *
 * Update this file annually when NZ Minimum Wage Orders change:
 * https://www.employment.govt.nz/hours-and-wages/pay/minimum-wage/minimum-wage-rates
 */
import { PAY_RULES } from '@/services/harvestMetrics/pay';

/**
 * Legal NZ minimum wage from 1 April 2026 (Minimum Wage Order 2026)
 */
export const NZ_MINIMUM_WAGE_2026 = PAY_RULES.minWageFloor; // $/hr

/** Legal NZ minimum wage from 1 April 2025 (Minimum Wage Order 2025) — histórico.
 *  Antes decía 23.15, que era la de 2024. */
export const NZ_MINIMUM_WAGE_2025 = 23.5; // $/hr
/** @deprecated Usa NZ_MINIMUM_WAGE_2026. Mínimo desde el 1 de abril de 2024 (histórico) */
export const NZ_MINIMUM_WAGE_2024 = 23.15;

/** Starting-out / training wage from 1 April 2026 (80% of adult minimum) */
export const NZ_STARTING_OUT_WAGE_2026 = 19.16; // $/hr
/** Starting-out / training wage from 1 April 2025 — histórico (antes 18.52, la de 2024) */
export const NZ_STARTING_OUT_WAGE_2025 = 18.8; // $/hr
/** @deprecated Usa NZ_STARTING_OUT_WAGE_2026. Desde el 1 de abril de 2024 (histórico) */
export const NZ_STARTING_OUT_WAGE_2024 = 18.52;

/** Default piece rate per bin — used only as fallback when DB settings are unavailable offline */
export const NZ_DEFAULT_PIECE_RATE = 6.5; // $/bin

/** Maximum daily work hours before mandatory rest (NZ H&S Act) */
export const NZ_MAX_DAILY_HOURS = 12;

/** Rest break: 10 min paid for every 2 hours worked (Employment Relations Act 2000) */
export const NZ_REST_BREAK_INTERVAL_HOURS = 2;
export const NZ_REST_BREAK_DURATION_MINUTES = 10;

/** Meal break: 30 min (may be unpaid) for every 4 hours worked */
export const NZ_MEAL_BREAK_INTERVAL_HOURS = 4;
export const NZ_MEAL_BREAK_DURATION_MINUTES = 30;

/**
 * KiwiSaver employee rates from 1 April 2026 (default 3.5%; 3% only with a
 * temporary rate reduction approved by Inland Revenue). Informativo: la app
 * no calcula deducciones, las hace el programa de nóminas.
 */
export const NZ_KIWISAVER_RATES = [0.03, 0.035, 0.04, 0.06, 0.08, 0.10] as const;
/** Minimum employer contribution from 1 April 2026 (was 3%) */
export const NZ_KIWISAVER_EMPLOYER_MIN = 0.035;

/**
 * Default wage rates per job type — these are the DB fallback values
 * used when the `wage_rates` table hasn't been configured yet.
 * Admin/HR updates these via the Settings → Wage Rates panel.
 */
export const NZ_DEFAULT_WAGE_RATES: WageRateDefaults = {
  picker:           PAY_RULES.minWageFloor,  // Minimum wage floor (Minimum Wage Order 2026)
  team_leader:      26.00,  // Typically $2-5 above minimum
  runner:           24.00,  // Runner premium
  qc_inspector:     27.50,  // Skilled role
  logistics:        25.00,  // Logistics
  hr_admin:         32.00,  // Salaried
  manager:          45.00,  // Salaried
  admin:            35.00,  // Salaried
};

export type JobType = keyof typeof NZ_DEFAULT_WAGE_RATES;

export interface WageRateDefaults {
  picker: number;
  team_leader: number;
  runner: number;
  qc_inspector: number;
  logistics: number;
  hr_admin: number;
  manager: number;
  admin: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// NZ PUBLIC HOLIDAYS — Holidays Act 2003
// ═══════════════════════════════════════════════════════════════════════════
//
// Un empleado que trabaja en un "public holiday" tiene derecho a:
//   1. **Time-and-a-half** (1.5x) sobre su hourly rate ordinario
//   2. **Alternative holiday** (día de vacaciones en lugar) si el día caía
//      dentro de sus días habituales de trabajo ("otherwise would be a
//      working day").
//
// Las fechas siguen la regla de Monday-ization: si un holiday nacional
// cae en fin de semana, se "transfiere" al siguiente lunes (martes para
// Boxing Day cuando Xmas es domingo). Matariki y King's Birthday ya
// caen siempre en lunes/viernes fijo por ley.
//
// Fuente: https://www.employment.govt.nz/leave-and-holidays/public-holidays/
// Actualizar anualmente cuando gobierno publique próximo calendario.

/** Multiplier aplicado a horas trabajadas en public holiday (Holidays Act 2003 s.50). */
export const NZ_PUBLIC_HOLIDAY_RATE = 1.5;

/**
 * Lista de public holidays nacionales NZ (fechas observadas con Monday-ization).
 * Formato ISO YYYY-MM-DD. NO incluye regional anniversary days — esos dependen
 * de orchard.region y se calculan dinámicamente desde una tabla separada (TODO).
 */
export const NZ_PUBLIC_HOLIDAYS_2026: ReadonlyArray<string> = [
  '2026-01-01', // New Year's Day (Thu)
  '2026-01-02', // Day after New Year (Fri)
  '2026-02-06', // Waitangi Day (Fri)
  '2026-04-03', // Good Friday
  '2026-04-06', // Easter Monday
  '2026-04-27', // ANZAC Day observed (25 Apr = Sat, Monday-ised)
  '2026-06-01', // King's Birthday (1st Monday June)
  '2026-07-10', // Matariki (gazetted)
  '2026-10-26', // Labour Day (4th Monday October)
  '2026-12-25', // Christmas Day (Fri)
  '2026-12-28', // Boxing Day observed (26 Dec = Sat, Monday-ised)
];

export const NZ_PUBLIC_HOLIDAYS_2027: ReadonlyArray<string> = [
  '2027-01-01', // New Year's Day (Fri)
  '2027-01-04', // Day after New Year observed (2 Jan = Sat, Mon-ised)
  '2027-02-08', // Waitangi Day observed (6 Feb = Sat, Mon-ised)
  '2027-03-26', // Good Friday
  '2027-03-29', // Easter Monday
  '2027-04-26', // ANZAC Day observed (25 Apr = Sun, Mon-ised)
  '2027-06-07', // King's Birthday
  '2027-06-25', // Matariki (gazetted)
  '2027-10-25', // Labour Day
  '2027-12-27', // Christmas observed (25 = Sat, Mon-ised)
  '2027-12-28', // Boxing Day observed
];

/** Concatenación de holidays conocidos — extender con futuros años cuando se publiquen. */
export const NZ_PUBLIC_HOLIDAYS: ReadonlyArray<string> = [
  ...NZ_PUBLIC_HOLIDAYS_2026,
  ...NZ_PUBLIC_HOLIDAYS_2027,
];

/** Set para lookup O(1). */
const HOLIDAY_SET = new Set<string>(NZ_PUBLIC_HOLIDAYS);

/**
 * Devuelve true si la fecha dada es un public holiday NZ nacional.
 * Acepta Date object o ISO string (YYYY-MM-DD o ISO completo).
 *
 * Un string se toma tal cual (primeros 10 caracteres = fecha NZ). Un Date se
 * convierte a la fecha del calendario de Nueva Zelanda (antes usaba la fecha
 * UTC y por la mañana NZ caía en el día anterior).
 */
export function isPublicHoliday(date: Date | string): boolean {
  if (typeof date === 'string') {
    // Asume ISO YYYY-MM-DD directo o ISO completo — tomamos los primeros 10 chars
    return HOLIDAY_SET.has(date.slice(0, 10));
  }
  // Fecha del calendario NZ (no UTC): el 25-dic a las 09:00 NZ es el 24 en UTC
  const nzDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(date);
  return HOLIDAY_SET.has(nzDate);
}

/**
 * Rate multiplier a aplicar a la tasa horaria para una fecha dada.
 * Devuelve 1.5 si public holiday, 1.0 si día ordinario.
 */
export function getHolidayMultiplier(date: Date | string): number {
  return isPublicHoliday(date) ? NZ_PUBLIC_HOLIDAY_RATE : 1;
}
