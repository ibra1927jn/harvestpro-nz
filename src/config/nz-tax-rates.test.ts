/**
 * Tests for nz-tax-rates.ts — versioned NZ tax-year config selection.
 */
import { describe, it, expect } from 'vitest';
import {
  NZ_TAX_YEARS,
  getTaxYearConfig,
  getCurrentTaxYear,
} from '@/config/nz-tax-rates';

describe('NZ Tax Rates — registry', () => {
  it('exposes at least 2024-25, 2025-26 and 2026-27 fiscal years', () => {
    const years = NZ_TAX_YEARS.map(c => c.taxYear);
    expect(years).toContain('2024-2025');
    expect(years).toContain('2025-2026');
    expect(years).toContain('2026-2027');
  });

  it('the most recent fiscal year is at index 0 (lookup fallback)', () => {
    expect(NZ_TAX_YEARS[0].taxYear).toBe('2026-2027');
  });

  it('all configs have effectiveFrom <= effectiveTo', () => {
    NZ_TAX_YEARS.forEach(c => {
      expect(c.effectiveFrom <= c.effectiveTo).toBe(true);
    });
  });
});

describe('NZ Tax Rates — getTaxYearConfig', () => {
  it('returns the 2026-27 config for a date inside that range', () => {
    const cfg = getTaxYearConfig(new Date('2026-04-15T00:00:00Z'));
    expect(cfg.taxYear).toBe('2026-2027');
    expect(cfg.minimumWageHourly).toBe(23.95);
  });

  it('returns the 2025-26 config for a date inside that range', () => {
    const cfg = getTaxYearConfig(new Date('2025-08-01T00:00:00Z'));
    expect(cfg.taxYear).toBe('2025-2026');
    expect(cfg.minimumWageHourly).toBe(23.15);
  });

  it('returns the 2024-25 config for a date inside that range', () => {
    const cfg = getTaxYearConfig(new Date('2024-12-15T00:00:00Z'));
    expect(cfg.taxYear).toBe('2024-2025');
  });

  it('handles fiscal-year boundary on 1 April (inclusive)', () => {
    expect(getTaxYearConfig(new Date('2026-04-01T00:00:00Z')).taxYear).toBe('2026-2027');
    expect(getTaxYearConfig(new Date('2026-03-31T00:00:00Z')).taxYear).toBe('2025-2026');
  });

  it('falls back to most recent config when date is out of range', () => {
    const cfg = getTaxYearConfig(new Date('2099-01-01T00:00:00Z'));
    expect(cfg.taxYear).toBe('2026-2027');
  });

  it('uses current date when no argument is passed', () => {
    const cfg = getTaxYearConfig();
    expect(cfg.taxYear).toBeDefined();
    expect(cfg.minimumWageHourly).toBeGreaterThan(0);
  });
});

describe('NZ Tax Rates — PAYE bracket structure', () => {
  it('every config has 5 PAYE brackets ending in Infinity', () => {
    NZ_TAX_YEARS.forEach(c => {
      expect(c.payeBrackets).toHaveLength(5);
      expect(c.payeBrackets[c.payeBrackets.length - 1].upTo).toBe(Infinity);
    });
  });

  it('PAYE rates are monotonically non-decreasing', () => {
    NZ_TAX_YEARS.forEach(c => {
      for (let i = 1; i < c.payeBrackets.length; i++) {
        expect(c.payeBrackets[i].rate).toBeGreaterThanOrEqual(c.payeBrackets[i - 1].rate);
      }
    });
  });

  it('PAYE upTo bounds are strictly increasing', () => {
    NZ_TAX_YEARS.forEach(c => {
      for (let i = 1; i < c.payeBrackets.length; i++) {
        expect(c.payeBrackets[i].upTo).toBeGreaterThan(c.payeBrackets[i - 1].upTo);
      }
    });
  });

  it('weekly PAYE brackets equal annual / 52 (Infinity preserved)', () => {
    const cfg = getTaxYearConfig(new Date('2026-04-15T00:00:00Z'));
    cfg.payeBrackets.forEach((annual, i) => {
      const weekly = cfg.payeBracketsWeekly[i];
      if (annual.upTo === Infinity) {
        expect(weekly.upTo).toBe(Infinity);
      } else {
        expect(weekly.upTo).toBeCloseTo(annual.upTo / 52, 2);
      }
      expect(weekly.rate).toBe(annual.rate);
    });
  });
});

describe('NZ Tax Rates — KiwiSaver and ACC', () => {
  it('all configs offer 5 KiwiSaver employee rates', () => {
    NZ_TAX_YEARS.forEach(c => {
      expect(c.kiwisaverEmployeeRates).toHaveLength(5);
    });
  });

  // KiwiSaver Amendment Act 2025: minimum rises 3% → 3.5% on 1 April 2026, and
  // 3.5% → 4% on 1 April 2028. Check year-by-year rather than assuming uniform.
  it('KiwiSaver minimum rate is year-specific (3% pre-2026, 3.5% from 2026-2027)', () => {
    NZ_TAX_YEARS.forEach(c => {
      const expected = new Date(c.effectiveFrom) >= new Date('2026-04-01') ? 0.035 : 0.03;
      expect(c.kiwisaverEmployeeRates[0]).toBe(expected);
      expect(c.kiwisaverEmployerMin).toBe(expected);
    });
  });

  it('ACC earner levy rate matches per-100 / 100', () => {
    NZ_TAX_YEARS.forEach(c => {
      expect(c.accEarnerLevyRate).toBeCloseTo(c.accEarnerLevyPer100 / 100, 4);
    });
  });
});

describe('NZ Tax Rates — getCurrentTaxYear', () => {
  it('returns a valid config consistent with getTaxYearConfig()', () => {
    expect(getCurrentTaxYear()).toEqual(getTaxYearConfig());
  });

  it('is stable across consecutive calls (cached)', () => {
    const a = getCurrentTaxYear();
    const b = getCurrentTaxYear();
    expect(a).toBe(b);
  });
});
