/**
 * NZ Payroll Deductions Service
 *
 * AUDIT C-1 Fix: Implements mandatory NZ payroll calculations:
 *   - PAYE (Pay As You Earn) tax withholding
 *   - KiwiSaver employee + employer contributions
 *   - ACC earner's levy
 *   - ESCT (Employer Superannuation Contribution Tax)
 *   - Holiday pay (8% for casual/seasonal workers)
 *
 * Tasas fiscales: cargadas desde config/nz-tax-rates.ts (versionadas por ano fiscal).
 * Para actualizar tasas al nuevo ano fiscal, solo agregar entry en nz-tax-rates.ts.
 *
 * References:
 *   - Income Tax Act 2007
 *   - KiwiSaver Act 2006
 *   - Accident Compensation Act 2001
 *   - Holidays Act 2003
 *
 * @module services/nz-payroll-deductions
 */

import { getCurrentTaxYear, getTaxYearConfig, type NZTaxYearConfig } from '@/config/nz-tax-rates';

// ── Tipo exportado para compatibilidad ──────────────────
// 0.03 permanece válido para enrolments pre-2026-04-01 en transición hasta 2028-04-01
// (KiwiSaver Amendment Act 2025). Nuevos enrolments desde 2026-04-01 parten de 0.035.
export type KiwiSaverRate = 0.03 | 0.035 | 0.04 | 0.06 | 0.08 | 0.1;

// ── Helper: obtener tasas vigentes (lazy, cacheado por dia) ──
function rates(): NZTaxYearConfig {
  return getCurrentTaxYear();
}

// ── Types ──────────────────────────────────────
export interface PayrollInput {
  grossEarnings: number; // Weekly gross (piece-rate + top-up)
  hoursWorked: number; // For record-keeping
  kiwisaverRate: KiwiSaverRate; // Employee's chosen KS rate
  isCasual: boolean; // Casual/seasonal → 8% holiday pay
  taxCode: string; // e.g. 'M', 'ME', 'SB', 'S', 'SH'
  hasStudentLoan: boolean; // SL repayment
  annualSalaryEstimate?: number; // For ESCT calculation
}

export interface PayrollDeductions {
  grossEarnings: number;
  holidayPay: number; // 8% holiday pay (casual) or accrued
  totalGross: number; // gross + holiday pay
  paye: number; // PAYE tax
  accLevyEmployee: number; // ACC earner's levy
  kiwisaverEmployee: number; // KS employee contribution
  studentLoan: number; // SL repayment
  totalDeductions: number; // Sum of all deductions
  netPay: number; // totalGross - totalDeductions
  // Employer costs (not deducted from employee)
  kiwisaverEmployer: number; // KS employer contribution
  esct: number; // ESCT on employer KS contribution
  accLevyEmployer: number; // Work levy (employer's share)
  totalEmployerCost: number; // totalGross + employer costs
}

// ── Service ──────────────────────────────────────

export const nzPayrollDeductionsService = {
  /**
   * Calculate all NZ payroll deductions for a single pay period (weekly).
   * Tasas cargadas dinamicamente desde config/nz-tax-rates.ts.
   */
  calculate(input: PayrollInput): PayrollDeductions {
    const { grossEarnings, kiwisaverRate, isCasual, hasStudentLoan } = input;
    const r = rates();

    // 1. Holiday Pay (Holidays Act 2003)
    const holidayPay = isCasual
      ? Math.round(grossEarnings * r.casualHolidayPayRate * 100) / 100
      : 0; // Non-casual accrues leave, not pay-as-you-go

    const totalGross = Math.round((grossEarnings + holidayPay) * 100) / 100;

    // 2. PAYE (Income Tax Act 2007) — progressive brackets
    const paye = this.calculatePAYE(totalGross);

    // 3. ACC Earner's Levy (weekly cap: annual max / 52)
    const accWeeklyCap = r.accMaxLiableAnnual / 52;
    const accLiableEarnings = Math.min(totalGross, accWeeklyCap);
    const accLevyEmployee = Math.round(accLiableEarnings * r.accEarnerLevyRate * 100) / 100;

    // 4. KiwiSaver Employee Contribution
    const kiwisaverEmployee = Math.round(totalGross * kiwisaverRate * 100) / 100;

    // 5. Student Loan Repayment
    const studentLoan =
      hasStudentLoan && totalGross > r.studentLoanWeeklyThreshold
        ? Math.round((totalGross - r.studentLoanWeeklyThreshold) * r.studentLoanRate * 100) / 100
        : 0;

    // Total Deductions (from employee's pay)
    const totalDeductions =
      Math.round((paye + accLevyEmployee + kiwisaverEmployee + studentLoan) * 100) / 100;

    const netPay = Math.round((totalGross - totalDeductions) * 100) / 100;

    // 6. Employer Costs
    const kiwisaverEmployer = Math.round(totalGross * r.kiwisaverEmployerMin * 100) / 100;
    const annualEstimate = input.annualSalaryEstimate || totalGross * 52;
    const esct = Math.round(this.calculateESCT(kiwisaverEmployer, annualEstimate) * 100) / 100;
    const accLevyEmployer = Math.round(accLiableEarnings * 0.014 * 100) / 100; // ~1.4% work levy

    const totalEmployerCost =
      Math.round((totalGross + kiwisaverEmployer + esct + accLevyEmployer) * 100) / 100;

    return {
      grossEarnings,
      holidayPay,
      totalGross,
      paye,
      accLevyEmployee,
      kiwisaverEmployee,
      studentLoan,
      totalDeductions,
      netPay,
      kiwisaverEmployer,
      esct,
      accLevyEmployer,
      totalEmployerCost,
    };
  },

  /**
   * Progressive PAYE calculation on weekly earnings.
   * Usa tramos semanales del ano fiscal vigente.
   */
  calculatePAYE(weeklyGross: number): number {
    const brackets = rates().payeBracketsWeekly;
    let remaining = weeklyGross;
    let tax = 0;
    let prevThreshold = 0;

    for (const bracket of brackets) {
      const taxable = Math.min(remaining, bracket.upTo - prevThreshold);
      if (taxable <= 0) break;
      tax += taxable * bracket.rate;
      remaining -= taxable;
      prevThreshold = bracket.upTo;
    }

    return Math.round(tax * 100) / 100;
  },

  /**
   * Calculate ESCT on employer KiwiSaver contribution.
   * Rate based on employee's estimated annual salary + employer KS contribution.
   */
  calculateESCT(weeklyEmployerKS: number, annualSalary: number): number {
    const esctBrackets = rates().esctBrackets;
    const total = annualSalary + weeklyEmployerKS * 52;
    let rate = 0.105;
    for (const bracket of esctBrackets) {
      if (total <= bracket.upTo) {
        rate = bracket.rate;
        break;
      }
    }
    return weeklyEmployerKS * rate;
  },

  /**
   * Calculate annual leave entitlement.
   */
  getAnnualLeaveEntitlement(weeksWorked: number, weeklyRate: number) {
    const leaveWeeks = rates().annualLeaveWeeks;
    const entitlementWeeks = Math.min(leaveWeeks, (weeksWorked / 52) * leaveWeeks);
    return {
      weeksAccrued: Math.round(entitlementWeeks * 100) / 100,
      dollarValue: Math.round(entitlementWeeks * weeklyRate * 100) / 100,
    };
  },

  /**
   * Generate payslip summary for one worker.
   */
  generatePayslip(workerName: string, input: PayrollInput): string {
    const d = this.calculate(input);
    return [
      `=== PAYSLIP: ${workerName} ===`,
      `Gross Earnings:    $${d.grossEarnings.toFixed(2)}`,
      `Holiday Pay (8%):  $${d.holidayPay.toFixed(2)}`,
      `Total Gross:       $${d.totalGross.toFixed(2)}`,
      `---`,
      `PAYE Tax:         -$${d.paye.toFixed(2)}`,
      `ACC Levy:         -$${d.accLevyEmployee.toFixed(2)}`,
      `KiwiSaver (${(input.kiwisaverRate * 100).toFixed(0)}%): -$${d.kiwisaverEmployee.toFixed(2)}`,
      d.studentLoan > 0 ? `Student Loan:     -$${d.studentLoan.toFixed(2)}` : null,
      `Total Deductions: -$${d.totalDeductions.toFixed(2)}`,
      `===`,
      `NET PAY:           $${d.netPay.toFixed(2)}`,
      `===`,
      `Employer KiwiSaver: $${d.kiwisaverEmployer.toFixed(2)}`,
      `Employer ACC Work:  $${d.accLevyEmployer.toFixed(2)}`,
      `ESCT:               $${d.esct.toFixed(2)}`,
      `Total Employer Cost: $${d.totalEmployerCost.toFixed(2)}`,
    ]
      .filter(Boolean)
      .join('\n');
  },

  /** Get current tax rates for display — delegado a config versionada */
  getCurrentRates() {
    const r = rates();
    return {
      taxYear: r.taxYear,
      payeBrackets: r.payeBracketsWeekly,
      accEarnerLevy: r.accEarnerLevyRate,
      accMaxLiable: r.accMaxLiableAnnual,
      kiwisaverMin: r.kiwisaverEmployerMin,
      casualHolidayPay: r.casualHolidayPayRate,
      annualLeaveWeeks: r.annualLeaveWeeks,
      minimumWage: r.minimumWageHourly,
    };
  },

  /**
   * Obtener configuracion para un ano fiscal especifico (para recalculos historicos).
   */
  getRatesForDate(date: Date) {
    return getTaxYearConfig(date);
  },
};
