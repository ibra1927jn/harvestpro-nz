/**
 * export-pdf-template.service — Deep functional tests
 * Targets: escHtml, generatePDFContent
 */
import { describe, it, expect } from 'vitest';
import { escHtml, generatePDFContent } from '../export-pdf-template.service';
import type { PayrollExportData } from '../export.service';

function makeData(overrides: Partial<PayrollExportData> = {}): PayrollExportData {
    return {
        date: '2026-03-01',
        crew: [
            {
                id: 'p1', name: 'Alice Smith', employeeId: 'EMP-001',
                buckets: 50, hours: 8.0, pieceEarnings: 250, minimumTopUp: 0,
                totalEarnings: 250, status: 'Compliant',
            },
        ],
        summary: {
            totalBuckets: 50, totalHours: 8.0, totalPieceEarnings: 250,
            totalMinimumTopUp: 0, grandTotal: 250, averageBucketsPerHour: 6.3,
        },
        ...overrides,
    };
}

// ──────────────────────────────────────────────────────
// escHtml
// ──────────────────────────────────────────────────────
describe('escHtml', () => {
    it('escapes ampersand', () => {
        expect(escHtml('A & B')).toBe('A &amp; B');
    });

    it('escapes angle brackets', () => {
        expect(escHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('escapes double quotes', () => {
        expect(escHtml('She said "hello"')).toBe('She said &quot;hello&quot;');
    });

    it('returns empty string for empty input', () => {
        expect(escHtml('')).toBe('');
    });

    it('does not escape safe strings', () => {
        expect(escHtml('Alice Smith')).toBe('Alice Smith');
    });

    it('handles multiple special characters in sequence', () => {
        expect(escHtml('<>&"')).toBe('&lt;&gt;&amp;&quot;');
    });
});

// ──────────────────────────────────────────────────────
// generatePDFContent
// ──────────────────────────────────────────────────────
describe('generatePDFContent', () => {
    it('returns valid HTML with DOCTYPE', () => {
        const html = generatePDFContent(makeData());
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('</html>');
    });

    it('includes the date in the report', () => {
        const html = generatePDFContent(makeData({ date: '2026-03-15' }));
        expect(html).toContain('2026-03-15');
    });

    it('includes HarvestPro NZ branding', () => {
        const html = generatePDFContent(makeData());
        expect(html).toContain('HarvestPro NZ');
        expect(html).toContain('Weekly Payroll Report');
    });

    it('renders crew member data', () => {
        const html = generatePDFContent(makeData());
        expect(html).toContain('Alice Smith');
        expect(html).toContain('EMP-001');
        expect(html).toContain('$250.00');
    });

    it('renders multiple crew members', () => {
        const data = makeData({
            crew: [
                { id: 'p1', name: 'Alice', employeeId: 'E1', buckets: 50, hours: 8, pieceEarnings: 250, minimumTopUp: 0, totalEarnings: 250, status: 'OK' },
                { id: 'p2', name: 'Bob', employeeId: 'E2', buckets: 30, hours: 6, pieceEarnings: 150, minimumTopUp: 30, totalEarnings: 180, status: 'Below' },
            ],
        });
        const html = generatePDFContent(data);
        expect(html).toContain('Alice');
        expect(html).toContain('Bob');
    });

    it('renders summary section', () => {
        const html = generatePDFContent(makeData());
        expect(html).toContain('Summary');
        expect(html).toContain('Total Buckets');
        expect(html).toContain('Grand Total');
    });

    it('renders summary values correctly', () => {
        const html = generatePDFContent(makeData({
            summary: { totalBuckets: 100, totalHours: 20.5, totalPieceEarnings: 500, totalMinimumTopUp: 50, grandTotal: 550, averageBucketsPerHour: 4.9 },
        }));
        expect(html).toContain('100');      // totalBuckets
        expect(html).toContain('20.5');     // totalHours
        expect(html).toContain('$500.00');  // totalPieceEarnings
        expect(html).toContain('$550.00');  // grandTotal
        expect(html).toContain('4.9');      // avgBPA
    });

    it('shows custom piece rate in footer when provided', () => {
        const html = generatePDFContent(makeData(), { pieceRate: 7.50 });
        expect(html).toContain('$7.5/bucket');
    });

    it('shows custom minimum wage in footer when provided', () => {
        const html = generatePDFContent(makeData(), { minWage: 25 });
        expect(html).toContain('$25/hr');
    });

    it('uses default rates when no options provided', () => {
        const html = generatePDFContent(makeData());
        expect(html).toContain('Minimum Wage: $');
        expect(html).toContain('Default piece rate: $');
    });

    it('escapes HTML in crew member names', () => {
        const data = makeData({
            crew: [{ id: 'p1', name: '<script>xss</script>', employeeId: 'E1', buckets: 0, hours: 0, pieceEarnings: 0, minimumTopUp: 0, totalEarnings: 0, status: 'OK' }],
        });
        const html = generatePDFContent(data);
        expect(html).toContain('&lt;script&gt;');
        expect(html).not.toContain('<script>xss');
    });

    it('includes print styles', () => {
        const html = generatePDFContent(makeData());
        expect(html).toContain('@media print');
    });

    it('handles empty crew array', () => {
        const html = generatePDFContent(makeData({ crew: [] }));
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<tbody>');
    });

    it('renders footer with system name', () => {
        const html = generatePDFContent(makeData());
        expect(html).toContain('HarvestPro NZ - Payroll Management System');
    });
});

