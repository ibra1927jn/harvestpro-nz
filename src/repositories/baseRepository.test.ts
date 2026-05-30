/**
 * BaseRepository Tests — using vi.spyOn on the real supabase import
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { SupabaseRepository } from './baseRepository';

interface TestEntity extends Record<string, unknown> {
    id: string;
    name: string;
    is_active: boolean;
}

/** Helper: create a chainable object that resolves to the given result */
function mockChain(result: { data?: unknown; error?: unknown; count?: number | null }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        single: vi.fn(() => chain),
        maybeSingle: vi.fn(() => chain),
        insert: vi.fn(() => chain),
        update: vi.fn(() => chain),
        delete: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        gt: vi.fn(() => chain),
        is: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) =>
            Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

describe('SupabaseRepository', () => {
    let repo: SupabaseRepository<TestEntity>;
    let fromSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        repo = new SupabaseRepository<TestEntity>('test_table');
        // Default: empty success result
        fromSpy = vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: [], error: null }) as never);
    });

    describe('findAll', () => {
        it('returns data', async () => {
            fromSpy.mockReturnValue(mockChain({ data: [{ id: '1', name: 'A', is_active: true }], error: null }) as never);
            const result = await repo.findAll();
            expect(fromSpy).toHaveBeenCalledWith('test_table');
            expect(result.data).toEqual([{ id: '1', name: 'A', is_active: true }]);
            expect(result.error).toBeNull();
        });

        it('returns empty array on null data', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
            const result = await repo.findAll();
            expect(result.data).toEqual([]);
        });

        it('returns error on failure', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'DB error' } }) as never);
            const result = await repo.findAll();
            expect(result.data).toEqual([]);
            expect(result.error).toBe('DB error');
        });

        it('catches exceptions', async () => {
            fromSpy.mockImplementation(() => { throw new Error('Network'); });
            const result = await repo.findAll();
            expect(result.error).toBe('Network');
        });

        it('applies filters without error', async () => {
            const result = await repo.findAll({ name: 'Test' });
            expect(fromSpy).toHaveBeenCalledWith('test_table');
            expect(result.error).toBeNull();
        });
    });

    describe('findById', () => {
        it('returns single record', async () => {
            fromSpy.mockReturnValue(mockChain({ data: { id: '1', name: 'A', is_active: true }, error: null }) as never);
            const result = await repo.findById('1');
            expect(result.data).toEqual({ id: '1', name: 'A', is_active: true });
        });

        it('returns null on error', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'Not found' } }) as never);
            const result = await repo.findById('999');
            expect(result.data).toBeNull();
            expect(result.error).toBe('Not found');
        });

        it('catches exceptions', async () => {
            fromSpy.mockImplementation(() => { throw new Error('Crash'); });
            const result = await repo.findById('1');
            expect(result.error).toBe('Crash');
        });
    });

    describe('create', () => {
        it('inserts and returns record', async () => {
            fromSpy.mockReturnValue(mockChain({ data: { id: 'new', name: 'New', is_active: true }, error: null }) as never);
            const result = await repo.create({ name: 'New' } as Partial<TestEntity>);
            expect(result.data).toEqual({ id: 'new', name: 'New', is_active: true });
        });

        it('returns error on failure', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'Duplicate' } }) as never);
            const result = await repo.create({ name: 'Dup' } as Partial<TestEntity>);
            expect(result.error).toBe('Duplicate');
        });
    });

    describe('update', () => {
        it('updates and returns record', async () => {
            fromSpy.mockReturnValue(mockChain({ data: { id: '1', name: 'Updated', is_active: true }, error: null }) as never);
            const result = await repo.update('1', { name: 'Updated' });
            expect(result.data?.name).toBe('Updated');
        });

        it('returns error on failure', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'Update error' } }) as never);
            const result = await repo.update('1', { name: 'X' });
            expect(result.error).toBe('Update error');
        });
    });

    describe('delete', () => {
        // delete() was previously soft-delete by default via an
        // `{ is_active: false } as unknown as Partial<T>` double-cast
        // that compiled even for tables without `is_active`. It now
        // always hard-deletes; callers that want soft semantics use
        // `softDelete()` which is constrained to SoftDeletable rows.
        it('hard-deletes by id', async () => {
            fromSpy.mockReturnValue(mockChain({ error: null }) as never);
            const result = await repo.delete('1');
            expect(result.error).toBeNull();
        });

        it('returns error on failure', async () => {
            fromSpy.mockReturnValue(mockChain({ error: { message: 'Delete error' } }) as never);
            const result = await repo.delete('1');
            expect(result.error).toBe('Delete error');
        });

        it('catches exceptions', async () => {
            fromSpy.mockImplementation(() => { throw new Error('Boom'); });
            const result = await repo.delete('1');
            expect(result.error).toBe('Boom');
        });
    });

    describe('softDelete', () => {
        it('updates is_active=false for soft-deletable rows', async () => {
            fromSpy.mockReturnValue(mockChain({ error: null }) as never);
            // TestRow has is_active, so the call compiles.
            const result = await repo.softDelete('1');
            expect(result.error).toBeNull();
        });

        it('returns error on failure', async () => {
            fromSpy.mockReturnValue(mockChain({ error: { message: 'Soft delete error' } }) as never);
            const result = await repo.softDelete('1');
            expect(result.error).toBe('Soft delete error');
        });
    });

    describe('count', () => {
        it('returns count value', async () => {
            fromSpy.mockReturnValue(mockChain({ count: 42, error: null }) as never);
            const result = await repo.count();
            expect(result).toBe(42);
        });

        it('returns 0 on error', async () => {
            fromSpy.mockReturnValue(mockChain({ count: null, error: { message: 'err' } }) as never);
            const result = await repo.count();
            expect(result).toBe(0);
        });

        it('catches exceptions', async () => {
            fromSpy.mockImplementation(() => { throw new Error('Boom'); });
            const result = await repo.count();
            expect(result).toBe(0);
        });
    });

    describe('pre-built instances', () => {
        it('exports named repositories', async () => {
            const mod = await import('./baseRepository');
            expect(mod.userRepository).toBeDefined();
            expect(mod.contractRepository).toBeDefined();
        });
    });
});
