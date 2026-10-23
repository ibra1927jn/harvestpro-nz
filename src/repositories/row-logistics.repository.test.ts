/**
 * Row + Logistics Repository Tests — vi.spyOn approach
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { rowRepository } from './row.repository';
import { logisticsRepository } from './logistics.repository';

function mockChain(result: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain), eq: vi.fn(() => chain), in: vi.fn(() => chain),
        update: vi.fn(() => chain), order: vi.fn(() => chain), limit: vi.fn(() => chain),
        is: vi.fn(() => chain), range: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) =>
            Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

describe('rowRepository', () => {
    let fromSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        fromSpy = vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ error: null }) as never);
    });

    it('updatePickerRows returns no error on success', async () => {
        const result = await rowRepository.updatePickerRows(['p1', 'p2'], 5);
        expect(result.error).toBeNull();
    });

    it('updateProgress does not throw', async () => {
        await expect(rowRepository.updateProgress('row-1', 75)).resolves.toBeUndefined();
    });

    it('updateProgress throws on error', async () => {
        fromSpy.mockReturnValue(mockChain({ error: { message: 'err' } }) as never);
        await expect(rowRepository.updateProgress('row-1', 50)).rejects.toBeTruthy();
    });

    it('completeRow succeeds', async () => {
        await expect(rowRepository.completeRow('row-1')).resolves.toBeUndefined();
    });
});

describe('logisticsRepository', () => {
    let fromSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        fromSpy = vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: [], error: null }) as never);
    });

    it('getBinStatuses returns statuses', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ status: 'empty' }], error: null }) as never);
        const result = await logisticsRepository.getBinStatuses();
        expect(result).toEqual([{ status: 'empty' }]);
    });

    it('getBinInventory returns bins', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'b1' }], error: null }) as never);
        const result = await logisticsRepository.getBinInventory();
        expect(result).toEqual([{ id: 'b1' }]);
    });

    it('getBinInventory throws on error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'err' } }) as never);
        await expect(logisticsRepository.getBinInventory()).rejects.toBeTruthy();
    });

    it('getFleetStatuses returns statuses', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ status: 'available' }], error: null }) as never);
        const result = await logisticsRepository.getFleetStatuses();
        expect(result).toEqual([{ status: 'available' }]);
    });

    it('getFleetAll returns vehicles', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'v1' }], error: null }) as never);
        const result = await logisticsRepository.getFleetAll();
        expect(result).toEqual([{ id: 'v1' }]);
    });

    it('getVehicleNames returns empty for empty ids', async () => {
        const result = await logisticsRepository.getVehicleNames([]);
        expect(result).toEqual({});
    });

    it('getVehicleNames returns map', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'v1', name: 'Truck 1', driver_name: 'Jim' }], error: null }) as never);
        const result = await logisticsRepository.getVehicleNames(['v1']);
        expect(result).toEqual({ 'v1': 'Truck 1' });
    });

    it('getPendingRequestStatuses returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ status: 'pending' }], error: null }) as never);
        const result = await logisticsRepository.getPendingRequestStatuses();
        expect(result).toEqual([{ status: 'pending' }]);
    });

    it('getActiveRequests returns active', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'req-1' }], error: null }) as never);
        const result = await logisticsRepository.getActiveRequests();
        expect(result).toHaveLength(1);
    });

    it('getCompletedRequests returns completed', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'req-2' }], error: null }) as never);
        const result = await logisticsRepository.getCompletedRequests();
        expect(result).toEqual([{ id: 'req-2' }]);
    });

    it('getCompletedRequests throws on error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'err' } }) as never);
        await expect(logisticsRepository.getCompletedRequests()).rejects.toBeTruthy();
    });
});
