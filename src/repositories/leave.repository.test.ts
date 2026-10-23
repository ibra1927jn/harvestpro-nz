/**
 * leave.repository — consultas de leave_requests (paginadas, orden estable).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { leaveRepository } from './leave.repository';

function mockChain(result: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain), insert: vi.fn(() => chain), update: vi.fn(() => chain),
        eq: vi.fn(() => chain), is: vi.fn(() => chain), lte: vi.fn(() => chain), gte: vi.fn(() => chain),
        order: vi.fn(() => chain), range: vi.fn(() => chain), single: vi.fn(() => chain), maybeSingle: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) => Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

beforeEach(() => vi.restoreAllMocks());

describe('leaveRepository.listInRange', () => {
    it('reads leaves overlapping the range, paged with a stable order', async () => {
        const chain = mockChain({ data: [{ id: 'l1' }], error: null });
        const from = vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        const out = await leaveRepository.listInRange('2026-10-01', '2026-10-31');
        expect(from).toHaveBeenCalledWith('leave_requests');
        expect(out).toEqual([{ id: 'l1' }]);
        expect(chain.is).toHaveBeenCalledWith('deleted_at', null);
        expect(chain.lte).toHaveBeenCalledWith('start_date', '2026-10-31');
        expect(chain.gte).toHaveBeenCalledWith('end_date', '2026-10-01');
        expect(chain.order).toHaveBeenCalledWith('id');
        expect(chain.range).toHaveBeenCalledWith(0, 999);
        expect(chain.eq).not.toHaveBeenCalled();
    });

    it('filters by orchard when given, and keeps paging past 1000 rows', async () => {
        const page = Array.from({ length: 1000 }, (_, i) => ({ id: `l${i}` }));
        const chain1 = mockChain({ data: page, error: null });
        const chain2 = mockChain({ data: [{ id: 'last' }], error: null });
        vi.spyOn(supabase, 'from').mockReturnValueOnce(chain1 as never).mockReturnValueOnce(chain2 as never);
        const out = await leaveRepository.listInRange('2026-10-01', '2026-10-31', 'o1');
        expect(out).toHaveLength(1001);
        expect(chain1.eq).toHaveBeenCalledWith('orchard_id', 'o1');
        expect(chain2.range).toHaveBeenCalledWith(1000, 1999);
    });

    it('throws on error', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: { message: 'rls' } }) as never);
        await expect(leaveRepository.listInRange('2026-10-01', '2026-10-31')).rejects.toBeTruthy();
    });
});

describe('leaveRepository.listByPerson', () => {
    it('reads the person history, most recent first', async () => {
        const chain = mockChain({ data: [], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await leaveRepository.listByPerson('p1');
        expect(chain.eq).toHaveBeenCalledWith('picker_id', 'p1');
        expect(chain.order).toHaveBeenCalledWith('start_date', { ascending: false });
    });
});

describe('leaveRepository.insert / setStatus', () => {
    it('insert returns the created row and throws on error', async () => {
        const chain = mockChain({ data: { id: 'l1', status: 'requested' }, error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        const row = { orchard_id: 'o1', picker_id: 'p1', type: 'annual' as const, start_date: '2026-10-20', end_date: '2026-10-20', half_day: false, reason: null, requested_by: null, status: 'requested' as const };
        expect(await leaveRepository.insert(row)).toEqual({ id: 'l1', status: 'requested' });
        expect(chain.insert).toHaveBeenCalledWith([row]);

        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: { message: 'denied' } }) as never);
        await expect(leaveRepository.insert(row)).rejects.toBeTruthy();
    });

    it('setStatus updates by id and complains when no row comes back (RLS)', async () => {
        const chain = mockChain({ data: { id: 'l1', status: 'approved' }, error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        const updates = { status: 'approved' as const, decided_by: 'u1', decided_at: '2026-10-22T00:00:00Z', decision_note: null };
        expect(await leaveRepository.setStatus('l1', updates)).toEqual({ id: 'l1', status: 'approved' });
        expect(chain.update).toHaveBeenCalledWith(updates);
        expect(chain.eq).toHaveBeenCalledWith('id', 'l1');

        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: null }) as never);
        await expect(leaveRepository.setStatus('l1', updates)).rejects.toThrow(/not found or not allowed/);
    });
});
