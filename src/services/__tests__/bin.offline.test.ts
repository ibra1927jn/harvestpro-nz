/**
 * Bins del runner sin cobertura (auditoría 2026-10-23): marcar un bin lleno o
 * dar de alta uno nuevo sin red queda en la cola del móvil (IndexedDB) y no se
 * pierde. Antes iba directo a Supabase y sin red se perdía.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insert = vi.fn();
const updateStatus = vi.fn();
vi.mock('@/repositories/bin.repository', () => ({
    binRepository: {
        getByOrchard: vi.fn().mockResolvedValue([]),
        insert: (...a: unknown[]) => insert(...a),
        updateStatus: (...a: unknown[]) => updateStatus(...a),
    },
}));
vi.mock('@/utils/nzst', async importOriginal => ({
    ...(await importOriginal<typeof import('@/utils/nzst')>()),
    nowNZST: () => '2026-10-23T09:12:00+13:00',
}));

import { db } from '../db';
import { binService } from '../bin.service';

const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => v });

beforeEach(async () => {
    insert.mockReset();
    updateStatus.mockReset();
    await db.sync_queue.clear();
    setOnline(false);
});

describe('runner bins without signal', () => {
    it('a full bin is queued with the time it was filled', async () => {
        await binService.updateBinStatus('6b0f1a8e-3c4d-4e5f-8a9b-0c1d2e3f4a5b', 'full');
        const items = await db.sync_queue.toArray();
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            type: 'BIN',
            payload: { action: 'status', bin_id: '6b0f1a8e-3c4d-4e5f-8a9b-0c1d2e3f4a5b', status: 'full', filled_at: '2026-10-23T09:12:00+13:00' },
        });
        expect(updateStatus).not.toHaveBeenCalled();
    });

    it('a new bin gets its id on the phone and its register waits in the queue', async () => {
        const bin = await binService.registerBin('e1337e6a-54cc-431c-9c00-980e8ea270a4', 'BIN-042');
        expect(bin).toMatchObject({ status: 'in-progress', bin_code: 'BIN-042' });
        const [item] = await db.sync_queue.toArray();
        expect(item).toMatchObject({
            type: 'BIN',
            payload: { action: 'register', bin_id: bin.id, orchard_id: 'e1337e6a-54cc-431c-9c00-980e8ea270a4', bin_code: 'BIN-042', status: 'partial' },
        });
        expect(insert).not.toHaveBeenCalled();
    });
});
