/**
 * structureLogic — rangos de filas, errores de la base y resúmenes
 */
import { describe, it, expect } from 'vitest';
import {
    cleanVariety, compactRanges, defaultSeasonId, nextFreeRow, parseRowRange, parseTarget, seasonYears,
    structureErrorView, varietySummary,
} from './structureLogic';
import type { SeasonRow } from '@/repositories/orchard-structure.repository';

describe('parseRowRange', () => {
    it('accepts «1 to 15» and a single row', () => {
        expect(parseRowRange('1', '15')).toEqual({ ok: true, from: 1, to: 15 });
        expect(parseRowRange(' 7 ', '')).toEqual({ ok: true, from: 7, to: 7 });
    });
    it.each([
        ['0', '3', 'ostruct.err.range'],
        ['a', '3', 'ostruct.err.range'],
        ['1.5', '3', 'ostruct.err.range'],
        ['1', '10000', 'ostruct.err.range'],
        ['9', '3', 'ostruct.err.range_order'],
        ['1', '1001', 'ostruct.err.range_size'],
    ])('rejects %s–%s', (from, to, key) => {
        expect(parseRowRange(from, to)).toEqual({ ok: false, errorKey: key });
    });
});

describe('parseTarget / cleanVariety', () => {
    it('empty = no change; whole numbers 0–10000', () => {
        expect(parseTarget('')).toEqual({ ok: true, value: null });
        expect(parseTarget('90')).toEqual({ ok: true, value: 90 });
        expect(parseTarget('-1')).toEqual({ ok: false });
        expect(parseTarget('2.5')).toEqual({ ok: false });
    });
    it('trims the variety; empty = none', () => {
        expect(cleanVariety('  Royal Gala ')).toBe('Royal Gala');
        expect(cleanVariety('   ')).toBeNull();
    });
});

describe('structureErrorView', () => {
    it('row taken by another block → which row and block', () => {
        expect(structureErrorView({ code: '23505', message: 'Row 12 is already in block Block B' }))
            .toEqual({ key: 'ostruct.err.row_taken', params: { row: 12, block: 'Block B' } });
    });
    it('known constraints and permissions', () => {
        expect(structureErrorView({ code: '23505', message: 'duplicate key value violates unique constraint "idx_unique_active_block"' }).key).toBe('ostruct.err.block_exists');
        expect(structureErrorView({ code: '23505', message: 'idx_one_active_season_per_orchard' }).key).toBe('ostruct.err.one_active');
        expect(structureErrorView({ code: '23505', message: 'The season already has blocks' }).key).toBe('ostruct.err.copy_not_empty');
        expect(structureErrorView({ code: '23514', message: 'violates check constraint "harvest_seasons_dates_order"' }).key).toBe('ostruct.err.dates');
        expect(structureErrorView({ code: '42501', message: 'new row violates row-level security policy' }).key).toBe('ostruct.err.not_allowed');
        expect(structureErrorView({ code: '22023', message: 'Invalid row range' }).key).toBe('ostruct.err.invalid');
        expect(structureErrorView(new TypeError('Failed to fetch')).key).toBe('ostruct.err.offline');
        expect(structureErrorView(new Error('boom'))).toEqual({ key: 'ostruct.err.generic', params: { error: 'boom' } });
    });
});

describe('summaries', () => {
    it('varieties, most frequent first, case-insensitive, none last', () => {
        const rows = [{ variety: 'Gala' }, { variety: 'gala' }, { variety: null }, { variety: 'Fuji' }, { variety: 'Gala' }];
        expect(varietySummary(rows)).toEqual([
            { variety: 'Gala', count: 3 },
            { variety: 'Fuji', count: 1 },
            { variety: null, count: 1 },
        ]);
    });
    it('compact ranges', () => {
        expect(compactRanges([3, 1, 2, 7, 8, 10])).toBe('1–3, 7–8, 10');
        expect(compactRanges([])).toBe('');
    });
    it('next free row after the rows (or the block totals)', () => {
        expect(nextFreeRow([], [])).toBe(1);
        expect(nextFreeRow([], [{ row_number: 4 }, { row_number: 15 }])).toBe(16);
        expect(nextFreeRow([{ start_row: 16, total_rows: 12 }], [])).toBe(28);
    });
});

describe('seasons', () => {
    const s = (id: string, status: SeasonRow['status']): SeasonRow => ({ id, orchard_id: 'o', name: id, start_date: '2026-01-01', end_date: null, status });
    it('opens the active season, else the most recent', () => {
        expect(defaultSeasonId([s('a', 'closed'), s('b', 'active')])).toBe('b');
        expect(defaultSeasonId([s('a', 'planning'), s('b', 'closed')])).toBe('a');
        expect(defaultSeasonId([])).toBeNull();
    });
    it('NZ harvest season years', () => {
        expect(seasonYears('2026-10-24')).toBe('2026–27');
        expect(seasonYears('2027-02-10')).toBe('2026–27');
        expect(seasonYears('2099-07-01')).toBe('2099–00');
    });
});
