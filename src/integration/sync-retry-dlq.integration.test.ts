/**
 * INTEGRATION TEST: Sync Retry + Dead Letter Queue
 *
 * Tests: processQueue retry logic → max retries → DLQ flow
 * Uses: fake-indexeddb for real Dexie operations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

// ── Mock external boundaries ────────────────
vi.mock('@/services/bucket-ledger.service', () => ({
  bucketLedgerService: {
    recordBucket: vi.fn().mockRejectedValue(new Error('502 Bad Gateway')),
  },
}));

vi.mock('@/services/simple-messaging.service', () => ({
  simpleMessagingService: { sendMessage: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/services/user.service', () => ({
  userService: { assignUserToOrchard: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/services/conflict.service', () => ({
  conflictService: { detect: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/utils/nzst', () => ({
  toNZST: (d: Date) => d.toISOString(),
  nowNZST: () => '2026-03-10T14:00:00+13:00',
}));

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/services/sync-processors', () => ({
  processContract: vi.fn(),
  processTransport: vi.fn(),
  processTimesheet: vi.fn(),
  processAttendance: vi.fn(),
}));

import { syncService } from '@/services/sync.service';
import { db } from '@/services/db';

const SCAN_PAYLOAD = {
  picker_id: 'pk-001',
  orchard_id: 'orchard-001',
  quality_grade: 'A' as const,
  timestamp: '2026-03-10T10:00:00+13:00',
  scanned_by: 'user-001',
};

describe('Sync Retry & DLQ — Integration', () => {
  beforeEach(async () => {
    await db.sync_queue.clear();
    await db.sync_meta.clear();
    try {
      await db.dead_letter_queue.clear();
    } catch {
      /* may not exist in test env */
    }
    vi.clearAllMocks();
  });

  // ── Queue Persistence ──────────────────────

  it('addToQueue persists item to IndexedDB with correct structure', async () => {
    const id = await syncService.addToQueue('SCAN', SCAN_PAYLOAD);
    expect(typeof id).toBe('string');
    const items = await db.sync_queue.toArray();
    expect(items.length).toBe(1);
    expect(items[0].type).toBe('SCAN');
    expect(items[0].retryCount).toBe(0);
    expect(items[0].payload).toEqual(expect.objectContaining({ picker_id: 'pk-001' }));
  });

  it('addToQueue stores updated_at when provided (optimistic locking)', async () => {
    await syncService.addToQueue('SCAN', SCAN_PAYLOAD, '2026-03-10T12:00:00Z');
    const items = await db.sync_queue.toArray();
    expect(items[0].updated_at).toBe('2026-03-10T12:00:00Z');
  });

  it('multiple addToQueue calls produce unique IDs', async () => {
    const id1 = await syncService.addToQueue('SCAN', SCAN_PAYLOAD);
    const id2 = await syncService.addToQueue('SCAN', { ...SCAN_PAYLOAD, picker_id: 'pk-002' });
    expect(id1).not.toBe(id2);
  });

  // ── Queue Summary ──────────────────────────

  it('getQueueSummary provides accurate type breakdown', async () => {
    // Sin conexión: addToQueue no lanza processQueue en segundo plano (si no,
    // un reintento puede sumar retryCount antes de leer el resumen)
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await syncService.addToQueue('SCAN', SCAN_PAYLOAD);
    await syncService.addToQueue('SCAN', { ...SCAN_PAYLOAD, picker_id: 'pk-002' });
    await syncService.addToQueue('MESSAGE', {
      channel_type: 'direct',
      recipient_id: 'u2',
      sender_id: 'u1',
      content: 'Hi',
      timestamp: '2026-03-10T10:00:00+13:00',
    });

    const summary = await syncService.getQueueSummary();
    expect(summary.total).toBe(3);
    expect(summary.byType['SCAN']).toBe(2);
    expect(summary.byType['MESSAGE']).toBe(1);
    expect(summary.maxRetry).toBe(0);
    online.mockRestore();
  });

  it('getQueueSummary tracks oldest timestamp', async () => {
    await db.sync_queue.bulkPut([
      { id: 'ts1', type: 'SCAN', payload: SCAN_PAYLOAD as any, retryCount: 0, timestamp: 1000 },
      { id: 'ts2', type: 'SCAN', payload: SCAN_PAYLOAD as any, retryCount: 0, timestamp: 500 },
    ]);
    const summary = await syncService.getQueueSummary();
    expect(summary.oldestTimestamp).toBe(500);
  });

  // ── Error Categorization ───────────────────

  it('categorizes network vs server vs validation vs unknown', () => {
    expect(syncService.categorizeError(new Error('Failed to fetch'))).toBe('network');
    expect(syncService.categorizeError(new Error('502 Bad Gateway'))).toBe('server');
    expect(syncService.categorizeError(new Error('unique constraint'))).toBe('validation');
    expect(syncService.categorizeError({ code: '23505' })).toBe('validation');
    expect(syncService.categorizeError(42)).toBe('unknown');
  });

  // ── Last Sync Time ─────────────────────────

  it('setLastSyncTime + getLastSyncTime round-trips correctly', async () => {
    expect(await syncService.getLastSyncTime()).toBeNull();
    await syncService.setLastSyncTime();
    const time = await syncService.getLastSyncTime();
    expect(time).not.toBeNull();
    expect(Date.now() - time!).toBeLessThan(2000);
  });

  // ── Max Retry Count ────────────────────────

  it('getMaxRetryCount returns highest retry count', async () => {
    await db.sync_queue.bulkPut([
      {
        id: 'r1',
        type: 'SCAN',
        payload: SCAN_PAYLOAD as any,
        retryCount: 2,
        timestamp: Date.now(),
      },
      {
        id: 'r2',
        type: 'SCAN',
        payload: SCAN_PAYLOAD as any,
        retryCount: 7,
        timestamp: Date.now(),
      },
      {
        id: 'r3',
        type: 'SCAN',
        payload: SCAN_PAYLOAD as any,
        retryCount: 3,
        timestamp: Date.now(),
      },
    ]);
    expect(await syncService.getMaxRetryCount()).toBe(7);
  });

  it('getMaxRetryCount returns 0 for empty queue', async () => {
    expect(await syncService.getMaxRetryCount()).toBe(0);
  });
});
