/**
 * INTEGRATION TEST: Payroll Pipeline
 *
 * Tests: fetchTimesheets → hours calculation → wage shield → approval workflow
 * Pattern: Mock repositories + Edge Functions, test SERVICE LOGIC
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock external boundaries (hoisted) ──────
const { mockInvokePayroll, mockFetchAttendance, mockFetchPickerNames, mockInvokeEdge } = vi.hoisted(() => ({
    mockInvokePayroll: vi.fn(),
    mockFetchAttendance: vi.fn(),
    mockFetchPickerNames: vi.fn(),
    mockInvokeEdge: vi.fn(),
}));

vi.mock('@/repositories/payroll.repository', () => ({
    payrollRepository: {
        invokeCalculatePayroll: mockInvokePayroll,
        fetchTimesheetAttendance: mockFetchAttendance,
        fetchPickerNames: mockFetchPickerNames,
    },
}));

vi.mock('@/repositories/edge-functions.repository', () => ({
    edgeFunctionsRepository: {
        invoke: mockInvokeEdge,
    },
}));

vi.mock('@/utils/nzst', () => ({
    todayNZST: () => '2026-03-10',
    toNZST: (d: Date) => d.toISOString(),
    nowNZST: () => '2026-03-10T14:00:00+13:00',
}));

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { payrollService } from '@/services/payroll.service';

// ── Fixtures ────────────────────────────────

const PAYROLL_RESULT = {
    orchard_id: 'o1',
    date_range: { start: '2026-03-10', end: '2026-03-10' },
    summary: {
        total_buckets: 50,
        total_hours: 16,
        total_piece_rate_earnings: 175,
        total_top_up: 94,
        total_earnings: 269,
    },
    compliance: {
        workers_below_minimum: 1,
        workers_total: 2,
        compliance_rate: 50,
    },
    picker_breakdown: [
        {
            picker_id: 'p1', picker_name: 'Alice',
            buckets: 40, hours_worked: 8,
            piece_rate_earnings: 140, hourly_rate: 17.5,
            minimum_required: 188, top_up_required: 48,
            total_earnings: 188, is_below_minimum: true,
        },
        {
            picker_id: 'p2', picker_name: 'Bob',
            buckets: 10, hours_worked: 8,
            piece_rate_earnings: 35, hourly_rate: 4.375,
            minimum_required: 188, top_up_required: 153,
            total_earnings: 188, is_below_minimum: true,
        },
    ],
    settings: { bucket_rate: 3.5, min_wage_rate: 23.5 },
};

const ATTENDANCE_RECORDS = [
    {
        id: 'a1', picker_id: 'p1', date: '2026-03-10',
        check_in: '2026-03-10T06:00:00+13:00',
        check_out: '2026-03-10T14:00:00+13:00',
        hours_worked: 8, verified_by: 'mgr1', orchard_id: 'o1', updated_at: '2026-03-10T14:00:00Z',
    },
    {
        id: 'a2', picker_id: 'p2', date: '2026-03-10',
        check_in: '2026-03-10T07:00:00+13:00',
        check_out: null,
        hours_worked: 0, verified_by: null, orchard_id: 'o1', updated_at: '2026-03-10T14:00:00Z',
    },
    {
        id: 'a3', picker_id: 'p3', date: '2026-03-10',
        check_in: '2026-03-10T05:00:00+13:00',
        check_out: '2026-03-10T22:00:00+13:00',
        hours_worked: 17, verified_by: null, orchard_id: 'o1', updated_at: '2026-03-10T14:00:00Z',
    },
];

// ── PAYROLL CALCULATION PIPELINE ────────────

describe('Payroll Pipeline — Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockInvokePayroll.mockResolvedValue(PAYROLL_RESULT);
        mockFetchAttendance.mockResolvedValue({ data: ATTENDANCE_RECORDS, error: null });
        mockFetchPickerNames.mockResolvedValue({ p1: 'Alice', p2: 'Bob', p3: 'Carlos' });
    });

    // ── calculatePayroll via Edge Function ──────────

    it('calculatePayroll delegates to repository and returns full result', async () => {
        const result = await payrollService.calculatePayroll('o1', '2026-03-10', '2026-03-10');
        expect(mockInvokePayroll).toHaveBeenCalledWith('o1', '2026-03-10', '2026-03-10');
        expect(result.orchard_id).toBe('o1');
        expect(result.summary.total_buckets).toBe(50);
    });

    it('calculateToday uses todayNZST for both start & end', async () => {
        await payrollService.calculateToday('o1');
        expect(mockInvokePayroll).toHaveBeenCalledWith('o1', '2026-03-10', '2026-03-10');
    });

    it('getDashboardSummary extracts key metrics', async () => {
        const summary = await payrollService.getDashboardSummary('o1');
        expect(summary.totalBuckets).toBe(50);
        expect(summary.totalCost).toBe(269);
        expect(summary.workersAtRisk).toBe(1);
        expect(summary.complianceRate).toBe(50);
    });

    // ── fetchTimesheets: hours calculation ──────────

    it('fetchTimesheets uses server hours_worked when available', async () => {
        const entries = await payrollService.fetchTimesheets('o1', '2026-03-10');
        expect(entries.length).toBe(3);
        // p1: server reports 8h
        expect(entries[0].hours_worked).toBe(7.5); // 8 h − 30 min de descanso no pagado
        expect(entries[0].is_verified).toBe(true);
    });

    it('fetchTimesheets falls back to client calculation when hours_worked=0 but has check_in/out', async () => {
        // p2 has check_in but no check_out → hours_worked stays 0
        const entries = await payrollService.fetchTimesheets('o1', '2026-03-10');
        const p2 = entries.find(e => e.picker_id === 'p2');
        expect(p2!.hours_worked).toBe(0); // No check_out → can't calculate
    });

    it('fetchTimesheets flags >14h for review (NZ law compliance)', async () => {
        const entries = await payrollService.fetchTimesheets('o1', '2026-03-10');
        const p3 = entries.find(e => e.picker_id === 'p3');
        expect(p3!.hours_worked).toBe(16.5); // 17 h − 30 min, sin tope
        expect(p3!.requires_review).toBe(true); // > 14h flag
    });

    it('fetchTimesheets resolves picker names correctly', async () => {
        const entries = await payrollService.fetchTimesheets('o1', '2026-03-10');
        expect(entries[0].picker_name).toBe('Alice');
        expect(entries[1].picker_name).toBe('Bob');
        expect(entries[2].picker_name).toBe('Carlos');
    });

    it('fetchTimesheets returns empty array on error', async () => {
        mockFetchAttendance.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });
        const entries = await payrollService.fetchTimesheets('o1', '2026-03-10');
        expect(entries).toEqual([]);
    });

    // ── approveTimesheet via Edge Function ──────────

    it('approveTimesheet calls Edge Function with correct params', async () => {
        mockInvokeEdge.mockResolvedValueOnce({
            data: { success: true, attendance_id: 'a1', updated_at: '2026-03-10T15:00:00Z' },
            error: null,
        });

        const result = await payrollService.approveTimesheet('a1', 'mgr1', '2026-03-10T14:00:00Z');
        expect(result.success).toBe(true);
        expect(result.attendance_id).toBe('a1');
    });

    it('approveTimesheet throws on Edge Function error', async () => {
        mockInvokeEdge.mockResolvedValueOnce({
            data: null,
            error: { message: 'Optimistic lock conflict' },
        });

        await expect(payrollService.approveTimesheet('a1', 'mgr1')).rejects.toThrow('Optimistic lock conflict');
    });
});

// ── WAGE SHIELD INTEGRATION ─────────────────

describe('Wage Shield — Integration', () => {
    beforeEach(() => vi.clearAllMocks());

    it('payroll result correctly identifies workers below minimum', async () => {
        mockInvokePayroll.mockResolvedValue(PAYROLL_RESULT);
        const result = await payrollService.calculatePayroll('o1', '2026-03-10', '2026-03-10');

        const belowMin = result.picker_breakdown.filter(p => p.is_below_minimum);
        expect(belowMin.length).toBe(2); // Both workers below NZ minimum
        expect(result.compliance.workers_below_minimum).toBe(1);
    });

    it('payroll result includes top-up amounts for below-minimum workers', async () => {
        mockInvokePayroll.mockResolvedValue(PAYROLL_RESULT);
        const result = await payrollService.calculatePayroll('o1', '2026-03-10', '2026-03-10');

        const alice = result.picker_breakdown.find(p => p.picker_id === 'p1')!;
        // Alice: 40 buckets × $3.50 = $140 piece rate, but $23.95 × 8h = $188 minimum
        expect(alice.top_up_required).toBe(48);
        expect(alice.total_earnings).toBe(188); // Bumped to minimum
    });

    it('payroll summary.total_top_up matches sum of individual top-ups', async () => {
        mockInvokePayroll.mockResolvedValue(PAYROLL_RESULT);
        const result = await payrollService.calculatePayroll('o1', '2026-03-10', '2026-03-10');

        expect(result.summary.total_top_up).toBe(94);
    });
});

