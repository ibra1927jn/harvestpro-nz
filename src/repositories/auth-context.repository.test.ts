/**
 * auth-context.repository — user profile + registration queries con retry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { authContextRepository } from './auth-context.repository';
import { db } from '@/services/db';

function mockChain(result: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain),
        insert: vi.fn(() => chain),
        update: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        maybeSingle: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) =>
            Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('authContextRepository.getUserProfile', () => {
    it('devuelve user data en primer intento cuando OK', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(
            mockChain({ data: { id: 'u1', role: 'manager' }, error: null }) as never,
        );
        const authCacheSpy = vi.spyOn(db.auth_cache, 'put').mockImplementation(async () => 'u1');
        const res = await authContextRepository.getUserProfile('u1');
        expect(res.data).toMatchObject({ id: 'u1' });
        expect(res.error).toBeNull();
        expect(authCacheSpy).toHaveBeenCalled();
    });

    it('devuelve error directo cuando error NO es transitorio (e.g. rls)', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(
            mockChain({ data: null, error: { code: '42501', message: 'rls denied' } }) as never,
        );
        const res = await authContextRepository.getUserProfile('u1');
        expect(res.data).toBeNull();
        expect(res.error).toMatchObject({ code: '42501' });
    });

    it('devuelve cache dexie cuando todos los retries fallan con 504', async () => {
        // Repo siempre 504 — retry logic kicks
        vi.spyOn(supabase, 'from').mockReturnValue(
            mockChain({ data: null, error: { message: '504 gateway timeout' } }) as never,
        );
        // Cache dexie tiene profile
        vi.spyOn(db.auth_cache, 'get').mockResolvedValue({
            id: 'u1',
            profile: { id: 'u1', role: 'manager', cached: true },
            orchard_id: 'o1',
            cached_at: Date.now() - 1000, // 1 sec ago, within 7-day TTL
        } as never);

        const res = await authContextRepository.getUserProfile('u1');
        expect(res.data).toMatchObject({ cached: true });
        expect(res.error).toBeNull();
    }, 10_000);

    it('devuelve error original cuando cache también falla', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(
            mockChain({ data: null, error: { message: '504 gateway timeout' } }) as never,
        );
        vi.spyOn(db.auth_cache, 'get').mockResolvedValue(undefined);

        const res = await authContextRepository.getUserProfile('u1');
        expect(res.data).toBeNull();
        expect(res.error).toBeTruthy();
    }, 10_000);
});

describe('authContextRepository.getFirstOrchardId', () => {
    it('devuelve id cuando data presente', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: { id: 'o1' }, error: null }) as never);
        expect(await authContextRepository.getFirstOrchardId()).toBe('o1');
    });

    it('null cuando data null', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: null }) as never);
        expect(await authContextRepository.getFirstOrchardId()).toBeNull();
    });
});

describe('authContextRepository.getAllOrchards', () => {
    it('[] cuando error (swallow)', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(
            mockChain({ data: null, error: { message: 'x' } }) as never,
        );
        expect(await authContextRepository.getAllOrchards()).toEqual([]);
    });

    it('devuelve array cuando OK', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(
            mockChain({ data: [{ id: 'o1', name: 'A', total_rows: 10 }], error: null }) as never,
        );
        const res = await authContextRepository.getAllOrchards();
        expect(res).toHaveLength(1);
    });
});

describe('authContextRepository.getOrchardById', () => {
    it('devuelve orchard', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(
            mockChain({ data: { id: 'o1', name: 'A', total_rows: 10 }, error: null }) as never,
        );
        const res = await authContextRepository.getOrchardById('o1');
        expect(res).toMatchObject({ id: 'o1' });
    });
});

describe('authContextRepository.assignOrchard', () => {
    it('update users.orchard_id sin return value', async () => {
        const chain = mockChain({ data: null, error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await authContextRepository.assignOrchard('u1', 'o1');
        expect((chain.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ orchard_id: 'o1' });
    });
});

describe('authContextRepository.checkWhitelist', () => {
    it('lowercase + trim email antes de lookup', async () => {
        const rpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: [], error: null } as never);
        const result = await authContextRepository.checkWhitelist('  USER@EXAMPLE.COM  ');
        expect(rpc).toHaveBeenCalledWith('check_registration', { p_email: 'user@example.com' });
        expect(result.data).toBeNull();
    });
});

describe('authContextRepository.insertUser / markRegistrationUsed', () => {
    it('insertUser → from users.insert', async () => {
        const chain = mockChain({ data: null, error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await authContextRepository.insertUser({ id: 'u1', email: 'x@y.nz' });
        expect((chain.insert as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ id: 'u1', email: 'x@y.nz' });
    });

    it('markRegistrationUsed → update con used_at timestamp', async () => {
        const chain = mockChain({ data: null, error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await authContextRepository.markRegistrationUsed('reg1');
        const updateCall = (chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
        expect(updateCall.used_at).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });
});
