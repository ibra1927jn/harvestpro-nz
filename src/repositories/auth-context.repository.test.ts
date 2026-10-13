/**
 * auth-context.repository — perfil con reintentos y cache offline (Dexie), huertos y registro.
 * (Fusionado con el antiguo authContext.repository.test.ts, que duplicaba este fichero.)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { db } from '@/services/db';
import { authContextRepository } from './auth-context.repository';

function mockChain(result: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain), eq: vi.fn(() => chain), in: vi.fn(() => chain),
        insert: vi.fn(() => chain), update: vi.fn(() => chain),
        limit: vi.fn(() => chain), maybeSingle: vi.fn(() => chain), order: vi.fn(() => chain),
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
            // Escritura async best-effort: se espera a que aparezca, sin depender de 10 ms fijos
            await vi.waitFor(async () => {
                const cached = await db.auth_cache.get('u1');
                expect(cached?.profile).toMatchObject({ id: 'u1' });
            });
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

describe('authContextRepository — offline cache fallback', () => {
    beforeEach(() => { vi.restoreAllMocks(); });

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

describe('authContextRepository.getAllOrchards', () => {
    beforeEach(() => { vi.restoreAllMocks(); });
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
