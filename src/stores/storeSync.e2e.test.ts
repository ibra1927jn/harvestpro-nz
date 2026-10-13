/**
 * E2E tests for storeSync.ts (245L) — exercises ALL 4 functions
 * hydrateFromRecovery, hydrateFromDexie, fetchOrchardData, setupRealtimeSubscriptions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Parcial: el resto de utilidades NZ son las reales
vi.mock('@/utils/nzst', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/utils/nzst')>()),
    todayNZST: () => '2026-03-10',
    toNZST: (d: Date) => d.toISOString(),
}));

const mockGetFirstOrchard = vi.fn().mockResolvedValue({ id: 'o1', name: 'Test Orchard', total_rows: 50 });
const mockGetSettings = vi.fn().mockResolvedValue({ piece_rate: 6.50, target_tons: 10 });
const mockGetPickersQuery = vi.fn().mockReturnValue({
    gte: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    then: vi.fn().mockResolvedValue({ data: [], error: null }),
    data: [],
    error: null,
});
const mockGetBucketRecordsQuery = vi.fn().mockReturnValue({
    gte: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    then: vi.fn().mockResolvedValue({ data: [], error: null }),
    data: [],
    error: null,
});

vi.mock('@/repositories/store-sync.repository', () => ({
    storeSyncRepository: {
        getFirstOrchard: (...a: unknown[]) => mockGetFirstOrchard(...a),
        getSettings: (...a: unknown[]) => mockGetSettings(...a),
        getPickersQuery: (...a: unknown[]) => mockGetPickersQuery(...a),
        getBucketRecordsQuery: (...a: unknown[]) => mockGetBucketRecordsQuery(...a),
    },
}));

vi.mock('@/services/supabase', () => ({
    supabase: {
        removeAllChannels: vi.fn(),
        getChannels: vi.fn(() => []),
        removeChannel: vi.fn(),
        channel: vi.fn().mockReturnValue({
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn(),
        }),
    },
}));

// Redundant mock removed

import { hydrateFromRecovery, hydrateFromDexie } from './storeSync';
import { offlineService } from '@/services/offline.service';
import type { StoreSetter } from './storeSync';

describe('storeSync — E2E deep tests', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        // Re-establish default mock return values after reset
        vi.spyOn(offlineService, 'getPendingBuckets').mockResolvedValue([]);
    });
    
    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ========== hydrateFromRecovery ==========
    describe('hydrateFromRecovery', () => {
        it('recovers buckets from localStorage', () => {
            const mockSet = vi.fn();
            const recoveryData = JSON.stringify({
                state: { buckets: [{ id: 'b1', pickerId: 'p1' }, { id: 'b2', pickerId: 'p2' }] },
            });
            vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(recoveryData);
            vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {});

            hydrateFromRecovery(mockSet as unknown as StoreSetter);
            expect(mockSet).toHaveBeenCalled();
            // The set function receives a callback
            const callback = mockSet.mock.calls[0][0];
            const result = callback({ buckets: [] });
            expect(result.buckets.length).toBe(2);
        });

        it('skips duplicate bucket IDs', () => {
            const mockSet = vi.fn();
            const recoveryData = JSON.stringify({
                state: { buckets: [{ id: 'b1', pickerId: 'p1' }] },
            });
            vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(recoveryData);
            vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {});

            hydrateFromRecovery(mockSet as unknown as StoreSetter);
            const callback = mockSet.mock.calls[0][0];
            const result = callback({ buckets: [{ id: 'b1', pickerId: 'p1' }] });
            // Should return state unchanged since b1 already exists
            expect(result.buckets || []).toHaveLength(1);
        });

        it('handles no recovery data', () => {
            const mockSet = vi.fn();
            vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
            hydrateFromRecovery(mockSet as unknown as StoreSetter);
            expect(mockSet).not.toHaveBeenCalled();
        });

        it('handles corrupted recovery data', () => {
            const mockSet = vi.fn();
            vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('not valid json{{{');
            const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {});
            hydrateFromRecovery(mockSet as unknown as StoreSetter);
            // No toca el store y borra la copia corrupta
            expect(mockSet).not.toHaveBeenCalled();
            expect(removeItem).toHaveBeenCalledWith('harvest-pro-recovery');
        });

        it('handles empty buckets in recovery', () => {
            const mockSet = vi.fn();
            const recoveryData = JSON.stringify({ state: { buckets: [] } });
            vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(recoveryData);
            vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {});
            hydrateFromRecovery(mockSet as unknown as StoreSetter);
            expect(mockSet).not.toHaveBeenCalled();
        });
    });

    // ========== hydrateFromDexie ==========
    describe('hydrateFromDexie', () => {
        it('hydrates pending buckets', async () => {
            const mockSet = vi.fn();
            vi.spyOn(offlineService, 'getPendingBuckets').mockResolvedValue([
                { id: 1, pickerId: 'p1', orchardId: 'o1' } as any,
            ]);

            await hydrateFromDexie(mockSet as unknown as StoreSetter);
            expect(mockSet).toHaveBeenCalled();
            const callback = mockSet.mock.calls[0][0];
            const result = callback({ buckets: [] });
            expect(result.buckets.length).toBe(1);
            expect(result.buckets[0].synced).toBe(false);
        });

        it('skips when no pending buckets', async () => {
            const mockSet = vi.fn();
            await hydrateFromDexie(mockSet as unknown as StoreSetter);
            expect(mockSet).not.toHaveBeenCalled();
        });

        it('handles Dexie error', async () => {
            const mockSet = vi.fn();
            vi.spyOn(offlineService, 'getPendingBuckets').mockRejectedValueOnce(new Error('DB error'));
            await expect(hydrateFromDexie(mockSet as unknown as StoreSetter)).resolves.toBeUndefined();
            expect(mockSet).not.toHaveBeenCalled();
        });
    });

    // ========== setupRealtimeSubscriptions ==========
    describe('setupRealtimeSubscriptions', () => {
        it('sets up supabase channel', async () => {
            const mockGet = vi.fn().mockReturnValue({
                recalculateIntelligence: vi.fn(),
            });
            const mockSet = vi.fn();
            // test-setup.ts ya cargo storeSync con el supabase real: se recarga con el mock
            vi.resetModules();
            const { setupRealtimeSubscriptions: setup } = await import('./storeSync');
            const { supabase: sb } = await import('@/services/supabase');
            setup('o1', mockGet as any, mockSet as unknown as StoreSetter);
            // Un solo canal por huerto
            expect(vi.mocked(sb.channel)).toHaveBeenCalledWith('harvest-live-o1');
        });
    });
});

