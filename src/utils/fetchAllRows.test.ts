import { describe, it, expect, vi } from 'vitest';
import { fetchAllRows } from './fetchAllRows';

describe('fetchAllRows', () => {
    it('pide páginas hasta que una viene incompleta', async () => {
        const all = Array.from({ length: 2312 }, (_, i) => i);
        const page = vi.fn(async (from: number, to: number) => ({ data: all.slice(from, to + 1), error: null }));
        const rows = await fetchAllRows(page);
        expect(rows).toHaveLength(2312);
        expect(page).toHaveBeenCalledTimes(3);
        expect(page).toHaveBeenNthCalledWith(2, 1000, 1999);
    });

    it('con un múltiplo exacto hace una petición vacía final', async () => {
        const all = Array.from({ length: 2000 }, (_, i) => i);
        const rows = await fetchAllRows(async (f, t) => ({ data: all.slice(f, t + 1), error: null }));
        expect(rows).toHaveLength(2000);
    });

    it('propaga el error', async () => {
        await expect(fetchAllRows(async () => ({ data: null, error: new Error('boom') }))).rejects.toThrow('boom');
    });
});
