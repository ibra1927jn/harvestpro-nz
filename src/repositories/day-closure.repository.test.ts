import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { dayClosureRepository } from './day-closure.repository';

function mockChain(result: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain), upsert: vi.fn(() => chain), eq: vi.fn(() => chain), is: vi.fn(() => chain),
        maybeSingle: vi.fn(() => chain), single: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) => Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

beforeEach(() => vi.restoreAllMocks());

describe('dayClosureRepository', () => {
    it('reads the closure of one orchard and day', async () => {
        const chain = mockChain({ data: { id: 'c1', status: 'closed' }, error: null });
        const from = vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        const row = await dayClosureRepository.getForDate('o1', '2026-10-23');
        expect(from).toHaveBeenCalledWith('day_closures');
        expect(chain.eq).toHaveBeenCalledWith('orchard_id', 'o1');
        expect(chain.eq).toHaveBeenCalledWith('date', '2026-10-23');
        expect(row?.status).toBe('closed');
    });

    it('returns null without a row and throws on error', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: null }) as never);
        expect(await dayClosureRepository.getForDate('o1', '2026-10-23')).toBeNull();
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: null, error: { message: 'x' } }) as never);
        await expect(dayClosureRepository.getForDate('o1', '2026-10-23')).rejects.toBeTruthy();
    });

    it('closes with an upsert on (orchard, day): a reopened day closes again', async () => {
        const chain = mockChain({ data: { id: 'c1', status: 'closed' }, error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await dayClosureRepository.close('o1', '2026-10-23', 'u1', { total_buckets: 1, total_cost: 2, total_hours: 3, wage_violations: 0 });
        const [payload, opts] = (chain.upsert as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(payload).toMatchObject({ orchard_id: 'o1', date: '2026-10-23', status: 'closed', closed_by: 'u1', total_buckets: 1 });
        expect(opts).toEqual({ onConflict: 'orchard_id,date' });
    });
});
