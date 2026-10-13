/**
 * AuthContext Repository Tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { db } from '@/services/db';
import { authContextRepository } from '@/repositories/auth-context.repository';

function mockChain(result: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain), eq: vi.fn(() => chain), in: vi.fn(() => chain),
        insert: vi.fn(() => chain), update: vi.fn(() => chain),
        limit: vi.fn(() => chain), maybeSingle: vi.fn(() => chain),
        single: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) =>
            Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

describe('authContextRepository', () => {
    let fromSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        vi.restoreAllMocks();
        fromSpy = vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: null }) as never);
        // Limpiar auth_cache antes de cada test para evitar contaminación
        await db.auth_cache.clear();
    });

    afterEach(async () => {
        await db.auth_cache.clear();
    });

    describe('getUserProfile', () => {
        it('returns user data on success', async () => {
            const user = { id: 'u1', full_name: 'John' };
            fromSpy.mockReturnValue(mockChain({ data: user, error: null }) as never);
            const result = await authContextRepository.getUserProfile('u1');
            expect(result).toEqual({ data: user, error: null });
        });

        it('retries on retriable errors', async () => {
            // First call returns 504, second returns data
            let callCount = 0;
            fromSpy.mockImplementation(() => {
                callCount++;
                if (callCount <= 1) {
                    return mockChain({ data: null, error: { message: '504 gateway timeout' } }) as never;
                }
                return mockChain({ data: { id: 'u1' }, error: null }) as never;
            });
            const result = await authContextRepository.getUserProfile('u1');
            expect(result.data).toEqual({ id: 'u1' });
        });

        it('retries on PGRST003 (connection pool timeout)', async () => {
            let callCount = 0;
            fromSpy.mockImplementation(() => {
                callCount++;
                if (callCount <= 1) {
                    return mockChain({ data: null, error: { code: 'PGRST003', message: 'statement timeout' } }) as never;
                }
                return mockChain({ data: { id: 'u1' }, error: null }) as never;
            });
            const result = await authContextRepository.getUserProfile('u1');
            expect(result.data).toEqual({ id: 'u1' });
        });

        it('returns error on non-retriable failure', async () => {
            fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'permission denied' } }) as never);
            const result = await authContextRepository.getUserProfile('u1');
            expect(result.error).toBeTruthy();
        });

        it('caches profile on successful fetch', async () => {
            const user = { id: 'u1', full_name: 'Jane', orchard_id: 'o1' };
            fromSpy.mockReturnValue(mockChain({ data: user, error: null }) as never);
            await authContextRepository.getUserProfile('u1');
            // Esperar escritura async best-effort
            await new Promise(r => setTimeout(r, 10));
            const cached = await db.auth_cache.get('u1');
            expect(cached).toBeDefined();
            expect(cached?.profile).toMatchObject({ id: 'u1' });
        });

        it('returns cached profile when all Supabase retries fail with 504', async () => {
            // Pre-seed cache con perfil válido
            await db.auth_cache.put({
                id: 'u1',
                profile: { id: 'u1', full_name: 'Cached Jane', role: 'runner', orchard_id: 'o1' },
                orchard_id: 'o1',
                cached_at: Date.now(),
            });
            // Supabase siempre devuelve 504
            fromSpy.mockReturnValue(mockChain({ data: null, error: { message: '504 gateway timeout' } }) as never);
            const result = await authContextRepository.getUserProfile('u1');
            expect(result.data).toMatchObject({ full_name: 'Cached Jane' });
            expect(result.error).toBeNull();
        });

        it('does NOT use cached profile for non-retriable errors', async () => {
            // Pre-seed cache
            await db.auth_cache.put({
                id: 'u1',
                profile: { id: 'u1', full_name: 'Cached Jane', role: 'runner', orchard_id: 'o1' },
                orchard_id: 'o1',
                cached_at: Date.now(),
            });
            // Error no retriable (permission denied)
            fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'permission denied' } }) as never);
            const result = await authContextRepository.getUserProfile('u1');
            // Cache no debe usarse — es un error permanente, no transitorio
            expect(result.error).toBeTruthy();
            expect(result.data).toBeNull();
        });

        it('ignores cache if TTL expired (>7 days)', async () => {
            const EIGHT_DAYS_AGO = Date.now() - 8 * 24 * 60 * 60 * 1000;
            await db.auth_cache.put({
                id: 'u1',
                profile: { id: 'u1', full_name: 'Stale Jane', role: 'runner', orchard_id: 'o1' },
                orchard_id: 'o1',
                cached_at: EIGHT_DAYS_AGO,
            });
            fromSpy.mockReturnValue(mockChain({ data: null, error: { message: '504 gateway timeout' } }) as never);
            const result = await authContextRepository.getUserProfile('u1');
            // Cache expirado — no debe usarse
            expect(result.data).toBeNull();
            expect(result.error).toBeTruthy();
        });
    });

    describe('getFirstOrchardId', () => {
        it('returns orchard id', async () => {
            fromSpy.mockReturnValue(mockChain({ data: { id: 'orch-1' }, error: null }) as never);
            const result = await authContextRepository.getFirstOrchardId();
            expect(result).toBe('orch-1');
        });

        it('returns null when no orchards', async () => {
            const result = await authContextRepository.getFirstOrchardId();
            expect(result).toBeNull();
        });
    });

    describe('assignOrchard', () => {
        it('calls update on users table', async () => {
            await authContextRepository.assignOrchard('u1', 'orch-1');
            expect(fromSpy).toHaveBeenCalledWith('users');
        });
    });

    describe('checkWhitelist', () => {
        it('returns whitelist entry', async () => {
            const entry = { id: 'reg-1', role: 'picker', orchard_id: 'o1', used_at: null };
            vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: [entry], error: null } as never);
            const result = await authContextRepository.checkWhitelist('Test@Email.com');
            expect(result.data).toEqual(entry);
        });

        it('returns null when not whitelisted', async () => {
            vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: [], error: null } as never);
            const result = await authContextRepository.checkWhitelist('unknown@test.com');
            expect(result.data).toBeNull();
        });
    });

    describe('insertUser', () => {
        it('inserts record into users table', async () => {
            await authContextRepository.insertUser({ id: 'u1', full_name: 'Test' });
            expect(fromSpy).toHaveBeenCalledWith('users');
        });
    });

    describe('markRegistrationUsed', () => {
        it('updates allowed_registrations table', async () => {
            await authContextRepository.markRegistrationUsed('reg-1');
            expect(fromSpy).toHaveBeenCalledWith('allowed_registrations');
        });
    });
});
