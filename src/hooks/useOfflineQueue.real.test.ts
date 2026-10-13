/**
 * useOfflineQueue con IndexedDB real (fake-indexeddb) y la cola real
 * (syncService). Solo se simula el servidor (userService).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { renderHook, act } from '@testing-library/react';

const { mockUnassign } = vi.hoisted(() => ({ mockUnassign: vi.fn() }));

vi.mock('@/services/user.service', () => ({
    userService: { unassignUserFromOrchard: mockUnassign, assignUserToOrchard: vi.fn() },
}));
vi.mock('@/services/conflict.service', () => ({ conflictService: { detect: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('@/config/analytics', () => ({ analytics: { trackSync: vi.fn(), trackDLQError: vi.fn() } }));
vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { db } from '@/services/db';
import { useOfflineQueue } from './useOfflineQueue';

async function queueUnlink(id: string, userId: string): Promise<void> {
    await db.sync_queue.put({ id, type: 'UNLINK', payload: { userId }, timestamp: Date.now(), retryCount: 0 });
}

/** Vuelve la conexión y espera a que la pasada termine */
async function reconnect(callsBefore: number): Promise<void> {
    await act(async () => {
        window.dispatchEvent(new Event('online'));
    });
    await vi.waitFor(() => expect(mockUnassign.mock.calls.length).toBeGreaterThan(callsBefore));
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
}

describe('useOfflineQueue', () => {
    beforeEach(async () => {
        mockUnassign.mockReset();
        mockUnassign.mockResolvedValue(undefined);
        await db.sync_queue.clear();
        await db.dead_letter_queue.clear();
        Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
    });

    it('sends pending unlinks on mount when online, removes them and refreshes data', async () => {
        await queueUnlink('q1', 'u1');
        await queueUnlink('q2', 'u2');
        const fetchGlobalData = vi.fn();
        renderHook(() => useOfflineQueue(fetchGlobalData));

        await vi.waitFor(() => expect(fetchGlobalData).toHaveBeenCalledTimes(1));
        expect(mockUnassign.mock.calls.map(c => c[0]).sort()).toEqual(['u1', 'u2']);
        expect(await db.sync_queue.count()).toBe(0);
    });

    it('does nothing while offline', async () => {
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
        await queueUnlink('q1', 'u1');
        const fetchGlobalData = vi.fn();
        renderHook(() => useOfflineQueue(fetchGlobalData));

        await new Promise(r => setTimeout(r, 50));
        expect(mockUnassign).not.toHaveBeenCalled();
        expect(await db.sync_queue.count()).toBe(1);
    });

    it('an unlink that keeps failing is never silently dropped: it ends in the dead letter queue with the reason', async () => {
        // Antes: tras 3 fallos se borraba de la cola sin dejar rastro
        mockUnassign.mockRejectedValue(new Error('update on table "users" violates foreign key constraint'));
        await queueUnlink('q1', 'u1');
        const fetchGlobalData = vi.fn();
        renderHook(() => useOfflineQueue(fetchGlobalData));
        await vi.waitFor(() => expect(mockUnassign).toHaveBeenCalledTimes(1));

        for (let i = 0; i < 8; i++) {
            const inQueue = await db.sync_queue.get('q1');
            const inDlq = await db.dead_letter_queue.get('q1');
            expect(Boolean(inQueue) || Boolean(inDlq), `unlink lost after ${mockUnassign.mock.calls.length} attempts`).toBe(true);
            if (inDlq) break;
            await reconnect(mockUnassign.mock.calls.length);
        }

        const dead = await db.dead_letter_queue.get('q1');
        expect(dead?.type).toBe('UNLINK');
        expect(dead?.payload).toEqual({ userId: 'u1' });
        expect(dead?.failureReason).toMatch(/max retries/);
        expect(await db.sync_queue.get('q1')).toBeUndefined();
    });
});
