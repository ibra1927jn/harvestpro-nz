/**
 * Bins del runner sin cobertura: alta y cambios de estado desde la cola offline.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insert = vi.fn();
const updateStatus = vi.fn();
vi.mock('@/repositories/bin.repository', () => ({
    binRepository: {
        insert: (...a: unknown[]) => insert(...a),
        updateStatus: (...a: unknown[]) => updateStatus(...a),
    },
}));

import { processBin } from './bin.processor';
import { dispatchSyncItem } from '../sync-queue/dispatchItem';
import * as schemas from '../sync.schemas';
import type { QueuedSyncItem } from '../db';

const BIN = '6b0f1a8e-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
const ORCH = 'e1337e6a-54cc-431c-9c00-980e8ea270a4';

beforeEach(() => {
    insert.mockReset();
    updateStatus.mockReset();
});

describe('processBin', () => {
    it('registers the bin with the id made on the phone', async () => {
        insert.mockResolvedValue(undefined);
        await processBin({ action: 'register', bin_id: BIN, orchard_id: ORCH, bin_code: 'BIN-042', status: 'partial' });
        expect(insert).toHaveBeenCalledWith({ id: BIN, orchard_id: ORCH, bin_code: 'BIN-042', status: 'partial' });
    });

    it('a register that already arrived (lost response) is not an error', async () => {
        insert.mockRejectedValue({ code: '23505', message: 'duplicate key value violates unique constraint "bins_pkey"' });
        await expect(processBin({ action: 'register', bin_id: BIN, orchard_id: ORCH, bin_code: 'BIN-042' })).resolves.toBeUndefined();
    });

    it('other errors go back to the queue', async () => {
        insert.mockRejectedValue({ code: '42501', message: 'new row violates row-level security policy' });
        await expect(processBin({ action: 'register', bin_id: BIN, orchard_id: ORCH, bin_code: 'BIN-042' })).rejects.toMatchObject({ code: '42501' });
    });

    it('a status change keeps the time it was filled on the phone', async () => {
        updateStatus.mockResolvedValue(undefined);
        await processBin({ action: 'status', bin_id: BIN, status: 'full', filled_at: '2026-10-23T09:12:00+13:00' });
        expect(updateStatus).toHaveBeenCalledWith(BIN, 'full', '2026-10-23T09:12:00+13:00');
        await processBin({ action: 'status', bin_id: BIN, status: 'collected' });
        expect(updateStatus).toHaveBeenLastCalledWith(BIN, 'collected', null);
    });
});

describe('BIN items in the sync queue dispatcher', () => {
    const item = (payload: Record<string, unknown>): QueuedSyncItem => ({ id: 'q1', type: 'BIN', payload, timestamp: 1, retryCount: 0 });

    it('validates and dispatches', async () => {
        updateStatus.mockResolvedValue(undefined);
        await expect(dispatchSyncItem(item({ action: 'status', bin_id: BIN, status: 'full', filled_at: null }), schemas)).resolves.toBe(true);
        expect(updateStatus).toHaveBeenCalled();
    });

    it('rejects a bad payload before touching the server', async () => {
        await expect(dispatchSyncItem(item({ action: 'status', bin_id: 'not-a-uuid', status: 'full' }), schemas)).rejects.toMatchObject({ name: 'ZodError' });
        await expect(dispatchSyncItem(item({ action: 'register', bin_id: BIN }), schemas)).rejects.toMatchObject({ name: 'ZodError' });
        await expect(dispatchSyncItem(item({ action: 'status', bin_id: BIN, status: 'in-progress' }), schemas)).rejects.toMatchObject({ name: 'ZodError' });
        expect(insert).not.toHaveBeenCalled();
        expect(updateStatus).not.toHaveBeenCalled();
    });
});
