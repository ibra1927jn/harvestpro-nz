/**
 * INTEGRATION TEST: Export + Payroll Pipeline
 *
 * Fichajes + escaneos de una semana → cálculo único (buildWeekBreakdown,
 * mismo código que calculate-payroll) → preparePayrollData → CSV / Xero / PaySauce.
 * Comprueba que lo exportado suma exactamente lo calculado.
 */
import { describe, it, expect } from 'vitest';
import { exportService } from '@/services/export.service';
import { validationService } from '@/services/validation.service';
import { buildWeekBreakdown } from '@/hooks/useWeeklyReport';

const WEEK = { start: '2026-10-05', end: '2026-10-11' };
const DAYS = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
const t = (date: string, hhmm: string) => `${date}T${hhmm}:00+13:00`;

/** 10 pickers, lunes a viernes 07:00–16:00 (8.5 h pagables), ritmo distinto cada uno */
function weekOf10() {
    const crew = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `Picker ${i}` }));
    const attendance = crew.flatMap(p => DAYS.map(date => ({
        picker_id: p.id, date, check_in: t(date, '07:00'), check_out: t(date, '16:00'),
    })));
    const buckets = crew.flatMap((p, i) => DAYS.flatMap(date =>
        Array.from({ length: 10 + i * 6 }, (_, k) => ({
            picker_id: p.id,
            scanned_at: t(date, `${String(8 + (k % 7)).padStart(2, '0')}:${String(k % 60).padStart(2, '0')}`),
        })),
    ));
    return { crew, attendance, buckets };
}

describe('Export + Payroll Pipeline — Integration', () => {
    it('la exportación suma exactamente lo calculado (total, Xero, PaySauce, CSV)', () => {
        const { crew, attendance, buckets } = weekOf10();
        const breakdown = buildWeekBreakdown({ attendance, buckets, crew, pieceRate: 6.5, minWage: 23.95 });
        const calcTotal = Math.round(breakdown.reduce((s, p) => s + p.total_earnings, 0) * 100) / 100;

        const data = exportService.preparePayrollData(breakdown, WEEK, id => `EMP-${id}`);
        expect(data.crew).toHaveLength(10);
        expect(data.summary.grandTotal).toBe(calcTotal);
        expect(data.summary.totalHours).toBe(10 * 5 * 8.5);

        const sumAmounts = (csv: string) =>
            Math.round(csv.split('\n').slice(1).reduce((s, l) => s + parseFloat(l.split(',').pop() || '0'), 0) * 100) / 100;
        expect(sumAmounts(exportService.generateXeroCSV(data))).toBe(calcTotal);
        expect(sumAmounts(exportService.generatePaySauceCSV(data))).toBe(calcTotal);

        const csv = exportService.generateCSV(data);
        expect(csv).toContain(`Grand Total,,,,,,,${calcTotal.toFixed(2)}`);
        expect(csv.split('\n').filter(l => l.startsWith('EMP-')).length).toBe(10);
    });

    it('el complemento es por día también en la exportación', () => {
        // Lunes 80 cubetas (sin complemento), martes 10 (con complemento)
        const breakdown = buildWeekBreakdown({
            attendance: ['2026-10-05', '2026-10-06'].map(date => ({ picker_id: 'p1', date, check_in: t(date, '07:00'), check_out: t(date, '17:00') })),
            buckets: [
                ...Array.from({ length: 80 }, () => ({ picker_id: 'p1', scanned_at: t('2026-10-05', '10:00') })),
                ...Array.from({ length: 10 }, () => ({ picker_id: 'p1', scanned_at: t('2026-10-06', '10:00') })),
            ],
            crew: [{ id: 'p1', name: 'Ana' }],
            pieceRate: 6.5,
            minWage: 23.95,
        });
        const xero = exportService.generateXeroCSV(exportService.preparePayrollData(breakdown, WEEK, () => 'EMP-1'));
        expect(xero).toContain('EMP-1,Ana,Minimum Wage Top-Up,19.00');
        expect(xero).toContain('162.53');
    });

    it('CSV protege contra fórmulas en nombres', () => {
        const breakdown = buildWeekBreakdown({
            attendance: [{ picker_id: 'p1', date: '2026-10-05', check_in: t('2026-10-05', '07:00'), check_out: t('2026-10-05', '11:00') }],
            buckets: [],
            crew: [{ id: 'p1', name: '=cmd|calc' }],
            pieceRate: 6.5,
            minWage: 23.95,
        });
        const csv = exportService.generateCSV(exportService.preparePayrollData(breakdown, WEEK));
        expect(csv).not.toMatch(/(^|,)=cmd/m);
    });
});

// ── VALIDATION + SANITIZATION INTEGRATION ─────

describe('Validation + Sanitization Pipeline — Integration', () => {
  describe('Email → Sanitize → Validate', () => {
    it('valid email passes', () => {
      const email = 'worker@harvestpro.co.nz';
      const result = validationService.validateEmail(email);
      expect(result.valid).toBe(true);
    });

    it('XSS in email name rejected', () => {
      const email = '<script>@evil.com';
      const result = validationService.validateEmail(email);
      expect(result.valid).toBe(false);
    });

    it('empty email rejected', () => {
      expect(validationService.validateEmail('').valid).toBe(false);
    });
  });

  describe('Name → Sanitize → Validate', () => {
    it('valid NZ Māori name passes', () => {
      const result = validationService.validateName("Tama O'Brien-Smith");
      expect(result.valid).toBe(true);
    });

    it('name with XSS rejected', () => {
      const sanitized = validationService.sanitizeString('<script>alert(1)</script>');
      expect(sanitized).not.toContain('<script>');
    });

    it('sanitizeName trims and normalizes', () => {
      const cleaned = validationService.sanitizeName('  John   Doe  ');
      expect(cleaned).toBe('John Doe');
    });
  });

  describe('Phone → Sanitize → Validate', () => {
    it('NZ mobile passes', () => {
      const result = validationService.validatePhone('0274123456', true);
      expect(result.valid).toBe(true);
    });

    it('international format passes', () => {
      const result = validationService.validatePhone('+6474123456');
      expect(result.valid).toBe(true);
    });

    it('sanitizePhone strips non-digits', () => {
      const cleaned = validationService.sanitizePhone('+64 27-412-3456');
      expect(cleaned).toMatch(/^\+?\d+$/);
    });
  });

  describe('Employee ID validation', () => {
    it('valid employee ID passes', () => {
      expect(validationService.validateEmployeeId('EMP-12345').valid).toBe(true);
    });

    it('invalid employee ID fails', () => {
      expect(validationService.validateEmployeeId('').valid).toBe(false);
    });
  });

  describe('UUID validation', () => {
    it('valid UUID passes', () => {
      expect(validationService.validateUUID('550e8400-e29b-41d4-a716-446655440000').valid).toBe(
        true
      );
    });

    it('invalid UUID fails', () => {
      expect(validationService.validateUUID('not-a-uuid').valid).toBe(false);
    });
  });

  describe('SQL injection防御 — sanitizeForQuery', () => {
    it('escapes single quotes for defense-in-depth', () => {
      const result = validationService.sanitizeForQuery("'; DROP TABLE users; --");
      // sanitizeForQuery escapes quotes ('' → '''') as parameterized query protection
      expect(result).toContain("''");
    });

    it('trims and removes null bytes', () => {
      const result = validationService.sanitizeForQuery('  test\0value  ');
      expect(result).toBe('testvalue');
    });
  });

  describe('Batch validation: validateFields', () => {
    it('validates multiple fields at once', () => {
      const result = validationService.validateFields([
        {
          field: 'email',
          value: 'test@example.com',
          validator: v => validationService.validateEmail(v as string),
        },
        {
          field: 'name',
          value: 'Alice Smith',
          validator: v => validationService.validateName(v as string),
        },
      ]);

      expect(result.valid).toBe(true);
      expect(Object.keys(result.errors).length).toBe(0);
    });

    it('reports all field errors', () => {
      const result = validationService.validateFields([
        {
          field: 'email',
          value: 'bad-email',
          validator: v => validationService.validateEmail(v as string),
        },
        { field: 'name', value: '', validator: v => validationService.validateName(v as string) },
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors['email']).toBeDefined();
      expect(result.errors['name']).toBeDefined();
    });
  });
});
