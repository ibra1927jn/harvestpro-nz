/**
 * conflictService con IndexedDB real (fake-indexeddb): limite de 50, resolucion
 * y limpieza por antiguedad.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

const addToQueue = vi.fn();
vi.mock('../sync.service', () => ({ syncService: { addToQueue: (...a: unknown[]) => addToQueue(...a) } }));
vi.mock('@/config/analytics', () => ({ analytics: { trackConflictResolved: vi.fn() } }));
vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import type { StoredConflict } from '../db';

// test-setup.ts ya cargo los modulos reales: se recargan para que apliquen los vi.mock
let conflictService: typeof import('../conflict.service')['conflictService'];
let db: typeof import('../db')['db'];
beforeAll(async () => {
    vi.resetModules();
    ({ conflictService } = await import('../conflict.service'));
    ({ db } = await import('../db'));
});

const stored = (id: string, detected_at: string, resolution: StoredConflict['resolution'] = 'pending', table = 'pickers'): StoredConflict => ({
    id, table, record_id: `rec-${id}`, local_updated_at: detected_at, server_updated_at: detected_at,
    local_values: { name: 'local' }, server_values: { name: 'server' }, resolution, detected_at,
});

beforeEach(async () => {
    await db.sync_conflicts.clear();
    addToQueue.mockReset().mockResolvedValue('q1');
});
afterEach(() => { vi.useRealTimers(); });

describe('detect', () => {
    it('no conflict when the local change is strictly newer; conflict (stored) otherwise', async () => {
        expect(await conflictService.detect('pickers', 'r1', '2026-10-12T10:00:01Z', '2026-10-12T10:00:00Z', {}, {})).toBeNull();
        expect(await db.sync_conflicts.count()).toBe(0);
        const c = await conflictService.detect('pickers', 'r1', '2026-10-12T10:00:00Z', '2026-10-12T10:00:00Z', { a: 1 }, { a: 2 });
        expect(c).toMatchObject({ table: 'pickers', record_id: 'r1', resolution: 'pending', local_values: { a: 1 }, server_values: { a: 2 } });
        expect(await db.sync_conflicts.get(c!.id)).toMatchObject({ record_id: 'r1' });
    });

    it('keeps at most 50 conflicts, evicting resolved ones first', async () => {
        const rows = Array.from({ length: 50 }, (_, i) =>
            stored(`c${String(i).padStart(2, '0')}`, `2026-10-01T10:${String(i).padStart(2, '0')}:00+13:00`, i === 0 ? 'keep_server' : 'pending'));
        await db.sync_conflicts.bulkPut(rows);
        await conflictService.detect('pickers', 'new', '2026-10-12T10:00:00Z', '2026-10-12T11:00:00Z', {}, {});
        expect(await db.sync_conflicts.count()).toBe(50);
        expect(await db.sync_conflicts.get('c00')).toBeUndefined(); // el resuelto mas antiguo
        expect(await db.sync_conflicts.get('c01')).toBeDefined();
    });

    it('when all are pending the oldest one is evicted to cap storage', async () => {
        const rows = Array.from({ length: 50 }, (_, i) => stored(`c${String(i).padStart(2, '0')}`, `2026-10-01T10:${String(i).padStart(2, '0')}:00+13:00`));
        await db.sync_conflicts.bulkPut(rows);
        await conflictService.detect('pickers', 'new', '2026-10-12T10:00:00Z', '2026-10-12T11:00:00Z', {}, {});
        expect(await db.sync_conflicts.count()).toBe(50);
        expect(await db.sync_conflicts.get('c00')).toBeUndefined();
        expect(await conflictService.getPendingCount()).toBe(50);
    });
});

describe('resolve', () => {
    it('keep_local re-queues the local values with the record id under the right sync type', async () => {
        await db.sync_conflicts.put(stored('c1', '2026-10-12T10:00:00+13:00', 'pending', 'daily_attendance'));
        const r = await conflictService.resolve('c1', 'keep_local');
        expect(r?.resolution).toBe('keep_local');
        expect(addToQueue).toHaveBeenCalledWith('ATTENDANCE', { name: 'local', id: 'rec-c1' });
        expect((await db.sync_conflicts.get('c1'))?.resolution).toBe('keep_local');
        expect(await conflictService.getPendingConflicts()).toEqual([]);
    });

    it('keep_server does not re-queue anything', async () => {
        await db.sync_conflicts.put(stored('c1', '2026-10-12T10:00:00+13:00'));
        await conflictService.resolve('c1', 'keep_server');
        expect(addToQueue).not.toHaveBeenCalled();
    });

    it('keep_local on a table without sync mapping is marked but not re-queued', async () => {
        await db.sync_conflicts.put(stored('c1', '2026-10-12T10:00:00+13:00', 'pending', 'scan'));
        const r = await conflictService.resolve('c1', 'keep_local');
        expect(r?.resolution).toBe('keep_local');
        expect(addToQueue).not.toHaveBeenCalled();
    });

    it('unknown conflict id returns null', async () => {
        expect(await conflictService.resolve('nope', 'keep_server')).toBeNull();
    });
});

describe('cleanup', () => {
    it('removes resolved conflicts older than N days, keeps pending and recent ones', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-12T22:00:00Z'));
        await db.sync_conflicts.bulkPut([
            stored('old-resolved', '2026-10-01T09:00:00+13:00', 'keep_server'),
            stored('old-pending', '2026-10-01T09:00:00+13:00', 'pending'),
            stored('recent-resolved', '2026-10-12T09:00:00+13:00', 'merged'),
            // 7 dias y 2 h antes (en hora NZ): ya debe borrarse. Antes se comparaba
            // texto NZ con texto UTC y se quedaba 13 h de mas.
            stored('just-expired', '2026-10-06T09:00:00+13:00', 'keep_local'),
            // 6 dias y 23 h antes: todavia no
            stored('not-yet', '2026-10-06T12:00:00+13:00', 'keep_local'),
        ]);
        expect(await conflictService.cleanup(7)).toBe(2);
        const left = (await conflictService.getAllConflicts()).map(c => c.id).sort();
        expect(left).toEqual(['not-yet', 'old-pending', 'recent-resolved']);
    });

    it('clearAll empties the store', async () => {
        await db.sync_conflicts.put(stored('c1', '2026-10-12T10:00:00+13:00'));
        await conflictService.clearAll();
        expect(await conflictService.getPendingCount()).toBe(0);
    });
});
