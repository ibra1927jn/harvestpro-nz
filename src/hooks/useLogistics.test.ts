/**
 * useLogistics Hook Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/services/logistics-dept.service', () => ({
    fetchLogisticsSummary: vi.fn().mockResolvedValue({
        activeTractors: 3, binsInTransit: 5, fullBins: 12, emptyBins: 30, pendingRequests: 2,
    }),
    fetchFleet: vi.fn().mockResolvedValue([{ id: 't1', name: 'Tractor A', status: 'active' }]),
    fetchBinInventory: vi.fn().mockResolvedValue([{ id: 'b1', status: 'empty' }]),
    fetchTransportRequests: vi.fn().mockResolvedValue([{ id: 'r1', status: 'pending' }]),
    fetchTransportHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/services/supabase', () => ({
    supabase: {
        channel: vi.fn().mockReturnValue({
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
        }),
        removeChannel: vi.fn(),
    },
}));

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { useLogistics } from './useLogistics';
import { supabase } from '@/services/supabase';

describe('useLogistics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('starts with loading state', () => {
        const { result } = renderHook(() => useLogistics());
        expect(result.current.isLoading).toBe(true);
    });

    it('loads data on mount', async () => {
        const { result } = renderHook(() => useLogistics());
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.tractors).toHaveLength(1);
        expect(result.current.bins).toHaveLength(1);
        expect(result.current.requests).toHaveLength(1);
    });

    it('provides summary data', async () => {
        const { result } = renderHook(() => useLogistics());
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.summary.activeTractors).toBe(3);
        expect(result.current.summary.fullBins).toBe(12);
        expect(result.current.summary.pendingRequests).toBe(2);
    });

    it('provides a reload function', async () => {
        const { result } = renderHook(() => useLogistics());
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(typeof result.current.reload).toBe('function');
    });

    it('listens to bins too (runners scanning, other logistics desks)', async () => {
        renderHook(() => useLogistics());
        const channel = vi.mocked(supabase.channel).mock.results[0].value as { on: ReturnType<typeof vi.fn> };
        const tables = channel.on.mock.calls.map(c => (c[1] as { table: string }).table);
        expect(tables).toEqual(expect.arrayContaining(['transport_requests', 'fleet_vehicles', 'bins']));
    });

    it('refreshFleet / refreshBins reload one list and the summary', async () => {
        const svc = await import('@/services/logistics-dept.service');
        const { result } = renderHook(() => useLogistics());
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        vi.mocked(svc.fetchFleet).mockClear();
        vi.mocked(svc.fetchBinInventory).mockClear();
        await result.current.refreshFleet();
        expect(svc.fetchFleet).toHaveBeenCalledTimes(1);
        expect(svc.fetchBinInventory).not.toHaveBeenCalled();
        await result.current.refreshBins();
        expect(svc.fetchBinInventory).toHaveBeenCalledTimes(1);
    });
});
