/**
 * Tests for export-payroll-formats.service.ts
 * Covers: generateXeroCSV, generatePaySauceCSV
 */
import { describe, it, expect } from 'vitest';
import { generateXeroCSV, generatePaySauceCSV } from '../export-payroll-formats.service';
import type { PayrollExportData } from '../export.service';

const mockData: PayrollExportData = {
    date: '2026-03-04',
    crew: [
        { id: '1', name: 'Ana Lopez', employeeId: 'EMP001', buckets: 50, hours: 8, pieceEarnings: 150, minimumTopUp: 10, totalEarnings: 160, status: 'safe' },
        { id: '2', name: 'Ben Smith', employeeId: 'EMP002', buckets: 20, hours: 8, pieceEarnings: 60, minimumTopUp: 100.60, totalEarnings: 160.60, status: 'at_risk' },
        { id: '3', name: 'Carlos Vega', employeeId: 'EMP003', buckets: 0, hours: 0, pieceEarnings: 0, minimumTopUp: 0, totalEarnings: 0, status: 'inactive' },
    ],
    summary: { totalBuckets: 70, totalHours: 16, totalPieceEarnings: 210, totalMinimumTopUp: 110.60, grandTotal: 320.60, averageBucketsPerHour: 4.4 },
};

describe('generateXeroCSV', () => {
    it('generates valid CSV with headers', () => {
        const csv = generateXeroCSV(mockData);
        const lines = csv.split('\n');
        expect(lines[0]).toBe('Employee ID,Employee Name,Earnings Rate Name,Hours/Quantity,Rate,Amount');
    });

    it('emits piece rate line for workers with buckets', () => {
        const csv = generateXeroCSV(mockData);
        expect(csv).toContain('Piece Rate Earnings');
        expect(csv).toContain('EMP001');
    });

    it('emits minimum wage top-up line when applicable', () => {
        const csv = generateXeroCSV(mockData);
        expect(csv).toContain('Minimum Wage Top-Up');
        // Ben has top-up of 100.60
        expect(csv).toContain('100.60');
    });

    it('does NOT emit piece rate for 0-bucket workers', () => {
        const csv = generateXeroCSV(mockData);
        // Carlos has 0 buckets
        expect(csv).not.toContain('EMP003');
    });

    it('calculates correct piece rate from data', () => {
        const csv = generateXeroCSV(mockData);
        const lines = csv.split('\n');
        // Ana: 150 / 50 = 3.00 per bucket
        const anaLine = lines.find(l => l.includes('EMP001') && l.includes('Piece Rate'));
        expect(anaLine).toContain('3.00');
    });
});

describe('generatePaySauceCSV', () => {
    it('generates valid CSV with headers', () => {
        const csv = generatePaySauceCSV(mockData);
        const lines = csv.split('\n');
        expect(lines[0]).toBe('Employee Number,Pay Type,Description,Quantity,Rate,Amount');
    });

    it('emite una línea PIECE por cubetas (cantidad = cubetas, precio por cubeta)', () => {
        const csv = generatePaySauceCSV(mockData);
        const ana = csv.split('\n').find(l => l.startsWith('EMP001,PIECE'));
        expect(ana).toContain(',50,3.00,150.00');
    });

    it('skips workers with 0 hours + 0 earnings + 0 buckets', () => {
        const csv = generatePaySauceCSV(mockData);
        expect(csv).not.toContain('EMP003');
    });

    it('las líneas de una persona suman su total (cubetas + complemento)', () => {
        const csv = generatePaySauceCSV(mockData);
        const amount = csv.split('\n').filter(l => l.startsWith('EMP001,'))
            .reduce((s, l) => s + Number(l.split(',').pop()), 0);
        // Ana: 150 por cubetas + 10 de complemento = 160
        expect(amount).toBeCloseTo(160, 2);
    });
});

