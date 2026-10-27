/**
 * payrollService: fechas NZ que se piden al servidor y horas de la hoja de horas
 * con el calculo unico (sin simular nzst ni pay.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const repo = vi.hoisted(() => ({
    invokeCalculatePayroll: vi.fn(),
    invokePayWeek: vi.fn(),
    fetchTimesheetAttendance: vi.fn(),
    fetchPickerNames: vi.fn(),
    fetchDayOfPeople: vi.fn(),
}));
vi.mock('@/repositories/payroll.repository', () => ({ payrollRepository: repo }));
const rates = vi.hoisted(() => ({
    loadRange: vi.fn(),
    loadForPay: vi.fn(),
}));
vi.mock('@/repositories/piece-rates.repository', () => ({ pieceRatesRepository: rates }));
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { payrollService } from '../payroll.service';
import { supabase } from '@/services/supabase';

const RESULT = {
    orchard_id: 'o1', date_range: { start: '2026-10-05', end: '2026-10-11' },
    summary: { total_buckets: 0, total_hours: 0, total_piece_rate_earnings: 0, total_top_up: 0, total_earnings: 0 },
    compliance: { workers_below_minimum: 0, workers_total: 0, compliance_rate: 100 },
    picker_breakdown: [], settings: { bucket_rate: 6.5, min_wage_rate: 23.95 },
};

beforeEach(() => {
    for (const fn of Object.values(repo)) fn.mockReset();
    rates.loadRange.mockReset().mockResolvedValue([]);
    rates.loadForPay.mockReset().mockResolvedValue({ rates: [], orchardFallbacks: {} });
    repo.invokeCalculatePayroll.mockResolvedValue(RESULT);
});
afterEach(() => { vi.useRealTimers(); });

describe('date ranges sent to calculate-payroll', () => {
    it('this week = NZ Monday to NZ today, even late on Sunday NZ (Sunday morning UTC)', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-11T10:30:00Z')); // domingo 23:30 NZDT
        await payrollService.calculateThisWeek('o1');
        expect(repo.invokeCalculatePayroll).toHaveBeenCalledWith('o1', '2026-10-05', '2026-10-11');
    });

    it('on Monday just after NZ midnight the week starts that same Monday', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-11T11:05:00Z')); // lunes 00:05 NZDT
        await payrollService.calculateThisWeek('o1');
        expect(repo.invokeCalculatePayroll).toHaveBeenCalledWith('o1', '2026-10-12', '2026-10-12');
    });

    it('today uses the NZ date, not the UTC one', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-06-30T12:30:00Z')); // 1 jul 00:30 NZST
        await payrollService.calculateToday('o1');
        expect(repo.invokeCalculatePayroll).toHaveBeenCalledWith('o1', '2026-07-01', '2026-07-01');
    });
});

describe('pay week close / reopen', () => {
    it('close and reopen send the Monday and the reason to close-pay-week', async () => {
        repo.invokePayWeek.mockResolvedValue({ ok: true });
        await payrollService.closePayWeek('2026-10-05');
        await payrollService.reopenPayWeek('2026-10-05', 'missing timesheet');
        expect(repo.invokePayWeek.mock.calls).toEqual([
            [{ action: 'close', week_start: '2026-10-05' }],
            [{ action: 'reopen', week_start: '2026-10-05', reason: 'missing timesheet' }],
        ]);
    });

    it('a refused close (e.g. not payroll_admin) propagates the error', async () => {
        repo.invokePayWeek.mockRejectedValue(new Error('Only payroll_admin or admin can close a pay week'));
        await expect(payrollService.closePayWeek('2026-10-05')).rejects.toThrow('payroll_admin');
    });
});

describe('fetchTimesheets — hours from the single pay calculation', () => {
    const t = (date: string, hhmm: string) => `${date}T${hhmm}:00+13:00`;

    it('two orchards the same day: each sheet shows its share (time + half the travel, one break)', async () => {
        const d = '2026-10-12';
        const shifts = [
            { id: 's1', picker_id: 'p1', orchard_id: 'A', check_in: t(d, '07:00'), check_out: t(d, '11:00'), break_start: null, break_minutes: null },
            { id: 's2', picker_id: 'p1', orchard_id: 'B', check_in: t(d, '11:30'), check_out: t(d, '16:30'), break_start: t(d, '13:00'), break_minutes: null },
        ];
        repo.fetchTimesheetAttendance.mockResolvedValue({ data: [{ ...shifts[0], date: d, verified_by: null, updated_at: 'u' }], error: null });
        repo.fetchPickerNames.mockResolvedValue({ p1: 'Ana' });
        repo.fetchDayOfPeople.mockResolvedValue({ shifts, buckets: [] });

        const [row] = await payrollService.fetchTimesheets('A', d);

        // Dia: 4 h + 30 min trayecto + 5 h - 30 min descanso anotado = 9 h. A pesa 4.25 de 9.5 -> 4.03 h
        expect(row).toMatchObject({ id: 's1', picker_name: 'Ana', hours_worked: 4.03, requires_review: false });
        expect(repo.fetchDayOfPeople).toHaveBeenCalledWith(['p1'], d, '2026-10-12T00:00:00+13:00', '2026-10-12T23:59:59+13:00');
    });

    it('on the DST start day asks for the real NZ day (midnight +12, end of day +13)', async () => {
        const d = '2026-09-27';
        repo.fetchTimesheetAttendance.mockResolvedValue({ data: [{ id: 's1', picker_id: 'p1', orchard_id: 'A', date: d, check_in: null, check_out: null }], error: null });
        repo.fetchPickerNames.mockResolvedValue({});
        repo.fetchDayOfPeople.mockResolvedValue({ shifts: [], buckets: [] });
        await payrollService.fetchTimesheets('A', d);
        expect(repo.fetchDayOfPeople).toHaveBeenCalledWith(['p1'], d, '2026-09-27T00:00:00+12:00', '2026-09-27T23:59:59+13:00');
    });

    it('an open shift from a past day counts 0 h and is flagged for review', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-13T01:00:00Z'));
        const d = '2026-10-12';
        repo.fetchTimesheetAttendance.mockResolvedValue({ data: [{ id: 's1', picker_id: 'p1', orchard_id: 'A', date: d, check_in: t(d, '07:00'), check_out: null }], error: null });
        repo.fetchPickerNames.mockResolvedValue({});
        repo.fetchDayOfPeople.mockResolvedValue({ shifts: [], buckets: [] });
        const [row] = await payrollService.fetchTimesheets('A', d);
        expect(row).toMatchObject({ hours_worked: 0, requires_review: true, picker_name: 'Unknown', break_minutes: 30 });
    });

    it('repository error returns no rows', async () => {
        repo.fetchTimesheetAttendance.mockResolvedValue({ data: [], error: { message: 'rls' } });
        expect(await payrollService.fetchTimesheets('A', '2026-10-12')).toEqual([]);
    });
});

// Auditoría 23-10 (A4): la hoja diaria de un día pasado no cambia al cambiar el precio hoy
describe('daily timesheet uses the price of THAT day', () => {
    const t = (date: string, hhmm: string) => `${date}T${hhmm}:00+13:00`;
    function table(data: unknown) {
        const q: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'is', 'gte', 'lte', 'order', 'range']) q[m] = vi.fn(() => q);
        q.single = vi.fn(() => Promise.resolve({ data, error: null }));
        q.then = (ok?: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok);
        return q;
    }

    it('pieces of 2026-10-12 at the rate set on/before that day, per variety', async () => {
        const d = '2026-10-12';
        const shift = { id: 's1', picker_id: 'p1', orchard_id: 'A', check_in: t(d, '07:00'), check_out: t(d, '15:00'), break_start: null, break_minutes: null };
        const buckets = [
            ...Array.from({ length: 10 }, () => ({ picker_id: 'p1', orchard_id: 'A', variety: 'Braeburn', scanned_at: t(d, '09:00'), quality_grade: 'A' })),
            ...Array.from({ length: 10 }, () => ({ picker_id: 'p1', orchard_id: 'A', variety: 'Fuji', scanned_at: t(d, '10:00'), quality_grade: 'A' })),
        ];
        repo.fetchTimesheetAttendance.mockResolvedValue({ data: [{ ...shift, date: d, verified_by: null, updated_at: 'u' }], error: null });
        repo.fetchPickerNames.mockResolvedValue({ p1: 'Ana' });
        repo.fetchDayOfPeople.mockResolvedValue({ shifts: [shift], buckets });
        const dayRates = [
            { orchardId: 'A', variety: null, effectiveDate: '2026-10-01', pieceRate: 6.5 },
            { orchardId: 'A', variety: 'Braeburn', effectiveDate: '2026-10-10', pieceRate: 8 },
        ];
        rates.loadRange.mockResolvedValue(dayRates);
        rates.loadForPay.mockResolvedValue({ rates: dayRates, orchardFallbacks: { A: 9.99 } });
        const from = vi.spyOn(supabase, 'from').mockImplementation(((name: string) => name === 'harvest_settings'
            // harvest_settings ya tiene el precio de HOY (9.99): no debe usarse para el 12
            ? table({ piece_rate: 9.99, min_wage_rate: 23.95 })
            : table(buckets)) as never);

        const [rec] = await payrollService.generateDailyTimesheet('A', d);
        from.mockRestore();
        expect(rates.loadRange).toHaveBeenCalledWith(d, d);
        expect(rec).toMatchObject({ buckets_total: 20, piece_rate: 6.5, piece_earnings: 145 }); // 10 × 8 + 10 × 6.50
    });

    // Migración 20261027050000: el manager de A no lee el precio de B. El complemento
    // del día (A por la mañana, B por la tarde) sale del cálculo de nómina del servidor.
    it('top-up of a day in two orchards comes from calculate-payroll (B\'s price is not readable here)', async () => {
        const d = '2026-10-13';
        const shiftA = { id: 'sA', picker_id: 'p3', orchard_id: 'A', check_in: t(d, '07:00'), check_out: t(d, '11:00'), break_start: t(d, '09:00'), break_minutes: 30 };
        const shiftB = { id: 'sB', picker_id: 'p3', orchard_id: 'B', check_in: t(d, '12:00'), check_out: t(d, '15:00'), break_start: null, break_minutes: null };
        const bucketsA = Array.from({ length: 10 }, () => ({ picker_id: 'p3', orchard_id: 'A', variety: null, scanned_at: t(d, '08:00'), quality_grade: 'A' }));
        const bucketsB = Array.from({ length: 10 }, () => ({ picker_id: 'p3', orchard_id: 'B', variety: null, scanned_at: t(d, '13:00'), quality_grade: 'A' }));
        repo.fetchTimesheetAttendance.mockResolvedValue({ data: [{ ...shiftA, date: d, verified_by: null, updated_at: 'u' }], error: null });
        repo.fetchPickerNames.mockResolvedValue({ p3: 'Ana' });
        repo.fetchDayOfPeople.mockResolvedValue({ shifts: [shiftA, shiftB], buckets: [...bucketsA, ...bucketsB] });
        // Solo el precio de A es legible
        const onlyA = [{ orchardId: 'A', variety: null, effectiveDate: '2026-10-01', pieceRate: 5 }];
        rates.loadRange.mockResolvedValue(onlyA);
        rates.loadForPay.mockResolvedValue({ rates: onlyA, orchardFallbacks: { A: 5 } });
        const share = (orchardId: string, topUp: number) => ({ orchardId, hours: 4, buckets: 10, pieceEarnings: 50, holidayPremium: 0, topUp, total: 50 + topUp });
        repo.invokeCalculatePayroll.mockResolvedValue({
            ...RESULT, orchard_id: 'A', date_range: { start: d, end: d },
            picker_breakdown: [{
                picker_id: 'p3', picker_name: 'Ana', buckets: 10, hours_worked: 4.22, piece_rate_earnings: 50, hourly_rate: 11.85,
                minimum_required: 101.07, top_up_required: 33.54, total_earnings: 83.54, is_below_minimum: true,
                days: [{
                    date: d, segments: [], hours: 7.5, breakMinutes: 30, travelMinutes: 60, buckets: 20, bucketsByVariety: {},
                    pieceLines: [], byOrchard: [share('A', 33.54), share('B', 26.09)], pieceEarnings: 120, holidayPremium: 0,
                    topUp: 59.63, total: 179.63, belowMinimum: true, estimated: false, isPublicHoliday: false,
                }],
            }],
        });
        const from = vi.spyOn(supabase, 'from').mockImplementation(((name: string) => name === 'harvest_settings'
            ? table({ piece_rate: 5, min_wage_rate: 23.95 })
            : table(bucketsA)) as never);

        const [rec] = await payrollService.generateDailyTimesheet('A', d);
        from.mockRestore();
        expect(repo.invokeCalculatePayroll).toHaveBeenCalledWith('A', d, d);
        expect(rec).toMatchObject({ piece_earnings: 50, top_up: 33.54, is_below_minimum: true });
    });

    it('without calculate-payroll the top-up falls back to the local calculation', async () => {
        const d = '2026-10-13';
        const shift = { id: 's1', picker_id: 'p1', orchard_id: 'A', check_in: t(d, '07:00'), check_out: t(d, '11:00'), break_start: null, break_minutes: null };
        const buckets = Array.from({ length: 10 }, () => ({ picker_id: 'p1', orchard_id: 'A', variety: null, scanned_at: t(d, '08:00'), quality_grade: 'A' }));
        repo.fetchTimesheetAttendance.mockResolvedValue({ data: [{ ...shift, date: d, verified_by: null, updated_at: 'u' }], error: null });
        repo.fetchPickerNames.mockResolvedValue({ p1: 'Ana' });
        repo.fetchDayOfPeople.mockResolvedValue({ shifts: [shift], buckets });
        const onlyA = [{ orchardId: 'A', variety: null, effectiveDate: '2026-10-01', pieceRate: 5 }];
        rates.loadRange.mockResolvedValue(onlyA);
        rates.loadForPay.mockResolvedValue({ rates: onlyA, orchardFallbacks: { A: 5 } });
        repo.invokeCalculatePayroll.mockRejectedValue(new Error('offline'));
        const from = vi.spyOn(supabase, 'from').mockImplementation(((name: string) => name === 'harvest_settings'
            ? table({ piece_rate: 5, min_wage_rate: 23.95 })
            : table(buckets)) as never);

        const [rec] = await payrollService.generateDailyTimesheet('A', d);
        from.mockRestore();
        // 4 h × 23.95 = 95.80 − 50 de cubetas
        expect(rec).toMatchObject({ piece_earnings: 50, top_up: 45.8 });
    });
});
