/**
 * Historial de un picker: cada cuenta solo lee los precios de su huerto
 * (migración 20261027050000). Un día con cubetas de otro huerto no se paga con
 * un precio inventado: el importe queda sin calcular (null) y no cuenta para el
 * aviso de complemento crónico. Quien lee todos los precios (RRHH, nómina,
 * admin) ve el importe.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

const repo = vi.hoisted(() => ({
    getPickerById: vi.fn(),
    getUserName: vi.fn(),
    getAttendanceSince: vi.fn(),
    getBucketRecordsSince: vi.fn(),
    getInspectionsSince: vi.fn(),
    getDaySetupsSince: vi.fn(),
    getDaysElsewhere: vi.fn(),
}));
vi.mock('@/repositories/picker-history.repository', () => ({ pickerHistoryRepository: repo }));
const rates = vi.hoisted(() => ({ loadForPay: vi.fn() }));
vi.mock('@/repositories/piece-rates.repository', () => ({ pieceRatesRepository: rates }));
vi.mock('@/repositories/pay-rates.repository', () => ({ loadOrchardNames: vi.fn().mockResolvedValue({ A: 'Alpha', B: 'Beta' }) }));

import { pickerHistoryService } from '../picker-history.service';

const t = (date: string, hhmm: string) => `${date}T${hhmm}:00+13:00`;
const D1 = '2026-10-12'; // solo huerto A
const D2 = '2026-10-13'; // A por la mañana, B por la tarde

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T00:00:00Z'));
    for (const fn of Object.values(repo)) fn.mockReset();
    repo.getPickerById.mockResolvedValue({ id: 'p1', picker_id: 'P-1', name: 'Ana', team_leader_id: null, status: 'active', created_at: '2026-01-01' });
    repo.getAttendanceSince.mockResolvedValue([
        { date: D1, orchard_id: 'A', check_in: t(D1, '07:00'), check_out: t(D1, '11:00') },
        { date: D2, orchard_id: 'A', check_in: t(D2, '07:00'), check_out: t(D2, '11:00') },
        { date: D2, orchard_id: 'B', check_in: t(D2, '12:00'), check_out: t(D2, '15:00') },
    ]);
    repo.getBucketRecordsSince.mockResolvedValue([
        ...Array.from({ length: 10 }, () => ({ scanned_at: t(D1, '08:00'), orchard_id: 'A', variety: null, quality_grade: 'A' })),
        ...Array.from({ length: 10 }, () => ({ scanned_at: t(D2, '08:00'), orchard_id: 'A', variety: null, quality_grade: 'A' })),
        ...Array.from({ length: 10 }, () => ({ scanned_at: t(D2, '13:00'), orchard_id: 'B', variety: null, quality_grade: 'A' })),
    ]);
    repo.getInspectionsSince.mockResolvedValue([]);
    repo.getDaySetupsSince.mockResolvedValue([]);
    repo.getDaysElsewhere.mockResolvedValue(new Set());
});
afterEach(() => { vi.useRealTimers(); });

describe('picker history with prices of the own orchard only', () => {
    it('a day with buckets of an orchard whose price is not readable shows no amount', async () => {
        // Team leader / manager de A: solo el precio de A
        rates.loadForPay.mockResolvedValue({
            rates: [{ orchardId: 'A', variety: null, effectiveDate: '2026-10-01', pieceRate: 10 }],
            orchardFallbacks: { A: 10 },
        });
        const h = await pickerHistoryService.getPickerHistory('p1', 'A', 14);
        const day = (d: string) => h!.dailyRecords.find(r => r.date === d);
        // 4 h × 23.95 = 95.80 > 10 × 10: el día de A sale con su complemento
        expect(day(D1)).toMatchObject({ buckets: 10, earnings: 100 });
        expect(day(D2)?.buckets).toBe(20);
        expect(day(D2)?.earnings).toBeNull();
        expect(day(D2)?.topUp).toBeUndefined();
    });

    it('with every orchard\'s price (HR, payroll, admin) the day is paid in full', async () => {
        rates.loadForPay.mockResolvedValue({
            rates: [
                { orchardId: 'A', variety: null, effectiveDate: '2026-10-01', pieceRate: 10 },
                { orchardId: 'B', variety: null, effectiveDate: '2026-10-01', pieceRate: 12 },
            ],
            orchardFallbacks: { A: 10, B: 12 },
        });
        const h = await pickerHistoryService.getPickerHistory('p1', 'A', 14);
        expect(h!.dailyRecords.find(r => r.date === D2)?.earnings).toBe(220); // 10 × 10 + 10 × 12
    });

    it('if the prices cannot be loaded nothing is hidden (previous fallback)', async () => {
        rates.loadForPay.mockRejectedValue(new Error('offline'));
        const h = await pickerHistoryService.getPickerHistory('p1', 'A', 14);
        expect(typeof h!.dailyRecords.find(r => r.date === D2)?.earnings).toBe('number');
    });
});

// Migración 20261027070000: el manager de A no lee el tramo ni las cubetas de B.
// picker_days_elsewhere le dice qué días fueron partidos: horas y cubetas de aquí,
// pago «—» (el complemento es del día entero; está en Nómina).
describe('picker history when the other orchard\'s rows are not readable (manager)', () => {
    beforeEach(() => {
        repo.getAttendanceSince.mockResolvedValue([
            { date: D1, orchard_id: 'A', check_in: t(D1, '07:00'), check_out: t(D1, '11:00') },
            { date: D2, orchard_id: 'A', check_in: t(D2, '07:00'), check_out: t(D2, '11:00') },
        ]);
        repo.getBucketRecordsSince.mockResolvedValue([
            ...Array.from({ length: 10 }, () => ({ scanned_at: t(D1, '08:00'), orchard_id: 'A', variety: null, quality_grade: 'A' })),
            ...Array.from({ length: 10 }, () => ({ scanned_at: t(D2, '08:00'), orchard_id: 'A', variety: null, quality_grade: 'A' })),
        ]);
        rates.loadForPay.mockResolvedValue({
            rates: [{ orchardId: 'A', variety: null, effectiveDate: '2026-10-01', pieceRate: 10 }],
            orchardFallbacks: { A: 10 },
        });
    });

    it('a day partly in another orchard keeps this orchard\'s hours and buckets, with no amount', async () => {
        repo.getDaysElsewhere.mockResolvedValue(new Set([D2]));
        const h = await pickerHistoryService.getPickerHistory('p1', 'A', 14);
        const day = (d: string) => h!.dailyRecords.find(r => r.date === d);
        expect(repo.getDaysElsewhere).toHaveBeenCalledWith('p1', expect.any(String));
        expect(day(D2)).toMatchObject({ buckets: 10, hours: 4, earnings: null, partElsewhere: true });
        expect(day(D2)?.topUp).toBeUndefined();
        // Un día entero aquí sigue con su importe
        expect(day(D1)).toMatchObject({ earnings: 100 });
        expect(day(D1)?.partElsewhere).toBeUndefined();
    });

    it('whoever reads the other orchard\'s rows (HR, payroll, admin) gets the whole day priced', async () => {
        repo.getDaysElsewhere.mockResolvedValue(new Set([D2]));
        repo.getAttendanceSince.mockResolvedValue([
            { date: D2, orchard_id: 'A', check_in: t(D2, '07:00'), check_out: t(D2, '11:00') },
            { date: D2, orchard_id: 'B', check_in: t(D2, '12:00'), check_out: t(D2, '15:00') },
        ]);
        rates.loadForPay.mockResolvedValue({
            rates: [
                { orchardId: 'A', variety: null, effectiveDate: '2026-10-01', pieceRate: 10 },
                { orchardId: 'B', variety: null, effectiveDate: '2026-10-01', pieceRate: 12 },
            ],
            orchardFallbacks: { A: 10, B: 12 },
        });
        const h = await pickerHistoryService.getPickerHistory('p1', 'A', 14);
        const d2 = h!.dailyRecords.find(r => r.date === D2);
        expect(typeof d2?.earnings).toBe('number');
        expect(d2?.partElsewhere).toBeUndefined();
    });

    it('if the days elsewhere cannot be loaded the history still loads', async () => {
        repo.getDaysElsewhere.mockRejectedValue(new Error('offline'));
        const h = await pickerHistoryService.getPickerHistory('p1', 'A', 14);
        expect(h!.dailyRecords.find(r => r.date === D2)?.earnings).toBe(100);
    });
});
