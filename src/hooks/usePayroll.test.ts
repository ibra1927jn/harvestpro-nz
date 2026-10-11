/**
 * usePayroll Hook Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePayroll, defaultPayWeek, shiftPayWeek } from './usePayroll';
import { payrollService } from '@/services/payroll.service';

// Mock dependencies
vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: vi.fn((selector) => {
        const state = { orchard: { id: 'orch-1' } };
        return selector ? selector(state) : state;
    }),
}));

vi.mock('@/services/payroll.service', () => ({
    payrollService: {
        calculatePayroll: vi.fn().mockResolvedValue({
            summary: { total_buckets: 100, total_hours: 40, total_piece_rate_earnings: 650, total_top_up: 50, total_earnings: 700 },
            compliance: { workers_below_minimum: 2, workers_total: 10, compliance_rate: 80 },
            picker_breakdown: [{ picker_id: 'p1', buckets: 50 }],
            settings: { bucket_rate: 6.50, min_wage_rate: 23.95 },
        }),
    },
    PayrollResult: {},
}));

vi.mock('@/utils/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

describe('usePayroll', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns loading initially', () => {
        const { result } = renderHook(() => usePayroll());
        expect(result.current.isLoading).toBeDefined();
    });

    it('returns orchardId from store', () => {
        const { result } = renderHook(() => usePayroll());
        expect(result.current.orchardId).toBe('orch-1');
    });

    it('loads payroll data', async () => {
        const { result } = renderHook(() => usePayroll());
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        expect(result.current.summary.total_buckets).toBe(100);
        expect(result.current.compliance.compliance_rate).toBe(80);
        expect(result.current.pickers).toHaveLength(1);
    });

    it('returns default values when no data', () => {
        const { result } = renderHook(() => usePayroll());
        // Before data loads, defaults should be present
        expect(result.current.summary.total_buckets).toBeDefined();
        expect(result.current.settings.min_wage_rate).toBeDefined();
    });

    it('loads the whole pay week (Monday–Sunday), not just today', async () => {
        const { result } = renderHook(() => usePayroll());
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        const [, start, end] = vi.mocked(payrollService.calculatePayroll).mock.calls[0];
        expect(start).toBe(result.current.week.start);
        expect(end).toBe(result.current.week.end);
        expect(new Date(`${start}T12:00:00Z`).getUTCDay()).toBe(1); // lunes
    });
});

describe('pay week helpers', () => {
    it('on a Monday (closing day) shows the week that just ended', () => {
        expect(defaultPayWeek('2026-10-12')).toEqual({ start: '2026-10-05', end: '2026-10-11', closesOn: '2026-10-12' });
    });

    it('any other day shows the current week', () => {
        expect(defaultPayWeek('2026-10-11').start).toBe('2026-10-05');
        expect(defaultPayWeek('2026-10-14').start).toBe('2026-10-12');
    });

    it('moves one week back and forth', () => {
        const w = defaultPayWeek('2026-10-11');
        expect(shiftPayWeek(w, -1).start).toBe('2026-09-28');
        expect(shiftPayWeek(w, 1).start).toBe('2026-10-12');
    });
});
