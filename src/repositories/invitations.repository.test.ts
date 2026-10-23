/**
 * invitations.repository — allowed_registrations (B1): alta, reenviar, anular.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { invitationsRepository } from './invitations.repository';

function mockChain(result: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain), insert: vi.fn(() => chain), update: vi.fn(() => chain), delete: vi.fn(() => chain),
        eq: vi.fn(() => chain), is: vi.fn(() => chain), order: vi.fn(() => chain), range: vi.fn(() => chain),
        single: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) => Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

beforeEach(() => vi.restoreAllMocks());

describe('invitationsRepository', () => {
    it('lists every invitation paged with a stable order, newest first', async () => {
        const chain = mockChain({ data: [{ id: 'a', created_at: '2026-10-01' }, { id: 'b', created_at: '2026-10-20' }], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        const out = await invitationsRepository.list();
        expect(chain.order).toHaveBeenCalledWith('id');
        expect(chain.range).toHaveBeenCalledWith(0, 999);
        expect(out.map(r => r.id)).toEqual(['b', 'a']);
    });

    it('creates an invitation with a lower-case email and a 14-day expiry', async () => {
        const chain = mockChain({ data: { id: 'n1', email: 'x@y.nz' }, error: null });
        const from = vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await invitationsRepository.create({ email: ' X@Y.NZ ', role: 'runner', orchardId: 'o1', fullName: '  Ana ' });
        expect(from).toHaveBeenCalledWith('allowed_registrations');
        const payload = (chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
        expect(payload).toMatchObject({ email: 'x@y.nz', assigned_role: 'runner', orchard_id: 'o1', full_name: 'Ana' });
        const days = (new Date(payload.expires_at as string).getTime() - Date.now()) / 86_400_000;
        expect(days).toBeGreaterThan(13.9);
        expect(days).toBeLessThan(14.1);
    });

    it('surfaces the database error when the invitation is refused', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: { code: '42501', message: 'Not allowed' } }) as never);
        await expect(invitationsRepository.create({ email: 'a@b.nz', role: 'admin', orchardId: null })).rejects.toMatchObject({ code: '42501' });
    });

    it('resend extends only unused invitations and fails when nothing changed', async () => {
        const chain = mockChain({ data: [{ id: 'i1' }], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await invitationsRepository.resend('i1');
        expect(chain.is).toHaveBeenCalledWith('used_at', null);
        expect((chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0]).toHaveProperty('resent_at');
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: [], error: null }) as never);
        await expect(invitationsRepository.resend('i1')).rejects.toThrow(/not found/);
    });

    it('revoke deletes an unused invitation and fails when the database refuses', async () => {
        const chain = mockChain({ data: [{ id: 'i1' }], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await invitationsRepository.revoke('i1');
        expect(chain.delete).toHaveBeenCalled();
        expect(chain.eq).toHaveBeenCalledWith('id', 'i1');
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: [], error: null }) as never);
        await expect(invitationsRepository.revoke('i1')).rejects.toThrow();
    });
});
