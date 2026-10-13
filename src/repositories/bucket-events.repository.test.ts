/**
 * bucket-events.repository — thin wrapper: insertBatch / insertSingle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertMock = vi.fn();
const fromMock = vi.fn(() => ({ insert: insertMock }));

vi.mock('@/services/supabase', () => ({
    supabase: {
        from: (...args: unknown[]) => fromMock(...args),
    },
}));

import { bucketEventsRepository } from './bucket-events.repository';

describe('bucketEventsRepository', () => {
    beforeEach(() => {
        fromMock.mockClear();
        insertMock.mockReset();
    });

    it('insertBatch → from("bucket_events").insert(array)', async () => {
        insertMock.mockResolvedValue({ error: null });
        const rows = [{ id: '1' }, { id: '2' }];
        const res = await bucketEventsRepository.insertBatch(rows);
        expect(fromMock).toHaveBeenCalledWith('bucket_events');
        expect(insertMock).toHaveBeenCalledWith(rows);
        expect(res).toEqual({ error: null });
    });

    it('insertSingle → from("bucket_events").insert(row)', async () => {
        insertMock.mockResolvedValue({ error: null });
        const row = { id: 'x' };
        const res = await bucketEventsRepository.insertSingle(row);
        expect(insertMock).toHaveBeenCalledWith(row);
        expect(res).toEqual({ error: null });
    });

    it('propaga error sin lanzar', async () => {
        insertMock.mockResolvedValue({ error: { message: 'fk violation' } });
        const res = await bucketEventsRepository.insertBatch([{}]);
        expect(res.error).toMatchObject({ message: 'fk violation' });
    });

    it('insertBatch con [] respeta la semántica (llama insert con [])', async () => {
        insertMock.mockResolvedValue({ error: null });
        await bucketEventsRepository.insertBatch([]);
        expect(insertMock).toHaveBeenCalledWith([]);
    });
});

describe('bucketEventsRepository.insertSingle errors', () => {
    it('returns the error instead of throwing (merged from bucketEvents.repository.test.ts)', async () => {
        insertMock.mockResolvedValue({ error: { message: 'fail' } });
        const res = await bucketEventsRepository.insertSingle({ picker_id: 'p1' });
        expect(res.error).toMatchObject({ message: 'fail' });
    });
});
