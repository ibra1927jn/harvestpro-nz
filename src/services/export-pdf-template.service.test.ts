/**
 * export-pdf-template — HTML generation for payroll PDF.
 * Pure function tests: XSS escape, field interpolation, summary math.
 */
import { describe, it, expect } from 'vitest';
import { escHtml, generatePDFContent } from './export-pdf-template.service';

describe('escHtml', () => {
    it('escapa < > & "', () => {
        expect(escHtml('<script>alert("x")</script>&')).toBe(
            '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;',
        );
    });

    it('string vacío → vacío', () => {
        expect(escHtml('')).toBe('');
    });

    it('sin caracteres especiales → sin cambios', () => {
        expect(escHtml('Alice Smith 42')).toBe('Alice Smith 42');
    });

    it('preserva caracteres unicode (acentos, ñ)', () => {
        expect(escHtml('José Piña')).toBe('José Piña');
    });
});

describe('generatePDFContent', () => {
    const baseData = {
        date: '2026-04-18',
        crew: [
            {
                employeeId: 'E001',
                name: 'Alice',
                buckets: 50,
                hours: 8,
                pieceEarnings: 325,
                minimumTopUp: 0,
                totalEarnings: 325,
                status: 'paid',
            },
        ],
        summary: {
            totalBuckets: 50,
            totalHours: 8,
            averageBucketsPerHour: 6.25,
            totalPieceEarnings: 325,
            totalMinimumTopUp: 0,
            grandTotal: 325,
        },
    };

    it('incluye el HTML <!DOCTYPE> y <html>', () => {
        const html = generatePDFContent(baseData);
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<html>');
    });

    it('incluye la fecha del reporte', () => {
        const html = generatePDFContent(baseData);
        expect(html).toContain('2026-04-18');
    });

    it('renderiza cada picker con employee id + name + totals', () => {
        const html = generatePDFContent(baseData);
        expect(html).toContain('E001');
        expect(html).toContain('Alice');
        expect(html).toContain('$325.00');
    });

    it('escapa HTML en picker names (XSS)', () => {
        const html = generatePDFContent({
            ...baseData,
            crew: [{
                ...baseData.crew[0],
                name: '<script>alert(1)</script>',
                employeeId: 'E<"002',
            }],
        });
        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('&quot;');
    });

    it('incluye summary totals', () => {
        const html = generatePDFContent(baseData);
        expect(html).toContain('Total Buckets');
        expect(html).toContain('Grand Total');
        expect(html).toContain('$325.00');
    });

    it('respeta options.pieceRate override', () => {
        const html = generatePDFContent(baseData, { pieceRate: 7.5 });
        expect(html).toContain('piece rate: $7.5/bucket');
    });

    it('respeta options.minWage override', () => {
        const html = generatePDFContent(baseData, { minWage: 24 });
        expect(html).toContain('Minimum Wage: $24/hr');
    });

    it('crew vacío renderiza sin romper', () => {
        const html = generatePDFContent({ ...baseData, crew: [] });
        expect(html).toContain('<tbody>');
    });

    it('múltiples pickers todos aparecen', () => {
        const html = generatePDFContent({
            ...baseData,
            crew: [
                { ...baseData.crew[0], employeeId: 'E001', name: 'Alice' },
                { ...baseData.crew[0], employeeId: 'E002', name: 'Bob' },
                { ...baseData.crew[0], employeeId: 'E003', name: 'Carol' },
            ],
        });
        expect(html).toContain('E001');
        expect(html).toContain('E002');
        expect(html).toContain('E003');
        expect(html).toContain('Alice');
        expect(html).toContain('Bob');
        expect(html).toContain('Carol');
    });

    it('hours y earnings formatean con toFixed', () => {
        const html = generatePDFContent({
            ...baseData,
            crew: [{ ...baseData.crew[0], hours: 7.456, pieceEarnings: 100.5 }],
        });
        expect(html).toContain('7.5');
        expect(html).toContain('$100.50');
    });
});
