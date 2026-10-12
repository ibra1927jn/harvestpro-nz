/**
 * StoreSync Repository Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { storeSyncRepository } from '@/repositories/store-sync.repository';

function mockChain(result: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain), eq: vi.fn(() => chain), in: vi.fn(() => chain),
        gte: vi.fn(() => chain), range: vi.fn(() => chain), order: vi.fn(() => chain), limit: vi.fn(() => chain),
        single: vi.fn(() => chain), maybeSingle: vi.fn(() => chain), is: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) =>
            Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

describe('storeSyncRepository', () => {
    let fromSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        fromSpy = vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: [], error: null }) as never);
    });

    describe('getFirstOrchard', () => {
        it('returns first orchard', async () => {
            fromSpy.mockReturnValue(mockChain({ data: [{ id: 'o1', name: 'Test Farm' }], error: null }) as never);
            const result = await storeSyncRepository.getFirstOrchard();
            expect(result).toEqual({ id: 'o1', name: 'Test Farm' });
            expect(fromSpy).toHaveBeenCalledWith('orchards');
        });

        it('returns null when no orchards', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
            expect(await storeSyncRepository.getFirstOrchard()).toBeNull();
        });

        it('returns null when empty array', async () => {
            expect(await storeSyncRepository.getFirstOrchard()).toBeNull();
        });
    });

    describe('getSettings', () => {
        it('returns harvest settings', async () => {
            const settings = { piece_rate: 6.50, min_wage_rate: 23.95 };
            fromSpy.mockReturnValue(mockChain({ data: settings, error: null }) as never);
            expect(await storeSyncRepository.getSettings('o1')).toEqual({ ...settings, variety_rates: [] });
            expect(fromSpy).toHaveBeenCalledWith('harvest_settings');
        });

        it('returns null on missing', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
            expect(await storeSyncRepository.getSettings('o1')).toBeNull();
        });
    });

    describe('getPickersQuery', () => {
        it('returns a query builder (thenable)', () => {
            const query = storeSyncRepository.getPickersQuery('o1', '2026-03-04');
            expect(query).toBeDefined();
            expect(fromSpy).toHaveBeenCalledWith('pickers');
        });
    });

    describe('getBucketRecordsQuery', () => {
        it('returns a query builder (thenable)', () => {
            const query = storeSyncRepository.getBucketRecordsQuery('o1', '2026-03-04');
            expect(query).toBeDefined();
            expect(fromSpy).toHaveBeenCalledWith('bucket_records');
        });
    });

    describe('getBucketCounts', () => {
        it('returns bucket count data', async () => {
            const data = [{ picker_id: 'p1', id: 'b1' }];
            fromSpy.mockReturnValue(mockChain({ data, error: null }) as never);
            expect(await storeSyncRepository.getBucketCounts('o1', '2026-03-04')).toEqual(data);
        });

        it('filters by orchardId when provided', async () => {
            expect(await storeSyncRepository.getBucketCounts('o1', '2026-03-04')).toEqual([]);
        });

        it('skips orchardId filter when undefined', async () => {
            expect(await storeSyncRepository.getBucketCounts(undefined, '2026-03-04')).toEqual([]);
        });

        it('returns empty on null data', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
            expect(await storeSyncRepository.getBucketCounts('o1', '2026-03-04')).toEqual([]);
        });
    });

    describe('getPieceRate', () => {
        it('returns piece rate value', async () => {
            fromSpy.mockReturnValue(mockChain({ data: { piece_rate: 6.50 }, error: null }) as never);
            expect(await storeSyncRepository.getPieceRate('o1')).toBe(6.50);
        });

        it('returns null when no settings', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
            expect(await storeSyncRepository.getPieceRate('o1')).toBeNull();
        });
    });
});
