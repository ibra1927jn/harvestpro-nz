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
