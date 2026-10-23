/**
 * orchard-structure.repository — llamadas a la base de temporadas, bloques y filas
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { orchardStructureRepository as repo, StructureError } from './orchard-structure.repository';

function mockChain(result: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'update', 'insert', 'is', 'order', 'gte', 'lte', 'range', 'single']) {
        chain[m] = vi.fn(() => chain);
    }
    chain.then = (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) => Promise.resolve(result).then(onF, onR);
    return chain;
}

beforeEach(() => vi.restoreAllMocks());

describe('orchardStructureRepository', () => {
    it('creates seasons as planned (activation is a separate step)', async () => {
        const chain = mockChain({ data: { id: 's1' }, error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await repo.createSeason({ orchardId: 'o1', name: ' 2026–27 ', startDate: '2026-10-01', endDate: null });
        expect(chain.insert).toHaveBeenCalledWith({ orchard_id: 'o1', name: '2026–27', start_date: '2026-10-01', end_date: null, status: 'planning' });
    });

    it('uses the database functions for activate, close, copy and batch rows', async () => {
        const rpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: 15, error: null } as never);
        await repo.activateSeason('s1');
        await repo.closeSeason('s1', '2027-04-30');
        expect(await repo.copySeasonStructure('s0', 's1')).toBe(15);
        expect(await repo.addRows('b1', 1, 15, 'Royal Gala', null)).toBe(15);
        expect(rpc.mock.calls).toEqual([
            ['activate_harvest_season', { p_season_id: 's1' }],
            ['close_harvest_season', { p_season_id: 's1', p_end_date: '2027-04-30' }],
            ['copy_season_structure', { p_from_season: 's0', p_to_season: 's1' }],
            ['add_block_rows', { p_block_id: 'b1', p_from: 1, p_to: 15, p_variety: 'Royal Gala', p_target: null }],
        ]);
    });

    it('updates a range of live rows of the block and returns how many changed', async () => {
        const chain = mockChain({ data: [{ id: 'r1' }, { id: 'r2' }], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        expect(await repo.updateRowsRange('b1', 1, 15, { variety: 'Royal Gala' })).toBe(2);
        expect(chain.update).toHaveBeenCalledWith({ variety: 'Royal Gala' });
        expect(chain.eq).toHaveBeenCalledWith('block_id', 'b1');
        expect(chain.gte).toHaveBeenCalledWith('row_number', 1);
        expect(chain.lte).toHaveBeenCalledWith('row_number', 15);
        expect(chain.is).toHaveBeenCalledWith('deleted_at', null);
    });

    it('archives instead of deleting', async () => {
        const chain = mockChain({ data: null, error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await repo.archiveBlock('b1');
        await repo.archiveRow('r1');
        const calls = (chain.update as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls).toHaveLength(2);
        for (const [patch] of calls) expect(typeof (patch as { deleted_at: string }).deleted_at).toBe('string');
    });

    it('lists rows page by page in a stable order, sorted by row number', async () => {
        const chain = mockChain({ data: [{ id: 'b', row_number: 2 }, { id: 'a', row_number: 1 }], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        const rows = await repo.listRows(['b1']);
        expect(rows.map(r => r.row_number)).toEqual([1, 2]);
        expect(chain.order).toHaveBeenCalledWith('id');
        expect(chain.range).toHaveBeenCalledWith(0, 999);
    });

    it('throws the database error with its code', async () => {
        vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: { message: 'Row 3 is already in block A', code: '23505' } } as never);
        const err = await repo.addRows('b1', 1, 5, null, null).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(StructureError);
        expect((err as StructureError).code).toBe('23505');
    });
});
