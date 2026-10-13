/**
 * payrollService: fechas NZ que se piden al servidor y horas de la hoja de horas
 * con el calculo unico (sin simular nzst ni pay.ts).
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

const repo = vi.hoisted(() => ({
    invokeCalculatePayroll: vi.fn(),
    invokePayWeek: vi.fn(),
    fetchTimesheetAttendance: vi.fn(),
    fetchPickerNames: vi.fn(),
    fetchDayOfPeople: vi.fn(),
}));
vi.mock('@/repositories/payroll.repository', () => ({ payrollRepository: repo }));
vi.mock('@/repositories/pay-rates.repository', () => ({
    payRatesRepository: { load: vi.fn().mockResolvedValue({ varietyRates: [], orchardRates: {} }) },
}));
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

// test-setup.ts ya cargo los modulos reales: se recargan para que apliquen los vi.mock
let payrollService: typeof import('../payroll.service')['payrollService'];
beforeAll(async () => {
    vi.resetModules();
    ({ payrollService } = await import('../payroll.service'));
});

const RESULT = {
    orchard_id: 'o1', date_range: { start: '2026-10-05', end: '2026-10-11' },
    summary: { total_buckets: 0, total_hours: 0, total_piece_rate_earnings: 0, total_top_up: 0, total_earnings: 0 },
    compliance: { workers_below_minimum: 0, workers_total: 0, compliance_rate: 100 },
    picker_breakdown: [], settings: { bucket_rate: 6.5, min_wage_rate: 23.95 },
};

beforeEach(() => {
    for (const fn of Object.values(repo)) fn.mockReset();
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
            { id: 's2', picker_id: 'p1', orchard_id: 'B', check_in: t(d, '11:30'), check_out: t(d, '16:30'), break_start: null, break_minutes: null },
        ];
        repo.fetchTimesheetAttendance.mockResolvedValue({ data: [{ ...shifts[0], date: d, verified_by: null, updated_at: 'u' }], error: null });
        repo.fetchPickerNames.mockResolvedValue({ p1: 'Ana' });
        repo.fetchDayOfPeople.mockResolvedValue({ shifts, buckets: [] });

        const [row] = await payrollService.fetchTimesheets('A', d);

        // Dia: 4 h + 30 min trayecto + 5 h - 30 min descanso = 9 h. A pesa 4.25 de 9.5 -> 4.03 h
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
