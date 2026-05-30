/**
 * nz-tax-rates.ts — Configuracion versionada de tasas fiscales NZ
 *
 * Cada ano fiscal (abril-marzo) se agrega un nuevo objeto al array.
 * El sistema selecciona automaticamente las tasas vigentes segun la fecha.
 * Para el proximo ano fiscal (abril 2026), solo agregar un nuevo entry.
 *
 * Fuentes:
 *   - IRD: https://www.ird.govt.nz/income-tax/income-tax-for-individuals/tax-codes-and-tax-rates-for-individuals/tax-rates-for-individuals
 *   - ACC: https://www.acc.co.nz/for-business/understanding-levies/
 *   - KiwiSaver Act 2006
 *   - Holidays Act 2003
 *   - Minimum Wage Order 2025
 *
 * @module config/nz-tax-rates
 */

// ── Tipos ──────────────────────────────────────────────

export interface TaxBracket {
  readonly upTo: number;
  readonly rate: number;
}

export interface NZTaxYearConfig {
  /** Identificador del ano fiscal, ej. "2025-2026" */
  readonly taxYear: string;
  /** Primer dia del ano fiscal (inclusive) */
  readonly effectiveFrom: string;
  /** Ultimo dia del ano fiscal (inclusive) */
  readonly effectiveTo: string;

  /** Tramos PAYE anuales (Income Tax Act 2007) */
  readonly payeBrackets: readonly TaxBracket[];
  /** Tramos PAYE semanales (annual / 52) — calculados automaticamente */
  readonly payeBracketsWeekly: readonly TaxBracket[];

  /** ACC earner's levy — tasa por $100 de ingresos */
  readonly accEarnerLevyPer100: number;
  /** ACC earner's levy como porcentaje (derivado) */
  readonly accEarnerLevyRate: number;
  /** ACC maximo ingreso sujeto a levy (anual) */
  readonly accMaxLiableAnnual: number;

  /** Tasas KiwiSaver empleado disponibles */
  readonly kiwisaverEmployeeRates: readonly number[];
  /** Tasa KiwiSaver empleador obligatoria */
  readonly kiwisaverEmployerMin: number;

  /** Tramos ESCT (Employer Superannuation Contribution Tax) */
  readonly esctBrackets: readonly TaxBracket[];

  /** Holiday pay para trabajadores casual/estacional */
  readonly casualHolidayPayRate: number;
  /** Semanas de annual leave */
  readonly annualLeaveWeeks: number;

  /** Salario minimo por hora (adult) */
  readonly minimumWageHourly: number;
  /** Salario minimo starting-out/training (80% del adulto) */
  readonly startingOutWageHourly: number;

  /** Student loan: umbral semanal de repago */
  readonly studentLoanWeeklyThreshold: number;
  /** Student loan: tasa de repago */
  readonly studentLoanRate: number;
}

// ── Helper: convierte tramos anuales a semanales ──────

function toWeeklyBrackets(annual: readonly TaxBracket[]): TaxBracket[] {
  return annual.map(b => ({
    upTo: b.upTo === Infinity ? Infinity : Math.round((b.upTo / 52) * 100) / 100,
    rate: b.rate,
  }));
}

// ── Configuraciones por ano fiscal ────────────────────

/**
 * 2026-2027 (1 April 2026 – 31 March 2027)
 * Salario minimo actualizado a $23.95/hr (Minimum Wage Order 2026).
 * Tramos PAYE sin cambios respecto a 2025-2026 (IRD no anuncio modificaciones).
 */
const PAYE_2026_27: TaxBracket[] = [
  { upTo: 15_600, rate: 0.105 },
  { upTo: 53_500, rate: 0.175 },
  { upTo: 78_100, rate: 0.30 },
  { upTo: 180_000, rate: 0.33 },
  { upTo: Infinity, rate: 0.39 },
];

const ESCT_2026_27: TaxBracket[] = [
  { upTo: 16_800, rate: 0.105 },
  { upTo: 57_600, rate: 0.175 },
  { upTo: 84_000, rate: 0.30 },
  { upTo: 216_000, rate: 0.33 },
  { upTo: Infinity, rate: 0.39 },
];

const TAX_YEAR_2026_2027: NZTaxYearConfig = {
  taxYear: '2026-2027',
  effectiveFrom: '2026-04-01',
  effectiveTo: '2027-03-31',

  payeBrackets: PAYE_2026_27,
  payeBracketsWeekly: toWeeklyBrackets(PAYE_2026_27),

  accEarnerLevyPer100: 1.60,
  accEarnerLevyRate: 0.016,
  accMaxLiableAnnual: 142_283,

  // KiwiSaver Amendment Act 2025: minimum 3% → 3.5% from 1 April 2026; 3.5% → 4% from 1 April 2028.
  kiwisaverEmployeeRates: [0.035, 0.04, 0.06, 0.08, 0.10],
  kiwisaverEmployerMin: 0.035,

  esctBrackets: ESCT_2026_27,

  casualHolidayPayRate: 0.08,
  annualLeaveWeeks: 4,

  minimumWageHourly: 23.95,
  startingOutWageHourly: 19.16,  // 80% of $23.95 (Minimum Wage Act 1983, s8)

  studentLoanWeeklyThreshold: 428,
  studentLoanRate: 0.12,
};

/**
 * 2025-2026 (1 April 2025 – 31 March 2026)
 * Tramos PAYE actualizados por IRD para este periodo.
 */
const PAYE_2025_26: TaxBracket[] = [
  { upTo: 15_600, rate: 0.105 },   // $0 – $15,600 → 10.5%
  { upTo: 53_500, rate: 0.175 },   // $15,601 – $53,500 → 17.5%
  { upTo: 78_100, rate: 0.30 },    // $53,501 – $78,100 → 30%
  { upTo: 180_000, rate: 0.33 },   // $78,101 – $180,000 → 33%
  { upTo: Infinity, rate: 0.39 },  // $180,001+ → 39%
];

const ESCT_2025_26: TaxBracket[] = [
  { upTo: 16_800, rate: 0.105 },
  { upTo: 57_600, rate: 0.175 },
  { upTo: 84_000, rate: 0.30 },
  { upTo: 216_000, rate: 0.33 },
  { upTo: Infinity, rate: 0.39 },
];

const TAX_YEAR_2025_2026: NZTaxYearConfig = {
  taxYear: '2025-2026',
  effectiveFrom: '2025-04-01',
  effectiveTo: '2026-03-31',

  payeBrackets: PAYE_2025_26,
  payeBracketsWeekly: toWeeklyBrackets(PAYE_2025_26),

  accEarnerLevyPer100: 1.60,
  accEarnerLevyRate: 0.016,
  accMaxLiableAnnual: 142_283,

  kiwisaverEmployeeRates: [0.03, 0.04, 0.06, 0.08, 0.10],
  kiwisaverEmployerMin: 0.03,

  esctBrackets: ESCT_2025_26,

  casualHolidayPayRate: 0.08,
  annualLeaveWeeks: 4,

  minimumWageHourly: 23.15,
  startingOutWageHourly: 18.52,

  studentLoanWeeklyThreshold: 428,
  studentLoanRate: 0.12,
};

/**
 * 2024-2025 (1 April 2024 – 31 March 2025)
 * Tasas anteriores — mantenidas para referencia historica y recalculos.
 */
const PAYE_2024_25: TaxBracket[] = [
  { upTo: 14_000, rate: 0.105 },
  { upTo: 48_000, rate: 0.175 },
  { upTo: 70_000, rate: 0.30 },
  { upTo: 180_000, rate: 0.33 },
  { upTo: Infinity, rate: 0.39 },
];

const ESCT_2024_25: TaxBracket[] = [
  { upTo: 16_800, rate: 0.105 },
  { upTo: 57_600, rate: 0.175 },
  { upTo: 84_000, rate: 0.30 },
  { upTo: 216_000, rate: 0.33 },
  { upTo: Infinity, rate: 0.39 },
];

const TAX_YEAR_2024_2025: NZTaxYearConfig = {
  taxYear: '2024-2025',
  effectiveFrom: '2024-04-01',
  effectiveTo: '2025-03-31',

  payeBrackets: PAYE_2024_25,
  payeBracketsWeekly: toWeeklyBrackets(PAYE_2024_25),

  accEarnerLevyPer100: 1.60,
  accEarnerLevyRate: 0.016,
  accMaxLiableAnnual: 142_283,

  kiwisaverEmployeeRates: [0.03, 0.04, 0.06, 0.08, 0.10],
  kiwisaverEmployerMin: 0.03,

  esctBrackets: ESCT_2024_25,

  casualHolidayPayRate: 0.08,
  annualLeaveWeeks: 4,

  minimumWageHourly: 23.15,
  startingOutWageHourly: 18.52,

  studentLoanWeeklyThreshold: 428,
  studentLoanRate: 0.12,
};

// ── Registry de anos fiscales (agregar nuevos al inicio) ──

export const NZ_TAX_YEARS: readonly NZTaxYearConfig[] = [
  TAX_YEAR_2026_2027,
  TAX_YEAR_2025_2026,
  TAX_YEAR_2024_2025,
];

// ── Seleccion automatica por fecha ────────────────────

/**
 * Obtiene la configuracion fiscal vigente para una fecha dada.
 * Si no se pasa fecha, usa la fecha actual en NZST.
 * Si la fecha no cae en ningun ano fiscal configurado, usa el mas reciente.
 */
export function getTaxYearConfig(date?: Date): NZTaxYearConfig {
  const targetDate = date || new Date();
  const isoDate = targetDate.toISOString().split('T')[0];

  // Buscar el ano fiscal que contiene la fecha
  for (const config of NZ_TAX_YEARS) {
    if (isoDate >= config.effectiveFrom && isoDate <= config.effectiveTo) {
      return config;
    }
  }

  // Fallback: usar el mas reciente
  return NZ_TAX_YEARS[0];
}

/**
 * Shortcut: configuracion del ano fiscal actual.
 * Cacheado para evitar recalcular en cada llamada dentro del mismo ciclo.
 */
let _cachedConfig: NZTaxYearConfig | null = null;
let _cachedDate: string | null = null;

export function getCurrentTaxYear(): NZTaxYearConfig {
  const today = new Date().toISOString().split('T')[0];
  if (_cachedDate === today && _cachedConfig) {
    return _cachedConfig;
  }
  _cachedConfig = getTaxYearConfig();
  _cachedDate = today;
  return _cachedConfig;
}
