/**
 * Tests for export-payroll-formats.service.ts
 * Covers: generateXeroCSV with piece-rate and top-up rows, generatePaySauceCSV with edge cases
 */
import { describe, it, expect } from 'vitest';
import { generateXeroCSV, generatePaySauceCSV } from '../export-payroll-formats.service';

const mockData: any = {
    date: '2026-03-10',
    crew: [
        { employeeId: 'P01', name: 'Alice', buckets: 20, hours: 8, pieceEarnings: 130, minimumTopUp: 55.2, totalEarnings: 185.2, status: 'active' },
        { employeeId: 'P02', name: 'Bob', buckets: 40, hours: 8, pieceEarnings: 260, minimumTopUp: 0, totalEarnings: 260, status: 'active' },
    ],
    summary: { totalBuckets: 60, totalHours: 16, totalPieceEarnings: 390, totalMinimumTopUp: 55.2, grandTotal: 445.2, averageBucketsPerHour: 3.75 },
};

describe('generateXeroCSV', () => {
    it('includes headers', () => {
        const csv = generateXeroCSV(mockData);
        expect(csv).toContain('Employee ID');
        expect(csv).toContain('Earnings Rate Name');
    });

    it('generates piece rate row for pickers with buckets', () => {
        const csv = generateXeroCSV(mockData);
        expect(csv).toContain('Piece Rate Earnings');
        expect(csv).toContain('Alice');
    });

    it('generates top-up row only when needed', () => {
        const csv = generateXeroCSV(mockData);
        expect(csv).toContain('Minimum Wage Top-Up');
        // Bob has no top-up, so only Alice should have top-up row
        const topUpLines = csv.split('\n').filter((l: string) => l.includes('Minimum Wage Top-Up'));
        expect(topUpLines.length).toBe(1);
    });

    it('handles worker with zero buckets', () => {
        const data = { ...mockData, crew: [{ employeeId: 'P03', name: 'Zero', buckets: 0, hours: 4, pieceEarnings: 0, minimumTopUp: 92.6, totalEarnings: 92.6, status: 'active' }] };
        const csv = generateXeroCSV(data);
        // No piece rate row, but top-up row exists
        expect(csv).not.toContain('Piece Rate Earnings');
        expect(csv).toContain('Minimum Wage Top-Up');
    });
});

describe('generatePaySauceCSV', () => {
    it('includes headers', () => {
        const csv = generatePaySauceCSV(mockData);
        expect(csv).toContain('Employee Number');
        expect(csv).toContain('Pay Type');
    });

    it('generates earnings rows for workers', () => {
        const csv = generatePaySauceCSV(mockData);
        expect(csv).toContain('PIECE');
        expect(csv).toContain('P01');
    });

    it('skips workers with zero hours/buckets/earnings', () => {
        const data = { ...mockData, crew: [{ employeeId: 'P04', name: 'Z', buckets: 0, hours: 0, pieceEarnings: 0, minimumTopUp: 0, totalEarnings: 0, status: 'active' }] };
        const csv = generatePaySauceCSV(data);
        const lines = csv.split('\n');
        expect(lines.length).toBe(1); // Only headers
    });
});

