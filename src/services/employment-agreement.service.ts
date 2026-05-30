/**
 * Employment Agreement Template Generator
 *
 * AUDIT C-4: Generates NZ-compliant Individual Employment Agreements (IEAs)
 * for seasonal workers as required by the Employment Relations Act 2000.
 *
 * NZ requires a written employment agreement for ALL employees, including:
 *   - Names of employer and employee
 *   - Description of work to be performed
 *   - Place of work
 *   - Agreed hours / availability
 *   - Wages / salary / piece rates
 *   - Trial period clause (if applicable, max 90 days)
 *   - Dispute resolution process
 *   - Holiday/leave entitlements
 *
 * References:
 *   - Employment Relations Act 2000, Section 65
 *   - Employment Relations (Trial Periods) Amendment Act 2009
 *
 * @module services/employment-agreement
 */

export interface AgreementInput {
  employerName: string;
  orchardName: string;
  orchardAddress: string;
  employeeName: string;
  employeeIrdNumber?: string;
  startDate: string;
  endDate?: string; // For fixed-term
  pieceRate: number;
  minimumWageRate: number;
  kiwisaverRate: number;
  trialPeriodDays?: number; // Max 90 days
  isRSE: boolean; // Recognised Seasonal Employer scheme worker
}

/** Format a KiwiSaver rate (e.g. 0.035) as a human-readable percentage with
 * the minimum decimals required. 0.04 → "4%", 0.035 → "3.5%". */
function formatKiwiSaverPct(rate: number): string {
  const pct = rate * 100;
  const text = Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1);
  return `${text}%`;
}

export const employmentAgreementService = {
  /**
   * Generate a plain-text IEA from template + inputs.
   */
  generate(input: AgreementInput): string {
    const isFixedTerm = !!input.endDate;
    const trialDays = Math.min(input.trialPeriodDays || 0, 90);

    return `
INDIVIDUAL EMPLOYMENT AGREEMENT
================================

Employer:     ${input.employerName}
Orchard:      ${input.orchardName}
Address:      ${input.orchardAddress}

Employee:     ${input.employeeName}
IRD Number:   ${input.employeeIrdNumber || '(to be provided)'}
${input.isRSE ? 'Status:       RSE (Recognised Seasonal Employer Scheme)\n' : ''}

1. COMMENCEMENT AND TERM
   Start Date:   ${input.startDate}
   ${
     isFixedTerm
       ? `End Date:     ${input.endDate}\n   Type:         Fixed-term (seasonal employment)`
       : 'Type:         Permanent (ongoing)'
   }
   ${trialDays > 0 ? `\n   Trial Period: ${trialDays} days from commencement (per Employment Relations Act 2000, s 67A)` : ''}

2. DESCRIPTION OF WORK
   The employee will perform seasonal harvest work including but not limited to:
   - Fruit picking (cherry, apple, kiwifruit, grape as applicable)
   - Sorting and quality grading of harvested produce
   - Bin/bucket handling and orchard maintenance as directed
   - Compliance with food safety and hygiene standards

3. PLACE OF WORK
   ${input.orchardName}, ${input.orchardAddress}

4. HOURS OF WORK
   Ordinary hours: Monday to Saturday, 6:00 AM – 6:00 PM
   The employer may request overtime with at least 24 hours' notice.
   Maximum hours: 50 per week (inclusive of overtime).

5. REMUNERATION
   Payment Basis: Piece Rate
   Piece Rate:    $${input.pieceRate.toFixed(2)} per bucket/bin
   Minimum Wage:  $${input.minimumWageRate.toFixed(2)} per hour (top-up applies if piece earnings
                  fall below minimum wage, per Minimum Wage Act 1983)

   Pay Period:    Weekly (every Friday)
   Pay Method:    Direct credit to nominated bank account

6. DEDUCTIONS
   - PAYE income tax (as per Tax Administration Act 1994)
   - ACC earner's levy (Accident Compensation Act 2001)
   - KiwiSaver contribution: ${formatKiwiSaverPct(input.kiwisaverRate)} (employee contribution)
   - Employer KiwiSaver contribution: 3.5% (compulsory, KiwiSaver Amendment Act 2025, from 1 April 2026)
   ${input.isRSE ? '- Note: RSE workers may be exempt from KiwiSaver if visa < 12 months' : ''}

7. LEAVE ENTITLEMENTS (Holidays Act 2003)
   - Annual leave: ${isFixedTerm ? '8% of gross earnings paid with each pay' : '4 weeks per year after 12 months'}
   - Public holidays: 13 designated public holidays per year
   - Sick leave: 10 days per year after 6 months' service
   - Bereavement leave: 3 days (spouse/partner/parent/child), 1 day (other)
   ${input.isRSE ? '- RSE Special: Holiday pay calculated at 8% of gross (casual basis)' : ''}

8. REST AND MEAL BREAKS (Employment Relations Act 2000, Part 6D)
   - 10-min paid rest break after every 2 hours worked
   - 30-min unpaid meal break after every 4 hours worked
   - Breaks are not to be aggregated or taken at end of shift

9. HEALTH AND SAFETY
   The employer will provide:
   - Safe working conditions and adequate training
   - Personal protective equipment as required
   - First aid facilities and emergency procedures
   The employee must:
   - Follow all health and safety instructions
   - Report hazards and incidents immediately
   - Not work while impaired by alcohol or drugs

10. TERMINATION
    Notice Period: ${isFixedTerm ? '1 week (or as per fixed term)' : '2 weeks from either party'}
    ${trialDays > 0 ? `During trial period: Either party may terminate with 1 week notice, no personal grievance for unjustified dismissal.` : ''}
    Serious misconduct may result in summary dismissal.

11. DISPUTE RESOLUTION
    Step 1: Direct discussion between employee and employer
    Step 2: Mediation through the Ministry of Business, Innovation and Employment (MBIE)
    Step 3: Employment Relations Authority referral
    (per Employment Relations Act 2000, Part 10)

12. PRIVACY & DATA
    Personal information is collected under the Privacy Act 2020 and used
    for employment administration, payroll, and statutory compliance only.
    Employee rights under Information Privacy Principles 6-7 apply.

13. ACKNOWLEDGEMENT
    Both parties have had the opportunity to seek independent advice before
    signing this agreement. This agreement complies with the Employment
    Relations Act 2000, Section 65.

    Signed by Employer: ______________________ Date: __________

    Signed by Employee: ______________________ Date: __________

This agreement was generated by HarvestPro NZ on ${new Date().toISOString().split('T')[0]}.
    `.trim();
  },

  /**
   * Validate agreement inputs before generation.
   */
  validate(input: AgreementInput): string[] {
    const errors: string[] = [];
    if (!input.employerName.trim()) errors.push('Employer name is required');
    if (!input.employeeName.trim()) errors.push('Employee name is required');
    if (!input.orchardName.trim()) errors.push('Orchard name is required');
    if (!input.startDate) errors.push('Start date is required');
    if (input.pieceRate <= 0) errors.push('Piece rate must be positive');
    if (input.minimumWageRate <= 0) errors.push('Minimum wage rate must be positive');
    if (input.trialPeriodDays && input.trialPeriodDays > 90) {
      errors.push('Trial period cannot exceed 90 days (Employment Relations Act 2000)');
    }
    return errors;
  },
};
