/**
 * bin.repository — tests de la query chain Supabase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Thenable<T> = T & { then?: never };

// Chain helper: each step returns `this` so we can assert both the
// intermediate arguments and the final shape without real supabase.
function makeBuilder<T>(terminal: Thenable<{ data: T | null; error: unknown | null }>) {
    const calls: { method: string; args: unknown[] }[] = [];
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'is', 'single']) {
        chain[method] = vi.fn((...args: unknown[]) => {
            calls.push({ method, args });
            return chain;
        });
    }
    // Final await resolves to terminal
    chain.then = (resolve: (v: unknown) => void) => Promise.resolve(terminal).then(resolve);
    return { chain, calls };
}

const fromMock = vi.fn();

vi.mock('@/services/supabase', () => ({
    supabase: {
        from: (...args: unknown[]) => fromMock(...args),
    },
}));

import { binRepository } from './bin.repository';

describe('binRepository.getByOrchard', () => {
    beforeEach(() => {
        fromMock.mockReset();
    });

    it('hits from("bins"), select + eq orchard_id, returns data', async () => {
        const { chain, calls } = makeBuilder({ data: [{ id: 'b1' }], error: null });
        fromMock.mockReturnValue(chain);

        const result = await binRepository.getByOrchard('orchard-xyz');
        expect(fromMock).toHaveBeenCalledWith('bins');
        expect(calls.find((c) => c.method === 'select')?.args[0]).toBe('id, bin_code, status, variety, filled_at, deleted_at');
        expect(calls.find((c) => c.method === 'eq')?.args).toEqual(['orchard_id', 'orchard-xyz']);
        expect(result).toEqual([{ id: 'b1' }]);
    });

    it('returns [] when data is null', async () => {
        const { chain } = makeBuilder({ data: null, error: null });
        fromMock.mockReturnValue(chain);
        expect(await binRepository.getByOrchard('o1')).toEqual([]);
    });

    it('throws when error is present', async () => {
        const { chain } = makeBuilder({ data: null, error: new Error('boom') });
        fromMock.mockReturnValue(chain);
        await expect(binRepository.getByOrchard('o1')).rejects.toThrow('boom');
    });
});

describe('binRepository.updateStatus', () => {
    beforeEach(() => {
        fromMock.mockReset();
    });

    it('update + eq id, resuelve undefined cuando no hay error', async () => {
        const { chain, calls } = makeBuilder({ data: null, error: null });
        fromMock.mockReturnValue(chain);

        await binRepository.updateStatus('b1', 'full', '2026-04-18T09:00:00Z');
        const update = calls.find((c) => c.method === 'update');
        expect(update?.args[0]).toEqual({ status: 'full', filled_at: '2026-04-18T09:00:00Z' });
        expect(calls.find((c) => c.method === 'eq')?.args).toEqual(['id', 'b1']);
    });

    it('throws cuando supabase devuelve error', async () => {
        const { chain } = makeBuilder({ data: null, error: new Error('rls') });
        fromMock.mockReturnValue(chain);
        await expect(binRepository.updateStatus('b1', 'empty', null)).rejects.toThrow('rls');
    });
});
