/**
 * setup.service.test.ts — alta de huerto nuevo con setup_orchard_atomic
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { supabase } from '../supabase';
import { createOrchardSetup, totalSetupRows } from '../setup.service';
import type { OrchardSetupData } from '../setup.service';

const data: OrchardSetupData = {
    orchard: { code: 'JP-01', name: 'JP Cherries', location: '' },
    season: { name: 'Season 2026–27', start_date: '2026-10-24', end_date: '' },
    blocks: [
        { name: ' Block A ', row_from: 1, row_to: 15, variety: 'Royal Gala', target_buckets: 90 },
        { name: 'Block B', row_from: 16, row_to: 20, variety: ' ', target_buckets: 100 },
    ],
    rates: { variety: 'Lapin', piece_rate: 2.5, start_time: '07:00' },
};

describe('createOrchardSetup', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('sends orchard, season and blocks in one RPC and returns what was created', async () => {
        const rpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({
            data: { id: 'o-1', code: 'JP-01', name: 'JP Cherries', season_id: 's-1', blocks: 2, rows: 20 },
            error: null,
        } as never);

        const result = await createOrchardSetup(data);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.data).toEqual({ id: 'o-1', code: 'JP-01', name: 'JP Cherries', seasonId: 's-1', blocks: 2, rows: 20 });
        const [fn, params] = rpc.mock.calls[0] as [string, Record<string, unknown>];
        expect(fn).toBe('setup_orchard_atomic');
        expect(params).toMatchObject({
            p_location: null,
            p_total_rows: 20,
            p_season_name: 'Season 2026–27',
            p_season_start: '2026-10-24',
            p_season_end: null,
            p_variety: 'Lapin',
            p_blocks: [
                { name: 'Block A', row_from: 1, row_to: 15, variety: 'Royal Gala', target_buckets: 90 },
                // Sin variedad propia: la principal del huerto
                { name: 'Block B', row_from: 16, row_to: 20, variety: 'Lapin', target_buckets: 100 },
            ],
        });
    });

    it('returns the DB error (no half-created orchard fallback any more)', async () => {
        vi.spyOn(supabase, 'rpc').mockResolvedValue({
            data: null,
            error: { code: '42883', message: 'function not found' },
        } as never);
        const from = vi.spyOn(supabase, 'from');

        const result = await createOrchardSetup(data);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('RPC_FAILED');
        expect(from).not.toHaveBeenCalled();
    });

    it('catches thrown errors', async () => {
        vi.spyOn(supabase, 'rpc').mockRejectedValue(new Error('Network down'));
        const result = await createOrchardSetup(data);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('SETUP_UNEXPECTED_ERROR');
    });
});

describe('totalSetupRows', () => {
    it('adds the rows of each block', () => {
        expect(totalSetupRows(data.blocks)).toBe(20);
        expect(totalSetupRows([{ row_from: 5, row_to: 4 }])).toBe(0);
    });
});
