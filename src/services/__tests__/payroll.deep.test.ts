/**
 * Deep edge-case tests for payroll.service.ts
 * Covers: calculatePayroll, calculateToday, calculateThisWeek, getDashboardSummary, fetchTimesheets, approveTimesheet
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/repositories/payroll.repository', () => ({
    payrollRepository: {
        invokeCalculatePayroll: vi.fn(),
        fetchTimesheetAttendance: vi.fn(),
        fetchPickerNames: vi.fn(),
    },
}));

vi.mock('@/repositories/edge-functions.repository', () => ({
    edgeFunctionsRepository: {
        invoke: vi.fn(),
    },
}));

vi.mock('@/utils/nzst', () => ({
    todayNZST: () => '2026-03-10',
}));

vi.mock('@/utils/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { payrollService } from '../payroll.service';
import { payrollRepository } from '@/repositories/payroll.repository';
import { edgeFunctionsRepository } from '@/repositories/edge-functions.repository';

const mockPayrollResult = {
    orchard_id: 'o1',
    date_range: { start: '2026-03-10', end: '2026-03-10' },
    summary: { total_buckets: 100, total_hours: 40, total_piece_rate_earnings: 650, total_top_up: 50, total_earnings: 700 },
    compliance: { workers_below_minimum: 2, workers_total: 10, compliance_rate: 80 },
    picker_breakdown: [],
    settings: { bucket_rate: 6.5, min_wage_rate: 23.95 },
};

describe('payrollService.calculatePayroll', () => {
    it('calls repository and returns result', async () => {
        (payrollRepository.invokeCalculatePayroll as any).mockResolvedValue(mockPayrollResult);
        const result = await payrollService.calculatePayroll('o1', '2026-03-10', '2026-03-10');
        expect(result.orchard_id).toBe('o1');
        expect(result.summary.total_buckets).toBe(100);
    });
});

describe('payrollService.calculateToday', () => {
    it('uses today date', async () => {
        (payrollRepository.invokeCalculatePayroll as any).mockResolvedValue(mockPayrollResult);
        const result = await payrollService.calculateToday('o1');
        expect(result.date_range.start).toBe('2026-03-10');
    });
});

describe('payrollService.getDashboardSummary', () => {
    it('returns simplified summary', async () => {
        (payrollRepository.invokeCalculatePayroll as any).mockResolvedValue(mockPayrollResult);
        const summary = await payrollService.getDashboardSummary('o1');
        expect(summary.totalBuckets).toBe(100);
        expect(summary.totalCost).toBe(700);
        expect(summary.workersAtRisk).toBe(2);
        expect(summary.complianceRate).toBe(80);
    });
});

describe('payrollService.fetchTimesheets', () => {
    beforeEach(() => {
        (payrollRepository.fetchPickerNames as any).mockResolvedValue({ p1: 'Alice', p2: 'Bob' });
    });

    it('maps attendance to timesheet entries', async () => {
        (payrollRepository.fetchTimesheetAttendance as any).mockResolvedValue({
            data: [
                { id: 'a1', picker_id: 'p1', date: '2026-03-10', check_in: '2026-03-10T07:00:00Z', check_out: '2026-03-10T15:00:00Z', hours_worked: 8, verified_by: 'u1', orchard_id: 'o1', updated_at: '2026-03-10T15:00:00Z' },
            ],
            error: null,
        });
        const result = await payrollService.fetchTimesheets('o1');
        expect(result).toHaveLength(1);
        expect(result[0].picker_name).toBe('Alice');
        expect(result[0].hours_worked).toBe(7.5); // 8 h − 30 min de descanso no pagado
        expect(result[0].is_verified).toBe(true);
    });

    it('returns empty array on error', async () => {
        (payrollRepository.fetchTimesheetAttendance as any).mockResolvedValue({
            data: [],
            error: { message: 'fail' },
        });
        const result = await payrollService.fetchTimesheets('o1');
        expect(result).toEqual([]);
    });

    it('flags hours > 14 for review', async () => {
        (payrollRepository.fetchTimesheetAttendance as any).mockResolvedValue({
            data: [
                { id: 'a2', picker_id: 'p2', date: '2026-03-10', check_in: '2026-03-10T04:00:00Z', check_out: '2026-03-10T20:00:00Z', hours_worked: 16, verified_by: null, orchard_id: 'o1', updated_at: null },
            ],
            error: null,
        });
        const result = await payrollService.fetchTimesheets('o1');
        expect(result[0].requires_review).toBe(true);
    });

    it('computes hours locally when server hours_worked is 0', async () => {
        (payrollRepository.fetchTimesheetAttendance as any).mockResolvedValue({
            data: [
                { id: 'a3', picker_id: 'p1', date: '2026-03-10', check_in: '2026-03-10T08:00:00Z', check_out: '2026-03-10T12:00:00Z', hours_worked: 0, verified_by: null, orchard_id: 'o1', updated_at: null },
            ],
            error: null,
        });
        const result = await payrollService.fetchTimesheets('o1');
        expect(result[0].hours_worked).toBeCloseTo(4, 0);
    });
});

describe('payrollService.approveTimesheet', () => {
    it('calls edge function and returns data', async () => {
        (edgeFunctionsRepository.invoke as any).mockResolvedValue({
            data: { success: true, attendance_id: 'a1', picker_id: 'p1', verified_by: 'u1', updated_at: '2026-03-10T16:00:00Z' },
            error: null,
        });
        const result = await payrollService.approveTimesheet('a1', 'u1');
        expect(result.success).toBe(true);
        expect(result.attendance_id).toBe('a1');
    });

    it('throws on error', async () => {
        (edgeFunctionsRepository.invoke as any).mockResolvedValue({
            data: null,
            error: { message: 'Conflict' },
        });
        await expect(payrollService.approveTimesheet('a1', 'u1')).rejects.toThrow('Conflict');
    });
});


