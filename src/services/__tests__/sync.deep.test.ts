/**
 * Deep tests for sync.service.ts — offline sync queue
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/services/supabase', () => ({
    supabase: {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
}));

import { syncService } from '../sync.service';

describe('syncService', () => {
    it('exports all expected methods', () => {
        expect(typeof syncService.addToQueue).toBe('function');
        expect(typeof syncService.getQueue).toBe('function');
        expect(typeof syncService.processQueue).toBe('function');
        expect(typeof syncService.getPendingCount).toBe('function');
        expect(typeof syncService.getLastSyncTime).toBe('function');
        expect(typeof syncService.getMaxRetryCount).toBe('function');
        expect(typeof syncService.getQueueSummary).toBe('function');
        expect(typeof syncService.categorizeError).toBe('function');
    });

    it('categorizeError classifies network errors', () => {
        expect(syncService.categorizeError(new TypeError('Failed to fetch'))).toBe('network');
    });

    it('categorizeError classifies server errors', () => {
        const err = new Error('500 Internal Server Error');
        expect(syncService.categorizeError(err)).toBe('server');
    });

    it('categorizeError returns unknown for random errors', () => {
        expect(syncService.categorizeError('something random')).toBe('unknown');
    });

    it('getQueue returns array', async () => {
        const queue = await syncService.getQueue();
        expect(Array.isArray(queue)).toBe(true);
    });

    it('getPendingCount returns number', async () => {
        const count = await syncService.getPendingCount();
        expect(typeof count).toBe('number');
    });

    it('getLastSyncTime returns null when no sync', async () => {
        const time = await syncService.getLastSyncTime();
        expect(time).toBeNull();
    });

    it('getQueueSummary returns summary object', async () => {
        const summary = await syncService.getQueueSummary();
        expect(summary).toHaveProperty('total');
        expect(summary).toHaveProperty('byType');
        expect(summary).toHaveProperty('maxRetry');
    });

    it('addToQueue stores the item while offline', async () => {
        // Sin conexión: no se lanza processQueue en segundo plano
        Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
        try {
            const before = await syncService.getPendingCount();
            const id = await syncService.addToQueue('SCAN', { id: 'b1', picker_id: 'p1' });
            expect(await syncService.getPendingCount()).toBe(before + 1);
            expect((await syncService.getQueue()).find(i => i.id === id)?.type).toBe('SCAN');
        } finally {
            Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
        }
    });
});

