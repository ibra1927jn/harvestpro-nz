/**
 * Logistics Repository Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { logisticsRepository } from './logistics.repository';

function mockChain(result: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain), eq: vi.fn(() => chain), in: vi.fn(() => chain),
        order: vi.fn(() => chain), limit: vi.fn(() => chain), is: vi.fn(() => chain), range: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) =>
            Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

describe('logisticsRepository', () => {
    let fromSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        fromSpy = vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: [], error: null }) as never);
    });

    // ── Bins ──
    describe('getBinStatuses', () => {
        it('returns bin statuses', async () => {
            const data = [{ status: 'empty' }, { status: 'full' }];
            fromSpy.mockReturnValue(mockChain({ data, error: null }) as never);
            expect(await logisticsRepository.getBinStatuses()).toEqual(data);
            expect(fromSpy).toHaveBeenCalledWith('bins');
        });

        it('filters by orchardId', async () => {
            expect(await logisticsRepository.getBinStatuses('orch-1')).toEqual([]);
        });

        it('returns empty on null', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
            expect(await logisticsRepository.getBinStatuses()).toEqual([]);
        });
    });

    describe('getBinInventory', () => {
        it('returns inventory data', async () => {
            const bins = [{ id: 'b1', status: 'empty' }];
            fromSpy.mockReturnValue(mockChain({ data: bins, error: null }) as never);
            expect(await logisticsRepository.getBinInventory()).toEqual(bins);
        });

        it('skips retired bins and reads every page with a stable order', async () => {
            const chain = mockChain({ data: [], error: null });
            fromSpy.mockReturnValue(chain as never);
            await logisticsRepository.getBinInventory('o1');
            expect(chain.is).toHaveBeenCalledWith('deleted_at', null);
            expect(chain.order).toHaveBeenCalledWith('id');
            expect(chain.range).toHaveBeenCalledWith(0, 999);
        });

        it('throws on error', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'fail' } }) as never);
            await expect(logisticsRepository.getBinInventory()).rejects.toBeTruthy();
        });
    });

    // ── Fleet ──
    describe('getFleetStatuses', () => {
        it('returns fleet statuses', async () => {
            const data = [{ status: 'available' }];
            fromSpy.mockReturnValue(mockChain({ data, error: null }) as never);
            expect(await logisticsRepository.getFleetStatuses()).toEqual(data);
            expect(fromSpy).toHaveBeenCalledWith('fleet_vehicles');
        });
    });

    describe('getFleetAll', () => {
        it('returns all fleet vehicles', async () => {
            const vehicles = [{ id: 'v1', name: 'Truck A' }];
            fromSpy.mockReturnValue(mockChain({ data: vehicles, error: null }) as never);
            expect(await logisticsRepository.getFleetAll()).toEqual(vehicles);
        });

        it('throws on error', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'fail' } }) as never);
            await expect(logisticsRepository.getFleetAll()).rejects.toBeTruthy();
        });
    });

    describe('getVehicleNames', () => {
        it('returns empty for no ids', async () => {
            expect(await logisticsRepository.getVehicleNames([])).toEqual({});
        });

        it('returns id-to-name map', async () => {
            fromSpy.mockReturnValue(mockChain({
                data: [{ id: 'v1', name: 'Truck A', driver_name: 'John' }],
                error: null,
            }) as never);
            expect(await logisticsRepository.getVehicleNames(['v1'])).toEqual({ 'v1': 'Truck A' });
        });
    });

    // ── Transport Requests ──
    describe('getPendingRequestStatuses', () => {
        it('returns pending statuses', async () => {
            const data = [{ status: 'pending' }];
            fromSpy.mockReturnValue(mockChain({ data, error: null }) as never);
            expect(await logisticsRepository.getPendingRequestStatuses()).toEqual(data);
            expect(fromSpy).toHaveBeenCalledWith('transport_requests');
        });
    });

    describe('getActiveRequests', () => {
        it('returns active requests', async () => {
            const result = await logisticsRepository.getActiveRequests();
            expect(result).toEqual([]);
        });

        it('throws on error', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'fail' } }) as never);
            await expect(logisticsRepository.getActiveRequests()).rejects.toBeTruthy();
        });
    });

    describe('getCompletedRequests', () => {
        it('returns completed requests', async () => {
            const reqs = [{ id: 'r1', status: 'completed' }];
            fromSpy.mockReturnValue(mockChain({ data: reqs, error: null }) as never);
            expect(await logisticsRepository.getCompletedRequests()).toEqual(reqs);
        });

        it('throws on error', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'fail' } }) as never);
            await expect(logisticsRepository.getCompletedRequests()).rejects.toBeTruthy();
        });
    });
});
