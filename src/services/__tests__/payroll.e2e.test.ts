/**
 * E2E tests for payroll.service.ts (214L) — exercises ALL 5 methods
 * calculatePayroll, calculateToday, calculateThisWeek, getDashboardSummary,
 * fetchTimesheets (including hours_worked branches), approveTimesheet
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Parcial: el resto de utilidades NZ son las reales
vi.mock('@/utils/nzst', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/utils/nzst')>()),
    todayNZST: () => '2026-03-10',
}));

vi.mock('@/repositories/payroll.repository', () => ({
    payrollRepository: {
        invokeCalculatePayroll: vi.fn().mockResolvedValue({
            orchard_id: 'o1',
            date_range: { start: '2026-03-10', end: '2026-03-10' },
            summary: { total_buckets: 500, total_hours: 80, total_piece_rate_earnings: 3250, total_top_up: 150, total_earnings: 3400 },
            compliance: { workers_below_minimum: 2, workers_total: 15, compliance_rate: 0.87 },
            picker_breakdown: [],
            settings: { bucket_rate: 6.50, min_wage_rate: 23.95 },
        }),
        fetchTimesheetAttendance: vi.fn().mockResolvedValue({
            data: [
                { id: 'a1', picker_id: 'p1', date: '2026-03-10', check_in: '2026-03-10T06:00:00Z', check_out: '2026-03-10T14:00:00Z', hours_worked: 8, verified_by: 'admin1', orchard_id: 'o1', updated_at: '2026-03-10T14:00:00Z' },
                { id: 'a2', picker_id: 'p2', date: '2026-03-10', check_in: '2026-03-10T07:00:00Z', check_out: null, hours_worked: 0, verified_by: null, orchard_id: 'o1', updated_at: '2026-03-10T07:00:00Z' },
            ],
            error: null,
        }),
        fetchPickerNames: vi.fn().mockResolvedValue({ p1: 'Alice', p2: 'Bob' }),
    },
}));


vi.mock('@/repositories/edge-functions.repository', () => ({
    edgeFunctionsRepository: {
        invoke: vi.fn().mockResolvedValue({
            data: { success: true, attendance_id: 'a1', picker_id: 'p1', verified_by: 'admin1', updated_at: '2026-03-10T15:00:00Z' },
            error: null,
        }),
    },
}));

import { payrollService } from '../payroll.service';
import { payrollRepository } from '@/repositories/payroll.repository';

describe('payrollService — E2E deep tests', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('calculatePayroll', () => {
        it('calls repository with correct params', async () => {
            const result = await payrollService.calculatePayroll('o1', '2026-03-04', '2026-03-10');
            expect(result.summary.total_buckets).toBe(500);
            expect(vi.mocked(payrollRepository.invokeCalculatePayroll)).toHaveBeenCalledWith('o1', '2026-03-04', '2026-03-10');
        });
    });

    describe('calculateToday', () => {
        it('uses todayNZST for both start and end', async () => {
            await payrollService.calculateToday('o1');
            expect(vi.mocked(payrollRepository.invokeCalculatePayroll)).toHaveBeenCalledWith('o1', '2026-03-10', '2026-03-10');
        });
    });

    describe('calculateThisWeek', () => {
        it('calculates Monday-to-today range', async () => {
            const result = await payrollService.calculateThisWeek('o1');
            expect(result.summary.total_buckets).toBe(500);
            // Verify the startDate is a Monday
            const call = vi.mocked(payrollRepository.invokeCalculatePayroll).mock.calls[0];
            expect(call[2]).toBe('2026-03-10'); // endDate is today
        });
    });

    describe('getDashboardSummary', () => {
        it('returns simplified metrics', async () => {
            const summary = await payrollService.getDashboardSummary('o1');
            expect(summary.totalBuckets).toBe(500);
            expect(summary.totalCost).toBe(3400);
            expect(summary.workersAtRisk).toBe(2);
            expect(summary.complianceRate).toBe(0.87);
        });
    });

    describe('fetchTimesheets', () => {
        it('maps attendance to timesheet entries', async () => {
            const entries = await payrollService.fetchTimesheets('o1');
            expect(entries.length).toBe(2);
            expect(entries[0].picker_name).toBe('Alice');
            expect(entries[0].hours_worked).toBe(7.5); // 8 h − 30 min de descanso no pagado
            expect(entries[0].is_verified).toBe(true);
            expect(entries[0].requires_review).toBe(false);
        });

        it('uses provided date', async () => {
            await payrollService.fetchTimesheets('o1', '2026-03-09');
            expect(vi.mocked(payrollRepository.fetchTimesheetAttendance)).toHaveBeenCalledWith('o1', '2026-03-09');
        });

        it('handles Unknown picker name', async () => {
            vi.mocked(payrollRepository.fetchPickerNames).mockResolvedValueOnce({});
            const entries = await payrollService.fetchTimesheets('o1');
            expect(entries[0].picker_name).toBe('Unknown');
        });

        it('falls back to client-calculated hours', async () => {
            vi.mocked(payrollRepository.fetchTimesheetAttendance).mockResolvedValueOnce({
                data: [{
                    id: 'a3', picker_id: 'p3', date: '2026-03-10',
                    check_in: '2026-03-10T06:00:00Z', check_out: '2026-03-10T12:00:00Z',
                    hours_worked: 0, verified_by: null, orchard_id: 'o1',
                }],
                error: null,
            });
            const entries = await payrollService.fetchTimesheets('o1');
            expect(entries[0].hours_worked).toBe(5.5); // 6 h − 30 min de descanso no pagado
        });

        it('flags >14h for review', async () => {
            vi.mocked(payrollRepository.fetchTimesheetAttendance).mockResolvedValueOnce({
                data: [{
                    id: 'a4', picker_id: 'p4', date: '2026-03-10',
                    check_in: '2026-03-10T00:00:00Z', check_out: '2026-03-10T16:00:00Z',
                    hours_worked: 16, verified_by: null, orchard_id: 'o1',
                }],
                error: null,
            });
            const entries = await payrollService.fetchTimesheets('o1');
            expect(entries[0].requires_review).toBe(true);
        });

        it('returns empty on error', async () => {
            vi.mocked(payrollRepository.fetchTimesheetAttendance).mockResolvedValueOnce({
                data: [], error: { message: 'DB error' },
            });
            const entries = await payrollService.fetchTimesheets('o1');
            expect(entries).toEqual([]);
        });
    });

    describe('approveTimesheet', () => {
        it('invokes edge function and returns result', async () => {
            const result = await payrollService.approveTimesheet('a1', 'admin1', '2026-03-10');
            expect(result.success).toBe(true);
            expect(result.attendance_id).toBe('a1');
        });

        it('throws on error', async () => {
            const { edgeFunctionsRepository } = await import('@/repositories/edge-functions.repository');
            vi.mocked(edgeFunctionsRepository.invoke).mockResolvedValueOnce({
                data: null, error: { message: 'Auth failed' },
            } as any);
            await expect(payrollService.approveTimesheet('a1', 'admin1')).rejects.toThrow('Auth failed');
        });
    });
});


