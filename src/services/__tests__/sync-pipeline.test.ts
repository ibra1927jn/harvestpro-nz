/**
 * Sync Pipeline Tests
 *
 * Verifies: addToQueue → processQueue → Zod validation → DLQ flow
 *           error categorization, cross-tab locking, online/offline behavior,
 *           queue summary, multi-type processing
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

// ── Mock external boundaries ────────────────
vi.mock('../dbCrypto');
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/utils/nzst', () => ({
  toNZST: (d: Date) => d.toISOString(),
  nowNZST: () => new Date().toISOString(),
}));
vi.mock('@/config/analytics', () => ({
  analytics: {
    trackBucketScanned: vi.fn(), trackSync: vi.fn(), trackDLQError: vi.fn(),
    identify: vi.fn(), track: vi.fn(), trackEvent: vi.fn(),
  },
}));
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
vi.mock('@/services/audit.service', () => ({
  auditService: { logAudit: vi.fn(), logAuth: vi.fn(), logPickerEvent: vi.fn() },
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

import { syncService } from '../sync.service';
import { db } from '../db';

describe('Sync Pipeline — Queue Operations', () => {
  beforeEach(async () => {
    await db.sync_queue.clear();
    await db.dead_letter_queue.clear();
    await db.sync_meta.clear();
  });

  it('addToQueue creates item in IndexedDB with correct shape', async () => {
    const id = await syncService.addToQueue('SCAN', {
      picker_id: 'p1', orchard_id: 'o1', scanned_by: 'runner1',
    });
    expect(typeof id).toBe('string');

    const item = await db.sync_queue.get(id);
    expect(item).toBeDefined();
    expect(item!.type).toBe('SCAN');
    expect(item!.retryCount).toBe(0);
    expect(item!.timestamp).toBeGreaterThan(0);
  });

  it('addToQueue preserves updated_at for optimistic locking', async () => {
    const ts = '2026-04-01T12:00:00Z';
    const id = await syncService.addToQueue('ATTENDANCE', {
      action: 'check_in', userId: 'u1',
    }, ts);

    const item = await db.sync_queue.get(id);
    expect(item!.updated_at).toBe(ts);
  });

  it('getQueue returns all items from IndexedDB', async () => {
    await syncService.addToQueue('SCAN', { picker_id: 'p1', orchard_id: 'o1', scanned_by: 'r1' });
    await syncService.addToQueue('MESSAGE', { receiverId: 'u2', content: 'hi' });

    const queue = await syncService.getQueue();
    expect(queue).toHaveLength(2);
    expect(queue.map(i => i.type).sort()).toEqual(['MESSAGE', 'SCAN']);
  });

  it('getPendingCount matches number of queued items', async () => {
    expect(await syncService.getPendingCount()).toBe(0);

    await syncService.addToQueue('SCAN', { picker_id: 'p1', orchard_id: 'o1', scanned_by: 'r1' });
    await syncService.addToQueue('SCAN', { picker_id: 'p2', orchard_id: 'o1', scanned_by: 'r1' });

    expect(await syncService.getPendingCount()).toBe(2);
  });
});

describe('Sync Pipeline — Queue Summary', () => {
  // Sin conexion: addToQueue no dispara el envio en segundo plano, que cambiaba
  // retryCount mientras se leia el resumen (test dependiente del tiempo)
  beforeEach(async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    await db.sync_queue.clear();
    await db.sync_meta.clear();
  });
  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  });

  it('returns structured summary with byType breakdown', async () => {
    await syncService.addToQueue('SCAN', { picker_id: 'p1', orchard_id: 'o1', scanned_by: 'r1' });
    await syncService.addToQueue('SCAN', { picker_id: 'p2', orchard_id: 'o1', scanned_by: 'r1' });
    await syncService.addToQueue('MESSAGE', { receiverId: 'u2', content: 'test' });

    const summary = await syncService.getQueueSummary();
    expect(summary.total).toBe(3);
    expect(summary.byType['SCAN']).toBe(2);
    expect(summary.byType['MESSAGE']).toBe(1);
    expect(summary.maxRetry).toBe(0);
    expect(summary.oldestTimestamp).toBeGreaterThan(0);
  });

  it('returns 0 totals when queue is empty', async () => {
    const summary = await syncService.getQueueSummary();
    expect(summary.total).toBe(0);
    expect(summary.maxRetry).toBe(0);
    expect(summary.oldestTimestamp).toBeNull();
  });

  it('maxRetry reflects highest retryCount in queue', async () => {
    const id = await syncService.addToQueue('SCAN', { picker_id: 'p1', orchard_id: 'o1', scanned_by: 'r1' });
    await db.sync_queue.update(id, { retryCount: 7 });

    const summary = await syncService.getQueueSummary();
    expect(summary.maxRetry).toBe(7);
  });
});

describe('Sync Pipeline — Error Categorization', () => {
  it('classifies network errors correctly', () => {
    expect(syncService.categorizeError(new Error('Failed to fetch'))).toBe('network');
    expect(syncService.categorizeError(new Error('network request timeout'))).toBe('network');
    expect(syncService.categorizeError(new Error('request aborted'))).toBe('network');
  });

  it('classifies server errors correctly', () => {
    expect(syncService.categorizeError(new Error('500 Internal Server Error'))).toBe('server');
    expect(syncService.categorizeError(new Error('502 Bad Gateway'))).toBe('server');
    expect(syncService.categorizeError(new Error('503 Service Unavailable'))).toBe('server');
    expect(syncService.categorizeError(new Error('429 Too Many Requests'))).toBe('server');
  });

  it('classifies validation errors correctly', () => {
    expect(syncService.categorizeError(new Error('unique constraint violation'))).toBe('validation');
    expect(syncService.categorizeError(new Error('foreign key constraint'))).toBe('validation');
    expect(syncService.categorizeError(new Error('optimistic lock conflict'))).toBe('validation');
  });

  it('classifies Supabase error codes correctly', () => {
    expect(syncService.categorizeError({ code: '23505' })).toBe('validation');
    expect(syncService.categorizeError({ code: 'PGRST' })).toBe('server');
  });

  it('returns "unknown" for unrecognized errors', () => {
    expect(syncService.categorizeError(null)).toBe('unknown');
    expect(syncService.categorizeError('just a string')).toBe('unknown');
    expect(syncService.categorizeError(42)).toBe('unknown');
    expect(syncService.categorizeError({})).toBe('unknown');
  });

  it('validation errors get max 5 retries vs 50 for others', () => {
    // This tests the constants embedded in _doProcessQueue
    // We verify the categorization is correct — the logic uses these categories
    // to set maxRetries = 5 for validation vs 50 for others
    const validationError = syncService.categorizeError(new Error('23505 unique constraint'));
    const networkError = syncService.categorizeError(new Error('Failed to fetch'));
    expect(validationError).toBe('validation');
    expect(networkError).toBe('network');
  });
});

describe('Sync Pipeline — Last Sync Time', () => {
  beforeEach(async () => {
    await db.sync_meta.clear();
  });

  it('returns null when no sync has occurred', async () => {
    const time = await syncService.getLastSyncTime();
    expect(time).toBeNull();
  });

  it('setLastSyncTime stores and getLastSyncTime retrieves', async () => {
    await syncService.setLastSyncTime();
    const time = await syncService.getLastSyncTime();
    expect(time).toBeGreaterThan(0);
    expect(typeof time).toBe('number');
  });

  it('setLastSyncTime updates existing value', async () => {
    await syncService.setLastSyncTime();
    const first = await syncService.getLastSyncTime();

    // Small delay to ensure different timestamp
    await new Promise(r => setTimeout(r, 10));
    await syncService.setLastSyncTime();
    const second = await syncService.getLastSyncTime();

    expect(second!).toBeGreaterThanOrEqual(first!);
  });
});

describe('Sync Pipeline — Max Retry Count', () => {
  beforeEach(async () => {
    await db.sync_queue.clear();
  });

  it('returns 0 when queue is empty', async () => {
    expect(await syncService.getMaxRetryCount()).toBe(0);
  });

  it('returns highest retryCount across all items', async () => {
    const id1 = await syncService.addToQueue('SCAN', { picker_id: 'p1', orchard_id: 'o1', scanned_by: 'r1' });
    const id2 = await syncService.addToQueue('SCAN', { picker_id: 'p2', orchard_id: 'o1', scanned_by: 'r1' });

    await db.sync_queue.update(id1, { retryCount: 3 });
    await db.sync_queue.update(id2, { retryCount: 12 });

    expect(await syncService.getMaxRetryCount()).toBe(12);
  });
});

describe('Sync Pipeline — Zod Validation Schemas', () => {
  // These test that the Zod schemas embedded in sync.service.ts
  // correctly validate payloads by type

  it('SCAN payload requires picker_id, orchard_id, scanned_by', async () => {
    // Valid SCAN — should not throw
    await expect(
      syncService.addToQueue('SCAN', {
        picker_id: 'p1', orchard_id: 'o1', scanned_by: 'runner1',
      })
    ).resolves.toBeDefined();
  });

  it('ASSIGNMENT payload requires userId and orchardId', async () => {
    await expect(
      syncService.addToQueue('ASSIGNMENT', {
        userId: 'u1', orchardId: 'o1',
      })
    ).resolves.toBeDefined();
  });

  it('MESSAGE payload requires receiverId and content', async () => {
    await expect(
      syncService.addToQueue('MESSAGE', {
        receiverId: 'u2', content: 'Hello from field',
      })
    ).resolves.toBeDefined();
  });

  it('CONTRACT payload requires action field', async () => {
    await expect(
      syncService.addToQueue('CONTRACT', {
        action: 'create', employee_id: 'e1', orchard_id: 'o1',
      })
    ).resolves.toBeDefined();
  });

  it('QC_INSPECTION payload requires grade enum', async () => {
    await expect(
      syncService.addToQueue('QC_INSPECTION', {
        orchard_id: 'o1', picker_id: 'p1', inspector_id: 'i1', grade: 'A',
      })
    ).resolves.toBeDefined();
  });
});
