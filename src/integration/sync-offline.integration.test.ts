/**
 * INTEGRATION TEST: Sync Service + Offline Pipeline
 * 
 * Tests: error categorization + queue management (Dexie real con fake-indexeddb)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock external boundaries ────────────────
vi.mock('@/services/supabase', () => ({
    supabase: {
        auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }) },
        from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
        channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
        removeAllChannels: vi.fn(),
    },
}));

vi.mock('@/services/offline.service', () => ({
    offlineService: {
        queueBucket: vi.fn().mockResolvedValue(undefined),
        markAsSynced: vi.fn().mockResolvedValue(undefined),
        getPendingBuckets: vi.fn().mockResolvedValue([]),
        getAll: vi.fn().mockResolvedValue([]),
        clearAll: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/services/audit.service', () => ({
    auditService: { logAudit: vi.fn(), logAuth: vi.fn(), logPickerEvent: vi.fn() },
}));

vi.mock('@/config/analytics', () => ({
    analytics: { trackBucketScanned: vi.fn(), identify: vi.fn(), track: vi.fn(), trackEvent: vi.fn() },
}));

vi.mock('@/repositories/edge-functions.repository', () => ({
    edgeFunctionsRepository: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
}));

vi.mock('@/services/gateway.service', () => ({
    gatewayService: {
        withResilience: vi.fn((_n: string, fn: () => Promise<unknown>) => fn()),
        onEvent: vi.fn(() => () => { }),
    },
}));

import { syncService } from '@/services/sync.service';
import { db } from '@/services/db';

// ── SYNC SERVICE: ERROR CATEGORIZATION ─────────

describe('Sync Service — Error Categorization', () => {

    it('network error → "network"', () => {
        expect(syncService.categorizeError(new Error('Failed to fetch'))).toBe('network');
    });

    it('timeout error → "network"', () => {
        expect(syncService.categorizeError(new Error('request timeout aborted'))).toBe('network');
    });

    it('500 in message → "server"', () => {
        expect(syncService.categorizeError(new Error('HTTP 500 Internal Server Error'))).toBe('server');
    });

    it('502 in message → "server"', () => {
        expect(syncService.categorizeError(new Error('502 Bad Gateway'))).toBe('server');
    });

    it('429 rate limit → "server"', () => {
        expect(syncService.categorizeError(new Error('429 Too Many Requests'))).toBe('server');
    });

    it('constraint violation → "validation"', () => {
        expect(syncService.categorizeError(new Error('unique constraint violation'))).toBe('validation');
    });

    it('foreign key error → "validation"', () => {
        expect(syncService.categorizeError(new Error('foreign key constraint'))).toBe('validation');
    });

    it('optimistic lock error → "validation"', () => {
        expect(syncService.categorizeError(new Error('optimistic lock conflict'))).toBe('validation');
    });

    it('Supabase error with code 23xxx → "validation"', () => {
        expect(syncService.categorizeError({ code: '23505' })).toBe('validation');
    });

    it('Supabase error with code PGRST → "server"', () => {
        expect(syncService.categorizeError({ code: 'PGRST' })).toBe('server');
    });

    it('null → "unknown"', () => {
        expect(syncService.categorizeError(null)).toBe('unknown');
    });

    it('string → "unknown"', () => {
        expect(syncService.categorizeError('some error')).toBe('unknown');
    });

    it('empty object → "unknown"', () => {
        expect(syncService.categorizeError({})).toBe('unknown');
    });
});

// ── SYNC SERVICE: QUEUE MANAGEMENT ─────────────

describe('Sync Service — Queue Management', () => {
    beforeEach(async () => {
        await db.sync_queue.clear();
        // Sin red: addToQueue no dispara processQueue y el item se queda en la cola
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    });

    it('addToQueue guarda el SCAN en IndexedDB y cuenta como pendiente', async () => {
        const id = await syncService.addToQueue('SCAN', {
            id: 'b1', picker_id: 'p1', quality_grade: 'A',
            timestamp: new Date().toISOString(), orchard_id: 'o1',
        });
        const queue = await syncService.getQueue();
        expect(queue).toHaveLength(1);
        expect(queue[0]).toMatchObject({ id, type: 'SCAN', retryCount: 0, payload: { picker_id: 'p1' } });
        expect(await syncService.getPendingCount()).toBe(1);
    });

    it('getQueue devuelve los items en el orden en que se encolaron', async () => {
        await syncService.addToQueue('SCAN', { id: 'first' });
        await syncService.addToQueue('SCAN', { id: 'second' });
        const queue = await syncService.getQueue();
        expect(queue.map(q => q.payload.id)).toEqual(['first', 'second']);
        expect(queue[1].timestamp).toBeGreaterThan(queue[0].timestamp);
    });

    it('getQueueSummary agrupa por tipo', async () => {
        await syncService.addToQueue('SCAN', { id: 'a' });
        await syncService.addToQueue('SCAN', { id: 'b' });
        const summary = await syncService.getQueueSummary();
        expect(summary.total).toBe(2);
        expect(summary.byType).toEqual({ SCAN: 2 });
        expect(summary.maxRetry).toBe(0);
    });
});
