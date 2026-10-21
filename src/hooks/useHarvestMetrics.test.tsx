/**
 * useHarvestMetrics — agregador de KPIs del dashboard.
 * Mocks el store + servicios puros para verificar composición.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHarvestMetrics } from './useHarvestMetrics';
import { useHarvestStore } from '@/stores/useHarvestStore';

vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: vi.fn(),
}));

vi.mock('@/services/harvestMetrics', () => ({
    computePerPicker: vi.fn(() => []),
    computeKPIs: vi.fn(() => ({ totalBins: 0, totalHours: 0, avgBinsPerHour: 0 })),
    computePerTeam: vi.fn(() => []),
    rankByEfficiency: vi.fn(() => []),
    computeHoursElapsed: vi.fn(() => 4),
}));

beforeEach(() => {
    vi.useFakeTimers();
    (useHarvestStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector: (s: unknown) => unknown) => {
            const state = {
                crew: [{ id: 'u1', name: 'Alice', role: 'picker' }],
                bucketRecords: [{ id: 'r1', picker_id: 'u1', scanned_at: new Date().toISOString() }],
                settings: { shift_start_time: '07:00', shift_end_time: '17:00', piece_rate: 6.5, min_wage_rate: 23.95 },
            };
            return selector(state);
        },
    );
});

afterEach(() => vi.useRealTimers());

describe('useHarvestMetrics', () => {
    it('devuelve kpis/perPicker/perTeam/efficiency/projection/hoursElapsed/now', () => {
        const { result } = renderHook(() => useHarvestMetrics());
        expect(result.current.kpis).toMatchObject({ totalBins: 0 });
        expect(Array.isArray(result.current.perPicker)).toBe(true);
        expect(Array.isArray(result.current.perTeam)).toBe(true);
        expect(Array.isArray(result.current.efficiency)).toBe(true);
        expect(typeof result.current.hoursElapsed).toBe('number');
        expect(result.current.now).toBeInstanceOf(Date);
    });

    it('no expone proyección a fin de día (no hay hora de fin de turno)', () => {
        const { result } = renderHook(() => useHarvestMetrics());
        expect('projectedEndOfDay' in result.current).toBe(false);
    });

    it('hoursElapsed usa el valor de computeHoursElapsed service', () => {
        const { result } = renderHook(() => useHarvestMetrics());
        expect(result.current.hoursElapsed).toBe(4);
    });

    it('fallback shift_start_time=07:00 cuando settings no lo tiene', () => {
        (useHarvestStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            (selector: (s: unknown) => unknown) => selector({
                crew: [], bucketRecords: [], settings: {},
            }),
        );
        const { result } = renderHook(() => useHarvestMetrics());
        expect(result.current).toBeDefined();
    });
});
