/**
 * orchard-map.repository — thin wrapper sobre supabase para harvest_seasons,
 * orchard_blocks y block_rows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { orchardMapRepository } from './orchard-map.repository';

function mockChain(result: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        update: vi.fn(() => chain),
        is: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) =>
            Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

let fromSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    vi.restoreAllMocks();
    fromSpy = vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: [], error: null }) as never);
});

describe('orchardMapRepository.getActiveSeason', () => {
    it('devuelve {data, error}', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 's1', status: 'active' }], error: null }) as never);
        const res = await orchardMapRepository.getActiveSeason('o1');
        expect(fromSpy).toHaveBeenCalledWith('harvest_seasons');
        expect(res.data).toEqual([{ id: 's1', status: 'active' }]);
    });

    it('propaga error sin lanzar', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'rls' } }) as never);
        const res = await orchardMapRepository.getActiveSeason('o1');
        expect(res.error).toMatchObject({ message: 'rls' });
    });
});

describe('orchardMapRepository.getBlocks', () => {
    it('hits orchard_blocks', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [], error: null }) as never);
        const res = await orchardMapRepository.getBlocks('o1', 's1');
        expect(fromSpy).toHaveBeenCalledWith('orchard_blocks');
        expect(res.data).toEqual([]);
    });

    it('devuelve data con estructura de bloques', async () => {
        fromSpy.mockReturnValue(
            mockChain({
                data: [
                    { id: 'b1', name: 'North', total_rows: 20, start_row: 1, color_code: '#ff0', status: 'active' },
                ],
                error: null,
            }) as never,
        );
        const res = await orchardMapRepository.getBlocks('o1', 's1');
        expect((res.data as Array<{ name: string }>)[0].name).toBe('North');
    });
});

describe('orchardMapRepository.getBlockRows', () => {
    it('hits block_rows con array de ids', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'r1', row_number: 1 }], error: null }) as never);
        const res = await orchardMapRepository.getBlockRows(['b1', 'b2']);
        expect(fromSpy).toHaveBeenCalledWith('block_rows');
        expect(res.data).toHaveLength(1);
    });

    it('acepta [] sin romper', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [], error: null }) as never);
        const res = await orchardMapRepository.getBlockRows([]);
        expect(res.error).toBeNull();
    });
});

describe('orchardMapRepository.setBlockVariety', () => {
    it('sets one variety on every live row of the block and returns how many changed', async () => {
        const chain = mockChain({ data: [{ id: 'r1' }, { id: 'r2' }], error: null });
        fromSpy.mockReturnValue(chain as never);
        expect(await orchardMapRepository.setBlockVariety('b1', ' Royal Gala ')).toBe(2);
        expect(fromSpy).toHaveBeenCalledWith('block_rows');
        expect(chain.update).toHaveBeenCalledWith({ variety: 'Royal Gala' });
        expect(chain.eq).toHaveBeenCalledWith('block_id', 'b1');
        expect(chain.is).toHaveBeenCalledWith('deleted_at', null);
    });

    it('throws when the database refuses', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'rls' } }) as never);
        await expect(orchardMapRepository.setBlockVariety('b1', 'Fuji')).rejects.toBeTruthy();
    });
});
