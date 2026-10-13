/**
 * picker-crud.repository — CRUD + filter queries sobre pickers table.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { pickerCrudRepository } from './picker-crud.repository';

function mockChain(result: { data?: unknown; error?: unknown; count?: number | null }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain),
        insert: vi.fn(() => chain),
        update: vi.fn(() => chain),
        delete: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        neq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        or: vi.fn(() => chain),
        match: vi.fn(() => chain),
        single: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) =>
            Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

beforeEach(() => vi.restoreAllMocks());

describe('pickerCrudRepository.query', () => {
    it('con tl+orchard usa OR', async () => {
        const chain = mockChain({ data: [], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await pickerCrudRepository.query('tl1', 'o1');
        expect((chain.or as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
            expect.stringContaining('team_leader_id.eq.tl1'),
        );
    });

    it('con solo tl usa eq team_leader_id', async () => {
        const chain = mockChain({ data: [], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await pickerCrudRepository.query('tl1');
        expect((chain.eq as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('team_leader_id', 'tl1');
    });

    it('con solo orchard usa eq orchard_id', async () => {
        const chain = mockChain({ data: [], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await pickerCrudRepository.query(undefined, 'o1');
        expect((chain.eq as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('orchard_id', 'o1');
    });

    it('sin filtros devuelve todos', async () => {
        const chain = mockChain({ data: [{ id: 'p1' }], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        const result = await pickerCrudRepository.query();
        expect(result).toHaveLength(1);
    });

    it('throws on error', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: { message: 'rls' } }) as never);
        await expect(pickerCrudRepository.query('tl1')).rejects.toBeTruthy();
    });
});

describe('pickerCrudRepository.getTotalCount', () => {
    it('devuelve count', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ count: 42 }) as never);
        expect(await pickerCrudRepository.getTotalCount()).toBe(42);
    });
});

describe('pickerCrudRepository.bulkUpdateRow', () => {
    it('no-op cuando array vacío', async () => {
        const fromSpy = vi.spyOn(supabase, 'from');
        await pickerCrudRepository.bulkUpdateRow([], 5);
        expect(fromSpy).not.toHaveBeenCalled();
    });

    it('update + in clause cuando hay ids', async () => {
        const chain = mockChain({ data: null, error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await pickerCrudRepository.bulkUpdateRow(['p1', 'p2'], 10);
        expect((chain.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ current_row: 10 });
        expect((chain.in as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('id', ['p1', 'p2']);
    });

    it('throws on error', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: { message: 'fail' } }) as never);
        await expect(pickerCrudRepository.bulkUpdateRow(['p1'], 5)).rejects.toBeTruthy();
    });
});

describe('pickerCrudRepository.insert', () => {
    it('devuelve row inserted', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: { id: 'p1' }, error: null }) as never);
        const res = await pickerCrudRepository.insert({ name: 'X' });
        expect((res as { id: string })?.id).toBe('p1');
    });

    it('throws on error', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: { message: 'dup' } }) as never);
        await expect(pickerCrudRepository.insert({})).rejects.toBeTruthy();
    });
});

describe('pickerCrudRepository.updateById', () => {
    it('match con id', async () => {
        const chain = mockChain({ data: null, error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await pickerCrudRepository.updateById('p1', { name: 'Y' });
        expect((chain.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ name: 'Y' });
        expect((chain.match as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ id: 'p1' });
    });

    it('throws cuando error', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: { message: 'e' } }) as never);
        await expect(pickerCrudRepository.updateById('p1', {})).rejects.toBeTruthy();
    });
});

describe('pickerCrudRepository.deleteById', () => {
    it('delete + match', async () => {
        const chain = mockChain({ data: null, error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await pickerCrudRepository.deleteById('p1');
        expect((chain.delete as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
        expect((chain.match as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ id: 'p1' });
    });
});

describe('pickerCrudRepository.findDuplicate', () => {
    it('eq picker_id + active + neq id', async () => {
        const chain = mockChain({ data: { id: 'dup' }, error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        const result = await pickerCrudRepository.findDuplicate('P001', 'p-self');
        expect(result).toEqual({ id: 'dup' });
    });

    it('devuelve null cuando no hay dup', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: null }) as never);
        expect(await pickerCrudRepository.findDuplicate('P001', 'p-self')).toBeNull();
    });
});

describe('pickerCrudRepository.insertBatch', () => {
    it('inserta array y devuelve ids', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: [{ id: 'p1' }, { id: 'p2' }], error: null }) as never);
        const result = await pickerCrudRepository.insertBatch([{}, {}]);
        expect(result).toHaveLength(2);
    });

    it('throws on error', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: { message: 'dup' } }) as never);
        await expect(pickerCrudRepository.insertBatch([{}])).rejects.toBeTruthy();
    });
});

describe('pickerCrudRepository — merged from pickerCrud.repository.test.ts', () => {
    it('deleteById throws on error', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: { message: 'fk' } }) as never);
        await expect(pickerCrudRepository.deleteById('p1')).rejects.toBeTruthy();
    });

    it('insertSingle returns the insert error instead of throwing', async () => {
        const chain = mockChain({ data: null, error: { message: 'dup key' } });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        const res = await pickerCrudRepository.insertSingle({ name: 'Test' });
        expect(res).toEqual({ error: { message: 'dup key' } });
        expect((chain.insert as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ name: 'Test' });
    });

    it('insertSingle resolves with error null on success', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: [{ id: 'p1' }], error: null }) as never);
        expect(await pickerCrudRepository.insertSingle({ name: 'Test' })).toEqual({ error: null });
    });
});
