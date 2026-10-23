/**
 * User Repository Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { userRepository2 } from './user.repository';

function mockChain(result: { data?: unknown; error?: unknown; count?: number }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain), eq: vi.fn(() => chain), is: vi.fn(() => chain), in: vi.fn(() => chain),
        order: vi.fn(() => chain), range: vi.fn(() => chain), limit: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) =>
            Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

describe('userRepository2', () => {
    let fromSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        fromSpy = vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: [], error: null }) as never);
    });

    describe('getAll', () => {
        it('returns users', async () => {
            const users = [{ id: '1', full_name: 'Alice' }];
            fromSpy.mockReturnValue(mockChain({ data: users, error: null }) as never);
            const result = await userRepository2.getAll();
            expect(result).toEqual(users);
            expect(fromSpy).toHaveBeenCalledWith('users');
        });

        it('filters by orchardId when provided', async () => {
            const result = await userRepository2.getAll('orch-1');
            expect(result).toEqual([]);
        });

        it('throws on error', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'fail' } }) as never);
            await expect(userRepository2.getAll()).rejects.toBeTruthy();
        });

        it('returns empty array on null data', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
            const result = await userRepository2.getAll();
            expect(result).toEqual([]);
        });
    });

    describe('getActiveCount', () => {
        it('counts the active staff in the single people list (pickers), not app accounts', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: null, count: 26 }) as never);
            const count = await userRepository2.getActiveCount();
            expect(fromSpy).toHaveBeenCalledWith('pickers');
            expect(count).toBe(26);
        });

        it('returns 0 when no data', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: null }) as never);
            const count = await userRepository2.getActiveCount();
            expect(count).toBe(0);
        });
    });

    describe('getNamesByIds', () => {
        it('returns empty object for empty ids', async () => {
            const result = await userRepository2.getNamesByIds([]);
            expect(result).toEqual({});
        });

        it('returns id-to-name map', async () => {
            fromSpy.mockReturnValue(mockChain({
                data: [{ id: '1', full_name: 'Alice' }, { id: '2', full_name: null }],
                error: null,
            }) as never);
            const result = await userRepository2.getNamesByIds(['1', '2']);
            expect(result).toEqual({ '1': 'Alice', '2': 'Unknown' });
        });
    });
});
