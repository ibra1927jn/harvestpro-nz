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


// ── Comportamiento exacto y robustez del CSV ────────────────────────────────
import Papa from 'papaparse';
import fc from 'fast-check';

type Person = PayrollExportData['crew'][number];
const person = (over: Partial<Person>): Person => ({
    id: 'x', name: 'Ana', employeeId: 'E1', buckets: 0, hours: 0, pieceEarnings: 0, minimumTopUp: 0, totalEarnings: 0, status: 'safe', ...over,
});
const parse = (csv: string) => Papa.parse<string[]>(csv, { skipEmptyLines: true }).data;

describe('payroll CSV — exact lines', () => {
    it('Xero: one line per variety and price, holiday premium and top-up, amounts to the cent', () => {
        const csv = generateXeroCSV({
            date: 'w', crew: [person({
                buckets: 32, hours: 16, pieceEarnings: 213.3, holidayPremium: 15.5, minimumTopUp: 154.4, totalEarnings: 383.2,
                pieceLines: [
                    { variety: 'Envy', rate: 7.35, buckets: 12, earnings: 88.2 },
                    { variety: 'Gala', rate: 6.1, buckets: 20, earnings: 122 },
                    { variety: '—', rate: 3.1, buckets: 1, earnings: 3.1 },
                    { variety: 'Empty', rate: 9, buckets: 0, earnings: 0 },
                ],
            })],
        });
        expect(parse(csv).slice(1)).toEqual([
            ['E1', 'Ana', 'Piece Rate - Envy', '12', '7.35', '88.20'],
            ['E1', 'Ana', 'Piece Rate - Gala', '20', '6.10', '122.00'],
            ['E1', 'Ana', 'Piece Rate Earnings', '1', '3.10', '3.10'],
            ['E1', 'Ana', 'Public Holiday Premium', '1', '15.50', '15.50'],
            ['E1', 'Ana', 'Minimum Wage Top-Up', '16.00', '9.6500', '154.40'],
        ]);
    });

    it('PaySauce: hours-only worker gets a single top-up line; zero worker is skipped', () => {
        const csv = generatePaySauceCSV({
            date: 'w', crew: [
                person({ employeeId: 'E2', hours: 4, minimumTopUp: 95.8, totalEarnings: 95.8 }),
                person({ employeeId: 'E3' }),
            ],
        });
        expect(parse(csv).slice(1)).toEqual([
            ['E2', 'MIN_WAGE_TOPUP', 'Minimum wage top-up (4.00h)', '4.00', '23.9500', '95.80'],
        ]);
    });

    it('PaySauce: variety lines, holiday premium, no top-up line when not owed, zero-bucket lines skipped', () => {
        const csv = generatePaySauceCSV({
            date: 'w', crew: [
                person({
                    employeeId: 'E5', buckets: 21, hours: 8, pieceEarnings: 140, holidayPremium: 70, minimumTopUp: 0, totalEarnings: 210,
                    pieceLines: [
                        { variety: 'Gala', rate: 6.5, buckets: 20, earnings: 130 },
                        { variety: '—', rate: 10, buckets: 1, earnings: 10 },
                        { variety: 'Envy', rate: 7, buckets: 0, earnings: 0 },
                    ],
                }),
                // Sin lineas por variedad: precio medio de sus cubetas
                person({ employeeId: 'E6', buckets: 4, hours: 0, pieceEarnings: 26, minimumTopUp: 0, totalEarnings: 26 }),
                // Solo ganancias (sin horas ni cubetas): se exporta igualmente
                person({ employeeId: 'E7', totalEarnings: 5, minimumTopUp: 5 }),
            ],
        });
        expect(parse(csv).slice(1)).toEqual([
            ['E5', 'PIECE', 'Harvest Gala buckets (8.00h worked)', '20', '6.50', '130.00'],
            ['E5', 'PIECE', 'Harvest buckets (8.00h worked)', '1', '10.00', '10.00'],
            ['E5', 'PUBLIC_HOLIDAY', 'Public holiday premium (time and a half on piece earnings)', '1', '70.00', '70.00'],
            ['E6', 'PIECE', 'Harvest buckets (0.00h worked)', '4', '6.50', '26.00'],
            // Sin horas: 1 × importe (antes 0.00 × 500.00 = 5.00, que no cuadraba)
            ['E7', 'MIN_WAGE_TOPUP', 'Minimum wage top-up (0.00h)', '1', '5.00', '5.00'],
        ]);
    });

    it('formula-looking cells are neutralised and still quoted when they contain commas', () => {
        const csv = generateXeroCSV({ date: 'w', crew: [person({ name: '=HYPERLINK("http://x"),"y"', employeeId: '+E1', buckets: 1, pieceEarnings: 6.5, totalEarnings: 6.5 })] });
        const rows = parse(csv);
        expect(rows[1]).toHaveLength(6);
        expect(rows[1][0]).toBe("'+E1");
        expect(rows[1][1]).toBe('\'=HYPERLINK("http://x"),"y"');
    });

    it('property: any name keeps 6 columns per row and lines add up to the worker total', () => {
        const name = fc.string({ maxLength: 20, unit: fc.constantFrom('a', 'Z', ' ', ',', '"', '\n', '\r', '=', '-', '+', '@') });
        const cents = fc.integer({ min: 0, max: 50_000 });
        fc.assert(fc.property(name, fc.integer({ min: 0, max: 200 }), cents, cents, fc.integer({ min: 0, max: 6000 }), (n, buckets, topUp, premium, hoursC) => {
            const piece = buckets * 6.5;
            const p = person({
                name: n, buckets, hours: hoursC / 100, pieceEarnings: piece, holidayPremium: premium / 100, minimumTopUp: topUp / 100,
                totalEarnings: piece + premium / 100 + topUp / 100,
            });
            for (const gen of [generateXeroCSV, generatePaySauceCSV]) {
                const rows = parse(gen({ date: 'w', crew: [p] })).slice(1);
                for (const r of rows) expect(r).toHaveLength(6);
                const sum = rows.reduce((s, r) => s + Math.round(Number(r[5]) * 100), 0);
                expect(sum).toBe(Math.round(p.totalEarnings * 100));
            }
        }), { numRuns: 300 });
    });
});

describe('topUpQuantityRate — quantity × rate is exactly the amount', () => {
    it('1.87 h with 28.34 $: a 2-decimal rate (15.16) gave 28.35; the 4-decimal rate gives 28.34', async () => {
        const { topUpQuantityRate } = await import('../export-payroll-formats.service');
        const [qty, rate] = topUpQuantityRate(1.87, 28.34);
        expect([qty, rate]).toEqual(['1.87', '15.1551']);
        expect(Math.round(Number(qty) * Number(rate) * 100)).toBe(2834);
    });

    it('any weekly hours and amount add up to the cent', async () => {
        const { topUpQuantityRate } = await import('../export-payroll-formats.service');
        for (let h = 0; h <= 7000; h += 37) {
            for (const amount of [0.01, 1.73, 28.34, 154.4, 999.99]) {
                const [qty, rate] = topUpQuantityRate(h / 100, amount);
                expect(Math.round(Number(qty) * Number(rate) * 100)).toBe(Math.round(amount * 100));
            }
        }
    });
});
