/**
 * Cola offline: que pasa de verdad al procesarla (exito, reintento, corte de red,
 * cola de errores / dead letter) con IndexedDB real (fake-indexeddb).
 * Los procesadores y servicios remotos son el limite que se simula.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import fc from 'fast-check';

// Los temporizadores de sync.service (pasada de arranque a los 5 s, reintento a
// los 15 s) son falsos desde antes de importar el módulo: en una máquina lenta se
// disparaban en mitad de un test, robaban el cerrojo y el test fallaba al azar.
// IndexedDB (fake-indexeddb) usa setImmediate, que sigue siendo real.
vi.hoisted(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });

const recordBucket = vi.fn();
const sendMessage = vi.fn();
const assignUserToOrchard = vi.fn();
const processors = {
    processContract: vi.fn(), processTransport: vi.fn(), processTimesheet: vi.fn(),
    processAttendance: vi.fn(), processPicker: vi.fn(), processQCInspection: vi.fn(), processUnlink: vi.fn(),
};

vi.mock('../bucket-ledger.service', () => ({ bucketLedgerService: { recordBucket: (...a: unknown[]) => recordBucket(...a) } }));
vi.mock('../simple-messaging.service', () => ({ simpleMessagingService: { sendMessage: (...a: unknown[]) => sendMessage(...a) } }));
vi.mock('../user.service', () => ({ userService: { assignUserToOrchard: (...a: unknown[]) => assignUserToOrchard(...a) } }));
vi.mock('../sync-processors', () => ({
    processContract: (...a: unknown[]) => processors.processContract(...a),
    processTransport: (...a: unknown[]) => processors.processTransport(...a),
    processTimesheet: (...a: unknown[]) => processors.processTimesheet(...a),
    processAttendance: (...a: unknown[]) => processors.processAttendance(...a),
    processPicker: (...a: unknown[]) => processors.processPicker(...a),
    processQCInspection: (...a: unknown[]) => processors.processQCInspection(...a),
    processUnlink: (...a: unknown[]) => processors.processUnlink(...a),
}));
vi.mock('@/config/analytics', () => ({
    analytics: { trackSync: vi.fn(), trackDLQError: vi.fn(), trackConflictResolved: vi.fn() },
}));
vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { db, type QueuedSyncItem } from '../db';
import { syncService } from '../sync.service';
import { analytics } from '@/config/analytics';

const SCAN = { picker_id: 'p1', orchard_id: 'o1', scanned_by: 'runner1', quality_grade: 'A' };
const MSG = { receiverId: 'u2', content: 'hola' };
// El tipo MESSAGE ya no tiene procesador (2026-10-23): los tests de la cola usan ASSIGNMENT
const ASG = { userId: 'u2', orchardId: 'o1' };

let seq = 0;
async function queue(type: QueuedSyncItem['type'], payload: Record<string, unknown>, extra: Partial<QueuedSyncItem> = {}) {
    seq += 1;
    const item: QueuedSyncItem = { id: `item-${seq}`, type, payload, timestamp: Date.parse('2026-10-12T21:00:00Z') + seq * 1000, retryCount: 0, ...extra };
    await db.sync_queue.put(item);
    return item;
}

let online = true;
beforeEach(async () => {
    await db.sync_queue.clear();
    await db.dead_letter_queue.clear();
    await db.sync_conflicts.clear();
    await db.sync_meta.clear();
    online = true;
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
    for (const fn of [recordBucket, sendMessage, assignUserToOrchard, ...Object.values(processors)]) {
        fn.mockReset();
        fn.mockResolvedValue(undefined);
    }
    vi.mocked(analytics.trackSync).mockClear();
    vi.mocked(analytics.trackDLQError).mockClear();
});
afterEach(() => { vi.restoreAllMocks(); });

describe('background timers (fake, under test control)', () => {
    it('the startup pass sends what was queued before the app opened, and only when its time comes', async () => {
        const item = await queue('SCAN', SCAN);
        await vi.advanceTimersByTimeAsync(4_000);
        expect(recordBucket).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1_000);
        await vi.waitFor(async () => expect(await db.sync_queue.get(item.id)).toBeUndefined());
        expect(recordBucket).toHaveBeenCalledTimes(1);
    });
});

describe('processQueue — success', () => {
    it('sends each item to its processor with the validated payload and empties the queue', async () => {
        await queue('SCAN', SCAN, { timestamp: Date.parse('2026-10-12T21:00:05Z') });
        await queue('ASSIGNMENT', ASG);
        await queue('TIMESHEET', { action: 'approve', attendanceId: 'a1', verifiedBy: 'hr1' }, { updated_at: '2026-10-12T00:00:00Z' });

        await syncService.processQueue();
        expect(await db.sync_queue.count()).toBe(0);
        expect(recordBucket).toHaveBeenCalledTimes(1);
        const sent = recordBucket.mock.calls[0][0] as Record<string, unknown>;
        expect(sent).toMatchObject(SCAN);
        // La hora del escaneo es la de la cola, en hora NZ (+13 en octubre)
        expect(sent.scanned_at).toBe('2026-10-13T10:00:05+13:00');
        expect(assignUserToOrchard).toHaveBeenCalledWith('u2', 'o1');
        expect(processors.processTimesheet).toHaveBeenCalledWith({ action: 'approve', attendanceId: 'a1', verifiedBy: 'hr1' }, '2026-10-12T00:00:00Z');
        expect(await syncService.getLastSyncTime()).toBeGreaterThan(0);
        expect(analytics.trackSync).toHaveBeenCalledWith(3, expect.any(Number), true);
    });

    it('does nothing while offline', async () => {
        await queue('SCAN', SCAN);
        online = false;
        await syncService.processQueue();
        expect(recordBucket).not.toHaveBeenCalled();
        expect(await db.sync_queue.count()).toBe(1);
        expect(await syncService.getLastSyncTime()).toBeNull();
    });
});

describe('legacy MESSAGE items', () => {
    it('a MESSAGE left on a phone goes to the dead letter queue (no processor), it is not sent', async () => {
        const old = await queue('MESSAGE', MSG);
        await syncService.processQueue();
        expect(sendMessage).not.toHaveBeenCalled();
        expect(await db.sync_queue.get(old.id)).toBeUndefined();
        expect(await db.dead_letter_queue.get(old.id)).toBeTruthy();
    });
});

describe('processQueue — failures', () => {
    it('a failing item stays with retryCount + 1 and does not block the next ones', async () => {
        const bad = await queue('SCAN', SCAN, { retryCount: 2 });
        const good = await queue('ASSIGNMENT', ASG);
        recordBucket.mockRejectedValueOnce(new Error('something odd'));

        await syncService.processQueue();

        expect(await db.sync_queue.get(bad.id)).toMatchObject({ retryCount: 3 });
        expect(await db.sync_queue.get(good.id)).toBeUndefined();
        expect(await db.dead_letter_queue.count()).toBe(0);
    });

    it('losing the connection stops the run: later items are not touched', async () => {
        const first = await queue('SCAN', SCAN);
        const second = await queue('ASSIGNMENT', ASG);
        recordBucket.mockImplementationOnce(async () => { online = false; throw new Error('Failed to fetch'); });

        await syncService.processQueue();

        expect(assignUserToOrchard).not.toHaveBeenCalled();
        expect(await db.sync_queue.get(first.id)).toMatchObject({ retryCount: 1 });
        expect(await db.sync_queue.get(second.id)).toMatchObject({ retryCount: 0 });
        expect(await syncService.getLastSyncTime()).toBeNull();
    });

    it('a network failure while online does not block the items behind it; three in a row stop the run', async () => {
        const first = await queue('SCAN', SCAN);
        const second = await queue('ASSIGNMENT', ASG);
        recordBucket.mockRejectedValueOnce(new Error('Failed to fetch'));

        await syncService.processQueue();
        expect(assignUserToOrchard).toHaveBeenCalledTimes(1);
        expect(await db.sync_queue.get(first.id)).toMatchObject({ retryCount: 1 });
        expect(await db.sync_queue.get(second.id)).toBeUndefined();

        const a = await queue('SCAN', SCAN);
        const b = await queue('SCAN', SCAN);
        const c = await queue('ASSIGNMENT', ASG);
        recordBucket.mockRejectedValue(new Error('Failed to fetch'));
        assignUserToOrchard.mockClear();
        await syncService.processQueue();
        // first, a y b fallan seguidos: c no se toca
        expect(assignUserToOrchard).not.toHaveBeenCalled();
        expect(await db.sync_queue.get(a.id)).toMatchObject({ retryCount: 1 });
        expect(await db.sync_queue.get(b.id)).toMatchObject({ retryCount: 1 });
        expect(await db.sync_queue.get(c.id)).toMatchObject({ retryCount: 0 });
    });

    it('validation errors go to the dead letter queue on the 5th attempt (not before)', async () => {
        const fourth = await queue('SCAN', SCAN, { retryCount: 3 });
        const fifth = await queue('SCAN', { ...SCAN, picker_id: 'p2' }, { retryCount: 4 });
        recordBucket.mockRejectedValue(new Error('duplicate key value violates unique constraint'));

        await syncService.processQueue();

        expect(await db.sync_queue.get(fourth.id)).toMatchObject({ retryCount: 4 });
        expect(await db.sync_queue.get(fifth.id)).toBeUndefined();
        const dead = await db.dead_letter_queue.get(fifth.id);
        expect(dead).toMatchObject({
            type: 'SCAN', retryCount: 5, failureReason: 'validation: max retries exceeded',
            errorCode: 'duplicate key value violates unique constraint', timestamp: fifth.timestamp,
        });
        expect(dead?.payload).toEqual(fifth.payload);
        // Queda registrado como conflicto pendiente para revisarlo
        const conflicts = await db.sync_conflicts.toArray();
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0]).toMatchObject({ table: 'scan', record_id: fifth.id, resolution: 'pending' });
        expect(analytics.trackDLQError).toHaveBeenCalledWith('validation', 'high');
    });

    it('other errors are retried up to 50 times before the dead letter queue', async () => {
        const a = await queue('ASSIGNMENT', ASG, { retryCount: 48 });
        const b = await queue('ASSIGNMENT', ASG, { retryCount: 49 });
        assignUserToOrchard.mockRejectedValue(new Error('500 internal error'));

        await syncService.processQueue();

        expect(await db.sync_queue.get(a.id)).toMatchObject({ retryCount: 49 });
        expect(await db.dead_letter_queue.get(b.id)).toMatchObject({ retryCount: 50, failureReason: 'server: max retries exceeded' });
        expect(analytics.trackDLQError).toHaveBeenCalledWith('server', 'critical');
    });

    it('if writing to the dead letter queue fails the item stays in the queue (never lost)', async () => {
        const item = await queue('SCAN', SCAN, { retryCount: 4 });
        recordBucket.mockRejectedValue(new Error('violates foreign key'));
        vi.spyOn(db.dead_letter_queue, 'put').mockRejectedValue(new Error('quota exceeded'));

        await syncService.processQueue();

        expect(await db.sync_queue.get(item.id)).toBeDefined();
        expect(analytics.trackDLQError).not.toHaveBeenCalled();
    });

    it('a corrupt payload (fails the schema) is a permanent error: dead letter after 5 attempts', async () => {
        const item = await queue('SCAN', { picker_id: 'p1' }, { retryCount: 4 });
        await syncService.processQueue();
        expect(recordBucket).not.toHaveBeenCalled();
        expect(await db.sync_queue.get(item.id)).toBeUndefined();
        expect(await db.dead_letter_queue.get(item.id)).toMatchObject({ failureReason: 'validation: max retries exceeded' });
    });
});

describe('categorizeError', () => {
    it('Postgres integrity errors (SQLSTATE class 23) are validation', () => {
        expect(syncService.categorizeError(new Error('23505: duplicate key'))).toBe('validation');
        expect(syncService.categorizeError({ code: '23503', message: 'fk' })).toBe('validation');
    });

    it('a "23" inside a picker code, row or time is not a validation error', () => {
        // Antes: cualquier mensaje con "23" era 'validation' (5 reintentos y a la cola de errores)
        expect(syncService.categorizeError(new Error('Picker LOC-023 not found'))).toBe('unknown');
        expect(syncService.categorizeError(new Error('row 23 is closed'))).toBe('unknown');
    });

    it('a foreign key error (23503) is validation, not an HTTP 503', () => {
        expect(syncService.categorizeError(new Error('insert or update violates foreign key constraint (23503)'))).toBe('validation');
        expect(syncService.categorizeError(new Error('Edge Function returned a non-2xx status code (503)'))).toBe('server');
    });

    it('real PostgREST codes (PGRST116, PGRST301…) are server errors', () => {
        // Antes se comparaba con 'PGRST' exacto: ningún código real coincidía
        expect(syncService.categorizeError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })).toBe('server');
        expect(syncService.categorizeError({ code: 'PGRST301', message: 'JWT expired' })).toBe('server');
        expect(syncService.categorizeError({ code: '42501', message: 'permission denied' })).toBe('unknown');
    });

    it('being offline always counts as network', () => {
        online = false;
        expect(syncService.categorizeError(new Error('duplicate key'))).toBe('network');
    });
});

describe('queue invariants (property)', () => {
    type Outcome = 'ok' | 'unknown' | 'validation';
    const outcome = fc.constantFrom<Outcome>('ok', 'unknown', 'validation');

    it('after a run every item is exactly once in: done, queue (retry + 1) or dead letter', async () => {
        await fc.assert(fc.asyncProperty(
            fc.array(fc.record({ outcome, retry: fc.integer({ min: 0, max: 50 }) }), { minLength: 1, maxLength: 12 }),
            async (items) => {
                await db.sync_queue.clear();
                await db.dead_letter_queue.clear();
                const byPicker = new Map<string, Outcome>();
                const ids: string[] = [];
                for (const [i, it] of items.entries()) {
                    byPicker.set(`p${i}`, it.outcome);
                    ids.push((await queue('SCAN', { ...SCAN, picker_id: `p${i}` }, { retryCount: it.retry })).id);
                }
                recordBucket.mockImplementation(async (s: { picker_id: string }) => {
                    const o = byPicker.get(s.picker_id);
                    if (o === 'unknown') throw new Error('weird failure');
                    if (o === 'validation') throw new Error('violates check constraint');
                });

                await syncService.processQueue();

                const left = new Map((await db.sync_queue.toArray()).map(x => [x.id, x]));
                const dead = new Map((await db.dead_letter_queue.toArray()).map(x => [x.id, x]));
                items.forEach((it, i) => {
                    const id = ids[i];
                    const inQueue = left.has(id), inDead = dead.has(id);
                    expect(inQueue && inDead).toBe(false);
                    if (it.outcome === 'ok') {
                        expect(inQueue || inDead).toBe(false);
                        return;
                    }
                    const max = it.outcome === 'validation' ? 5 : 50;
                    if (it.retry + 1 < max) {
                        expect(left.get(id)?.retryCount).toBe(it.retry + 1);
                    } else {
                        expect(dead.get(id)?.retryCount).toBe(it.retry + 1);
                    }
                });
            },
        ), { numRuns: 40 });
    });
});

describe('processQueue — every item type reaches its processor; bad enums are rejected', () => {
    const valid: Array<[QueuedSyncItem['type'], Record<string, unknown>, () => ReturnType<typeof vi.fn>]> = [
        ['ATTENDANCE', { action: 'check_in', userId: 'u1' }, () => processors.processAttendance],
        ['ASSIGNMENT', { userId: 'u1', orchardId: 'o1' }, () => assignUserToOrchard],
        ['CONTRACT', { action: 'update', contractId: 'c1' }, () => processors.processContract],
        ['TRANSPORT', { action: 'assign', requestId: 'r1', vehicleId: 'v1' }, () => processors.processTransport],
        ['PICKER', { id: 'p1', picker_id: 'LOC-1', name: 'Ana', orchard_id: 'o1' }, () => processors.processPicker],
        ['QC_INSPECTION', { orchard_id: 'o1', picker_id: 'p1', inspector_id: 'q1', grade: 'B' }, () => processors.processQCInspection],
        ['UNLINK', { userId: 'u1' }, () => processors.processUnlink],
    ];

    it('valid payloads are processed and removed', async () => {
        for (const [type, payload] of valid) await queue(type, payload);
        await syncService.processQueue();
        for (const [type, payload, fn] of valid) {
            expect(fn(), type).toHaveBeenCalledTimes(1);
            const firstArg = fn().mock.calls[0][0];
            if (type === 'ASSIGNMENT') expect(fn().mock.calls[0]).toEqual(['u1', 'o1']);
            else expect(firstArg, type).toMatchObject(payload);
        }
        expect(await db.sync_queue.count()).toBe(0);
    });

    it('values outside the allowed enums or missing required fields never reach the processor', async () => {
        const bad: Array<[QueuedSyncItem['type'], Record<string, unknown>]> = [
            ['CONTRACT', { action: 'delete' }],
            ['TRANSPORT', { action: 'teleport' }],
            ['TIMESHEET', { action: 'maybe', attendanceId: 'a1', verifiedBy: 'hr1' }],
            ['QC_INSPECTION', { orchard_id: 'o1', picker_id: 'p1', inspector_id: 'q1', grade: 'D' }],
            ['ASSIGNMENT', { userId: 'u1' }],
            ['PICKER', { id: 'p1' }],
            ['UNLINK', {}],
        ];
        for (const [type, payload] of bad) await queue(type, payload, { retryCount: 4 });
        await syncService.processQueue();
        for (const fn of [processors.processContract, processors.processTransport, processors.processTimesheet, processors.processQCInspection, processors.processPicker, processors.processUnlink, assignUserToOrchard]) {
            expect(fn).not.toHaveBeenCalled();
        }
        // Errores de esquema = validacion: al 5o intento van a la cola de errores
        expect(await db.dead_letter_queue.count()).toBe(bad.length);
    });

    it('addToQueue starts sending right away when online, not when offline', async () => {
        online = false;
        await syncService.addToQueue('UNLINK', { userId: 'u9' });
        expect(processors.processUnlink).not.toHaveBeenCalled();
        online = true;
        await syncService.addToQueue('UNLINK', { userId: 'u8' });
        await vi.waitFor(() => expect(processors.processUnlink).toHaveBeenCalledTimes(2));
    });

    it('queue summary reports the highest retry count and the oldest item', async () => {
        await queue('UNLINK', { userId: 'a' }, { retryCount: 2, timestamp: 2000 });
        await queue('UNLINK', { userId: 'b' }, { retryCount: 9, timestamp: 1000 });
        online = false;
        const s = await syncService.getQueueSummary();
        expect(s).toMatchObject({ total: 2, byType: { UNLINK: 2 }, maxRetry: 9, oldestTimestamp: 1000 });
        expect(await syncService.getMaxRetryCount()).toBe(9);
    });
});
