/**
 * employment-agreement.service.test.ts
 * Covers: generate(), validate()
 * Strategy: pure functions — no Supabase, no mocks needed.
 */
import { describe, it, expect } from 'vitest';
import { employmentAgreementService, AgreementInput } from '../employment-agreement.service';

const base: AgreementInput = {
  employerName: 'Sunrise Orchards Ltd',
  orchardName: 'Sunrise Block A',
  orchardAddress: '42 Valley Road, Havelock North 4130',
  employeeName: 'Te Aroha Williams',
  startDate: '2026-01-15',
  pieceRate: 6.5,
  minimumWageRate: 23.95,
  kiwisaverRate: 0.03,
  isRSE: false,
};

describe('employmentAgreementService', () => {
  describe('validate()', () => {
    it('returns empty array for valid input', () => {
      expect(employmentAgreementService.validate(base)).toHaveLength(0);
    });

    it('requires employerName', () => {
      const errs = employmentAgreementService.validate({ ...base, employerName: '   ' });
      expect(errs).toContain('Employer name is required');
    });

    it('requires employeeName', () => {
      const errs = employmentAgreementService.validate({ ...base, employeeName: '' });
      expect(errs).toContain('Employee name is required');
    });

    it('requires orchardName', () => {
      const errs = employmentAgreementService.validate({ ...base, orchardName: '' });
      expect(errs).toContain('Orchard name is required');
    });

    it('requires startDate', () => {
      const errs = employmentAgreementService.validate({ ...base, startDate: '' });
      expect(errs).toContain('Start date is required');
    });

    it('rejects zero pieceRate', () => {
      const errs = employmentAgreementService.validate({ ...base, pieceRate: 0 });
      expect(errs).toContain('Piece rate must be positive');
    });

    it('rejects negative pieceRate', () => {
      const errs = employmentAgreementService.validate({ ...base, pieceRate: -1 });
      expect(errs).toContain('Piece rate must be positive');
    });

    it('rejects zero minimumWageRate', () => {
      const errs = employmentAgreementService.validate({ ...base, minimumWageRate: 0 });
      expect(errs).toContain('Minimum wage rate must be positive');
    });

    it('rejects trial period > 90 days', () => {
      const errs = employmentAgreementService.validate({ ...base, trialPeriodDays: 91 });
      expect(errs).toContain('Trial period cannot exceed 90 days (Employment Relations Act 2000)');
    });

    it('allows trial period = 90 days (maximum allowed)', () => {
      const errs = employmentAgreementService.validate({ ...base, trialPeriodDays: 90 });
      expect(errs).toHaveLength(0);
    });

    it('can return multiple errors at once', () => {
      const errs = employmentAgreementService.validate({
        ...base,
        employerName: '',
        employeeName: '',
        pieceRate: 0,
      });
      expect(errs.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('generate()', () => {
    it('includes employer and employee name', () => {
      const text = employmentAgreementService.generate(base);
      expect(text).toContain('Sunrise Orchards Ltd');
      expect(text).toContain('Te Aroha Williams');
    });

    it('includes orchard name and address', () => {
      const text = employmentAgreementService.generate(base);
      expect(text).toContain('Sunrise Block A');
      expect(text).toContain('42 Valley Road, Havelock North 4130');
    });

    it('includes piece rate formatted to 2 decimals', () => {
      const text = employmentAgreementService.generate({ ...base, pieceRate: 6.5 });
      expect(text).toContain('$6.50 per bucket/bin');
    });

    it('includes minimum wage rate', () => {
      const text = employmentAgreementService.generate(base);
      expect(text).toContain('$23.95');
    });

    it('includes KiwiSaver percentage', () => {
      const text = employmentAgreementService.generate({ ...base, kiwisaverRate: 0.04 });
      expect(text).toContain('4%');
    });

    it('fixed-term agreement includes end date', () => {
      const text = employmentAgreementService.generate({ ...base, endDate: '2026-06-30' });
      expect(text).toContain('2026-06-30');
      expect(text).toContain('Fixed-term');
    });

    it('ongoing agreement does not say Fixed-term', () => {
      const text = employmentAgreementService.generate(base); // no endDate
      expect(text).toContain('Permanent');
      expect(text).not.toContain('Fixed-term');
    });

    it('annual leave is 8% for fixed-term (casual)', () => {
      const text = employmentAgreementService.generate({ ...base, endDate: '2026-06-30' });
      expect(text).toContain('8% of gross earnings');
    });

    it('annual leave is 4 weeks for permanent', () => {
      const text = employmentAgreementService.generate(base);
      expect(text).toContain('4 weeks per year');
    });

    it('includes RSE status when isRSE = true', () => {
      const text = employmentAgreementService.generate({ ...base, isRSE: true });
      expect(text).toContain('RSE (Recognised Seasonal Employer Scheme)');
    });

    it('default meal break is paid (Wages Protection Act 1983 s.5 fallback)', () => {
      const text = employmentAgreementService.generate(base); // no mealBreakPaid set
      expect(text).toContain('30-min paid meal break');
      expect(text).not.toContain('30-min unpaid meal break');
    });

    it('meal break rendered as unpaid when mealBreakPaid = false', () => {
      const text = employmentAgreementService.generate({ ...base, mealBreakPaid: false });
      expect(text).toContain('30-min unpaid meal break');
    });

    it('includes trial period clause when trialPeriodDays > 0', () => {
      const text = employmentAgreementService.generate({ ...base, trialPeriodDays: 30 });
      expect(text).toContain('Trial Period: 30 days');
    });

    it('caps trial period at 90 days in generated text', () => {
      const text = employmentAgreementService.generate({ ...base, trialPeriodDays: 120 });
      expect(text).toContain('Trial Period: 90 days');
    });

    it('no trial period clause when trialPeriodDays is 0', () => {
      const text = employmentAgreementService.generate({ ...base, trialPeriodDays: 0 });
      expect(text).not.toContain('Trial Period:');
    });

    it('includes IRD number when provided', () => {
      const text = employmentAgreementService.generate({
        ...base,
        employeeIrdNumber: '123-456-789',
      });
      expect(text).toContain('123-456-789');
    });

    it('uses placeholder when IRD number not provided', () => {
      const text = employmentAgreementService.generate(base);
      expect(text).toContain('(to be provided)');
    });

    it('includes Employment Relations Act reference', () => {
      const text = employmentAgreementService.generate(base);
      expect(text).toContain('Employment Relations Act 2000');
    });

    it('includes dispute resolution section', () => {
      const text = employmentAgreementService.generate(base);
      expect(text).toContain('DISPUTE RESOLUTION');
      expect(text).toContain('MBIE');
    });

    it('returns a non-empty trimmed string', () => {
      const text = employmentAgreementService.generate(base);
      expect(text.trim().length).toBeGreaterThan(500);
    });
  });
});
