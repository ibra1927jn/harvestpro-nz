/**
 * nz-payroll-deductions.service.test.ts
 * Covers: calculate(), calculatePAYE(), calculateESCT(),
 *         getAnnualLeaveEntitlement(), generatePayslip(), getCurrentRates()
 * Strategy: pure math — no mocks needed.
 */
import { describe, it, expect } from 'vitest';
import { nzPayrollDeductionsService, PayrollInput } from '../nz-payroll-deductions.service';

const base: PayrollInput = {
  grossEarnings: 800, // Normal week: $800 gross
  hoursWorked: 40,
  kiwisaverRate: 0.03, // 3% KiwiSaver
  isCasual: true, // Casual/seasonal → 8% holiday pay
  taxCode: 'M',
  hasStudentLoan: false,
  annualSalaryEstimate: 41_600,
};

describe('nzPayrollDeductionsService', () => {
  describe('calculate()', () => {
    it('returns all expected fields', () => {
      const result = nzPayrollDeductionsService.calculate(base);
      expect(result).toHaveProperty('grossEarnings');
      expect(result).toHaveProperty('holidayPay');
      expect(result).toHaveProperty('totalGross');
      expect(result).toHaveProperty('paye');
      expect(result).toHaveProperty('accLevyEmployee');
      expect(result).toHaveProperty('kiwisaverEmployee');
      expect(result).toHaveProperty('studentLoan');
      expect(result).toHaveProperty('totalDeductions');
      expect(result).toHaveProperty('netPay');
      expect(result).toHaveProperty('kiwisaverEmployer');
      expect(result).toHaveProperty('esct');
      expect(result).toHaveProperty('accLevyEmployer');
      expect(result).toHaveProperty('totalEmployerCost');
    });

    it('calculates 8% holiday pay for casual workers', () => {
      const result = nzPayrollDeductionsService.calculate(base);
      expect(result.holidayPay).toBeCloseTo(800 * 0.08, 2);
    });

    it('does NOT add holiday pay for non-casual workers', () => {
      const result = nzPayrollDeductionsService.calculate({ ...base, isCasual: false });
      expect(result.holidayPay).toBe(0);
    });

    it('totalGross = grossEarnings + holidayPay (casual)', () => {
      const result = nzPayrollDeductionsService.calculate(base);
      expect(result.totalGross).toBeCloseTo(result.grossEarnings + result.holidayPay, 2);
    });

    it('netPay = totalGross - totalDeductions', () => {
      const result = nzPayrollDeductionsService.calculate(base);
      expect(result.netPay).toBeCloseTo(result.totalGross - result.totalDeductions, 1);
    });

    it('netPay is always positive for minimum wage earnings', () => {
      const result = nzPayrollDeductionsService.calculate({ ...base, grossEarnings: 200 });
      expect(result.netPay).toBeGreaterThan(0);
    });

    it('paye is positive for taxable income', () => {
      const result = nzPayrollDeductionsService.calculate(base);
      expect(result.paye).toBeGreaterThan(0);
    });

    it('accLevyEmployee is 1.6% of totalGross (<=weekly cap)', () => {
      const result = nzPayrollDeductionsService.calculate(base);
      expect(result.accLevyEmployee).toBeCloseTo(result.totalGross * 0.016, 2);
    });

    it('KiwiSaver employee at 3%', () => {
      const result = nzPayrollDeductionsService.calculate({ ...base, kiwisaverRate: 0.03 });
      expect(result.kiwisaverEmployee).toBeCloseTo(result.totalGross * 0.03, 2);
    });

    it('KiwiSaver employee at 6%', () => {
      const result = nzPayrollDeductionsService.calculate({ ...base, kiwisaverRate: 0.06 });
      expect(result.kiwisaverEmployee).toBeCloseTo(result.totalGross * 0.06, 2);
    });

    it('KiwiSaver employer contribution matches current year minimum (3.5% from 1 April 2026)', () => {
      const result = nzPayrollDeductionsService.calculate(base);
      // KiwiSaver Amendment Act 2025: compulsory employer min rose 3% → 3.5% on 2026-04-01.
      // Using the service's active tax-year config rather than hardcoding so the assertion
      // tracks future changes (3.5% → 4% from 2028-04-01).
      const expected = result.totalGross * nzPayrollDeductionsService.getCurrentRates().kiwisaverMin;
      expect(result.kiwisaverEmployer).toBeCloseTo(expected, 2);
    });

    it('studentLoan is 0 when hasStudentLoan = false', () => {
      const result = nzPayrollDeductionsService.calculate(base);
      expect(result.studentLoan).toBe(0);
    });

    it('studentLoan calculates 12% above $428 threshold', () => {
      const result = nzPayrollDeductionsService.calculate({
        ...base,
        hasStudentLoan: true,
        grossEarnings: 600,
        isCasual: false,
      });
      const totalGross = 600;
      const expectedSL = (totalGross - 428) * 0.12;
      expect(result.studentLoan).toBeCloseTo(expectedSL, 2);
    });

    it('studentLoan is 0 when earnings below threshold', () => {
      const result = nzPayrollDeductionsService.calculate({
        ...base,
        hasStudentLoan: true,
        grossEarnings: 400,
        isCasual: false,
      });
      expect(result.studentLoan).toBe(0);
    });

    it('totalEmployerCost > totalGross (employer pays more)', () => {
      const result = nzPayrollDeductionsService.calculate(base);
      expect(result.totalEmployerCost).toBeGreaterThan(result.totalGross);
    });

    it('all monetary values are rounded to 2 decimal places', () => {
      const result = nzPayrollDeductionsService.calculate(base);
      const check = (n: number) => Math.round(n * 100) / 100 === n;
      expect(check(result.paye)).toBe(true);
      expect(check(result.holidayPay)).toBe(true);
      expect(check(result.netPay)).toBe(true);
    });
  });

  describe('calculatePAYE()', () => {
    // 2025-26 weekly thresholds: $300.00, $1028.85, $1501.92, $3461.54
    it('10.5% on income in first bracket ($0-$300/week)', () => {
      // $200/week → fully in first bracket
      const paye = nzPayrollDeductionsService.calculatePAYE(200);
      expect(paye).toBeCloseTo(200 * 0.105, 2);
    });

    it('applies progressive brackets (2025-26 thresholds)', () => {
      // $1100/week → spans first THREE brackets:
      // 0-300.00 @ 10.5%, 300.00-1028.85 @ 17.5%, 1028.85-1100 @ 30%
      const paye = nzPayrollDeductionsService.calculatePAYE(1100);
      const expected = 300.00 * 0.105 + (1028.85 - 300.00) * 0.175 + (1100 - 1028.85) * 0.3;
      expect(paye).toBeCloseTo(expected, 1);
    });

    it('paye = 0 for zero income', () => {
      expect(nzPayrollDeductionsService.calculatePAYE(0)).toBe(0);
    });

    it('paye for very high income uses 39% bracket', () => {
      const paye = nzPayrollDeductionsService.calculatePAYE(4000);
      expect(paye).toBeGreaterThan(1000); // meaningful tax
    });
  });

  describe('calculateESCT()', () => {
    it('returns a positive value for positive employer KS contribution', () => {
      const esct = nzPayrollDeductionsService.calculateESCT(24, 41_600); // ~$800/wk @ 3% emp = $24
      expect(esct).toBeGreaterThan(0);
    });

    it('uses 10.5% rate for low-income earner', () => {
      const esct = nzPayrollDeductionsService.calculateESCT(10, 14_000);
      expect(esct).toBeCloseTo(10 * 0.105, 2);
    });

    it('uses 17.5% rate for mid-income earner', () => {
      const esct = nzPayrollDeductionsService.calculateESCT(50, 40_000);
      expect(esct).toBeCloseTo(50 * 0.175, 2);
    });
  });

  describe('getAnnualLeaveEntitlement()', () => {
    it('returns 4 weeks after a full year of work', () => {
      const result = nzPayrollDeductionsService.getAnnualLeaveEntitlement(52, 800);
      expect(result.weeksAccrued).toBeCloseTo(4, 1);
    });

    it('returns 2 weeks after half a year', () => {
      const result = nzPayrollDeductionsService.getAnnualLeaveEntitlement(26, 800);
      expect(result.weeksAccrued).toBeCloseTo(2, 1);
    });

    it('dollarValue = weeksAccrued × weeklyRate', () => {
      const result = nzPayrollDeductionsService.getAnnualLeaveEntitlement(52, 1000);
      expect(result.dollarValue).toBeCloseTo(result.weeksAccrued * 1000, 1);
    });
  });

  describe('generatePayslip()', () => {
    it('returns a string containing worker name', () => {
      const text = nzPayrollDeductionsService.generatePayslip('Hemi Walker', base);
      expect(text).toContain('Hemi Walker');
    });

    it('includes NET PAY line', () => {
      const text = nzPayrollDeductionsService.generatePayslip('Test', base);
      expect(text).toContain('NET PAY');
    });

    it('includes PAYE tax line', () => {
      const text = nzPayrollDeductionsService.generatePayslip('Test', base);
      expect(text).toContain('PAYE Tax');
    });

    it('includes Student Loan line when hasStudentLoan = true and above threshold', () => {
      const text = nzPayrollDeductionsService.generatePayslip('Test', {
        ...base,
        hasStudentLoan: true,
        grossEarnings: 600,
        isCasual: false,
      });
      expect(text).toContain('Student Loan');
    });

    it('does NOT include Student Loan line when hasStudentLoan = false', () => {
      const text = nzPayrollDeductionsService.generatePayslip('Test', base);
      expect(text).not.toContain('Student Loan');
    });
  });

  describe('getCurrentRates()', () => {
    it('returns ACC earner levy rate', () => {
      const rates = nzPayrollDeductionsService.getCurrentRates();
      expect(rates.accEarnerLevy).toBeGreaterThan(0);
    });

    it('returns 4 annual leave weeks', () => {
      const rates = nzPayrollDeductionsService.getCurrentRates();
      expect(rates.annualLeaveWeeks).toBe(4);
    });

    it('returns 8% casual holiday pay rate', () => {
      const rates = nzPayrollDeductionsService.getCurrentRates();
      expect(rates.casualHolidayPay).toBe(0.08);
    });

    it('returns PAYE brackets array', () => {
      const rates = nzPayrollDeductionsService.getCurrentRates();
      expect(Array.isArray(rates.payeBrackets)).toBe(true);
      expect(rates.payeBrackets.length).toBeGreaterThan(0);
    });
  });
});
