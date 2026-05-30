/**
 * Unit tests for NZ law constants.
 * Verifies that legal constants match the NZ Minimum Wage Orders 2025/2026,
 * the Employment Relations Act 2000, and the Holidays Act 2003.
 */
import { describe, it, expect } from 'vitest';
import {
  NZ_MINIMUM_WAGE_2026,
  NZ_MINIMUM_WAGE_2025,
  NZ_MINIMUM_WAGE_2024,
  NZ_STARTING_OUT_WAGE_2026,
  NZ_STARTING_OUT_WAGE_2025,
  NZ_STARTING_OUT_WAGE_2024,
  NZ_DEFAULT_PIECE_RATE,
  NZ_MAX_DAILY_HOURS,
  NZ_REST_BREAK_INTERVAL_HOURS,
  NZ_REST_BREAK_DURATION_MINUTES,
  NZ_MEAL_BREAK_INTERVAL_HOURS,
  NZ_MEAL_BREAK_DURATION_MINUTES,
  NZ_KIWISAVER_RATES,
  NZ_KIWISAVER_EMPLOYER_MIN,
  NZ_DEFAULT_WAGE_RATES,
} from '@/constants/nz-law';

describe('NZ Law Constants — Minimum Wage Orders', () => {
  it('2026 adult minimum wage is $23.95/hr (as of 1 April 2026)', () => {
    expect(NZ_MINIMUM_WAGE_2026).toBe(23.95);
  });

  it('2025 adult minimum wage is $23.15/hr (as of 1 April 2025)', () => {
    expect(NZ_MINIMUM_WAGE_2025).toBe(23.15);
  });

  it('2024 alias equals 2025 rate (backcompat)', () => {
    expect(NZ_MINIMUM_WAGE_2024).toBe(NZ_MINIMUM_WAGE_2025);
  });

  it('2026 starting-out wage is 80% of adult rate ($19.16)', () => {
    expect(NZ_STARTING_OUT_WAGE_2026).toBe(19.16);
    expect(NZ_STARTING_OUT_WAGE_2026 / NZ_MINIMUM_WAGE_2026).toBeCloseTo(0.8, 1);
  });

  it('2025 starting-out wage is 80% of adult rate ($18.52)', () => {
    expect(NZ_STARTING_OUT_WAGE_2025).toBe(18.52);
    expect(NZ_STARTING_OUT_WAGE_2025 / NZ_MINIMUM_WAGE_2025).toBeCloseTo(0.8, 1);
  });

  it('starting-out 2024 alias equals 2025 rate', () => {
    expect(NZ_STARTING_OUT_WAGE_2024).toBe(NZ_STARTING_OUT_WAGE_2025);
  });
});

describe('NZ Law Constants — Piece Rate', () => {
  it('default piece rate is $6.50 per bin', () => {
    expect(NZ_DEFAULT_PIECE_RATE).toBe(6.5);
  });

  it('piece rate is less than minimum wage (requires volume)', () => {
    expect(NZ_DEFAULT_PIECE_RATE).toBeLessThan(NZ_MINIMUM_WAGE_2025);
  });
});

describe('NZ Law Constants — Work Hours (H&S Act)', () => {
  it('max daily hours is 12', () => {
    expect(NZ_MAX_DAILY_HOURS).toBe(12);
  });
});

describe('NZ Law Constants — Break Requirements (ERA 2000)', () => {
  it('rest break every 2 hours', () => {
    expect(NZ_REST_BREAK_INTERVAL_HOURS).toBe(2);
  });

  it('rest break is 10 minutes', () => {
    expect(NZ_REST_BREAK_DURATION_MINUTES).toBe(10);
  });

  it('meal break every 4 hours', () => {
    expect(NZ_MEAL_BREAK_INTERVAL_HOURS).toBe(4);
  });

  it('meal break is 30 minutes', () => {
    expect(NZ_MEAL_BREAK_DURATION_MINUTES).toBe(30);
  });
});

describe('NZ Law Constants — KiwiSaver', () => {
  it('offers 5 employee contribution rates', () => {
    expect(NZ_KIWISAVER_RATES).toHaveLength(5);
  });

  it('minimum employee rate is 3.5% (KiwiSaver Amendment Act 2025, from 1 April 2026)', () => {
    expect(NZ_KIWISAVER_RATES[0]).toBe(0.035);
  });

  it('maximum employee rate is 10%', () => {
    expect(NZ_KIWISAVER_RATES[NZ_KIWISAVER_RATES.length - 1]).toBe(0.10);
  });

  it('employer minimum contribution is 3.5% (KiwiSaver Amendment Act 2025, from 1 April 2026)', () => {
    expect(NZ_KIWISAVER_EMPLOYER_MIN).toBe(0.035);
  });

  it('all rates are between 0 and 1', () => {
    NZ_KIWISAVER_RATES.forEach((rate: number) => {
      expect(rate).toBeGreaterThan(0);
      expect(rate).toBeLessThanOrEqual(1);
    });
  });
});

describe('NZ Law Constants — Default Wage Rates', () => {
  it('all job types have a rate defined', () => {
    const expectedTypes = ['picker', 'team_leader', 'runner', 'qc_inspector', 'logistics', 'hr_admin', 'manager', 'admin'];
    expectedTypes.forEach(type => {
      expect(NZ_DEFAULT_WAGE_RATES[type as keyof typeof NZ_DEFAULT_WAGE_RATES]).toBeDefined();
    });
  });

  it('all rates are at or above the current minimum wage', () => {
    Object.entries(NZ_DEFAULT_WAGE_RATES).forEach(([_role, rate]) => {
      expect(rate).toBeGreaterThanOrEqual(NZ_MINIMUM_WAGE_2026);
    });
  });

  it('picker rate equals the 2026 minimum wage floor ($23.95)', () => {
    expect(NZ_DEFAULT_WAGE_RATES.picker).toBe(NZ_MINIMUM_WAGE_2026);
  });

  it('management rates are above frontline rates', () => {
    expect(NZ_DEFAULT_WAGE_RATES.manager).toBeGreaterThan(NZ_DEFAULT_WAGE_RATES.picker);
    expect(NZ_DEFAULT_WAGE_RATES.admin).toBeGreaterThan(NZ_DEFAULT_WAGE_RATES.runner);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Public Holidays (Holidays Act 2003) — añadidos 2026-04-18
// ═══════════════════════════════════════════════════════════════════════════
import {
  NZ_PUBLIC_HOLIDAY_RATE,
  NZ_PUBLIC_HOLIDAYS,
  NZ_PUBLIC_HOLIDAYS_2026,
  isPublicHoliday,
  getHolidayMultiplier,
} from '@/constants/nz-law';

describe('NZ Public Holidays — Holidays Act 2003', () => {
  it('time-and-a-half rate is 1.5x', () => {
    expect(NZ_PUBLIC_HOLIDAY_RATE).toBe(1.5);
  });

  it('2026 list contains 11 national holidays', () => {
    expect(NZ_PUBLIC_HOLIDAYS_2026.length).toBe(11);
  });

  it('2026 list includes Christmas Day + Boxing Day observed', () => {
    expect(NZ_PUBLIC_HOLIDAYS_2026).toContain('2026-12-25');
    expect(NZ_PUBLIC_HOLIDAYS_2026).toContain('2026-12-28');
  });

  it('2026 list includes Matariki gazetted date', () => {
    expect(NZ_PUBLIC_HOLIDAYS_2026).toContain('2026-07-10');
  });

  it('isPublicHoliday accepts ISO date string', () => {
    expect(isPublicHoliday('2026-01-01')).toBe(true); // New Year's Day
    expect(isPublicHoliday('2026-07-10')).toBe(true); // Matariki
    expect(isPublicHoliday('2026-01-15')).toBe(false); // normal day
  });

  it('isPublicHoliday accepts Date object', () => {
    expect(isPublicHoliday(new Date('2026-02-06T00:00:00Z'))).toBe(true); // Waitangi
    expect(isPublicHoliday(new Date('2026-06-15T00:00:00Z'))).toBe(false);
  });

  it('isPublicHoliday accepts full ISO timestamp', () => {
    expect(isPublicHoliday('2026-04-03T08:30:00.000Z')).toBe(true); // Good Friday
  });

  it('getHolidayMultiplier returns 1.5 for public holidays', () => {
    expect(getHolidayMultiplier('2026-12-25')).toBe(1.5);
  });

  it('getHolidayMultiplier returns 1 for ordinary days', () => {
    expect(getHolidayMultiplier('2026-05-15')).toBe(1);
  });

  it('NZ_PUBLIC_HOLIDAYS covers 2026 and 2027', () => {
    expect(NZ_PUBLIC_HOLIDAYS).toContain('2026-01-01');
    expect(NZ_PUBLIC_HOLIDAYS).toContain('2027-01-01');
  });

  it('isPublicHoliday returns false for years outside known list', () => {
    // No hay data de 2025 ni 2028+; caller debe extender la lista cuando haya datos
    expect(isPublicHoliday('2025-12-25')).toBe(false);
    expect(isPublicHoliday('2028-01-01')).toBe(false);
  });

  it('ANZAC Day 2026 is Monday-ised (25 Apr = Sat → 27 Apr observed)', () => {
    expect(isPublicHoliday('2026-04-25')).toBe(false); // Sat sin observed = no cuenta
    expect(isPublicHoliday('2026-04-27')).toBe(true);  // Mon = observed
  });

  it('Matariki dates differ between years (gazetted lunar calendar)', () => {
    expect(NZ_PUBLIC_HOLIDAYS_2026).toContain('2026-07-10');
    expect(NZ_PUBLIC_HOLIDAYS_2026).not.toContain('2027-06-25');
  });

  it('getHolidayMultiplier accepts Date object', () => {
    expect(getHolidayMultiplier(new Date('2026-12-25T00:00:00Z'))).toBe(1.5);
    expect(getHolidayMultiplier(new Date('2026-05-15T00:00:00Z'))).toBe(1);
  });
});
