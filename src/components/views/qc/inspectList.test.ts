/**
 * inspectList — orden de la lista de Calidad y siguiente en Turbo
 */
import { describe, it, expect } from 'vitest';
import type { Picker } from '@/types';
import { matchesInspectQuery, nextForInspection, orderForInspection } from './inspectList';

const p = (id: string, name: string, extra: Partial<Picker> = {}): Picker => ({
    id, name, picker_id: `PK-${id}`, avatar: '', current_row: 1, total_buckets_today: 0, hours: 0,
    status: 'active', safety_verified: true, qcStatus: [], role: 'picker', checked_in_today: true, ...extra,
});

describe('orderForInspection', () => {
    it('drops team leaders, runners and archived people', () => {
        const crew = [
            p('tl', 'Lead', { role: 'team_leader' }),
            p('r', 'Runner', { role: 'runner' }),
            p('br', 'Bucket runner', { role: 'bucket_runner' }),
            p('x', 'Gone', { status: 'archived' }),
            p('a', 'Picker'),
            p('b', 'Legacy no role', { role: undefined }),
        ];
        expect(orderForInspection(crew, new Set()).map(e => e.picker.id).sort()).toEqual(['a', 'b']);
    });

    it('puts present pickers first, then row ascending (no row last), then name', () => {
        const crew = [
            p('d', 'Dee', { current_row: 0 }),
            p('c', 'Cat', { current_row: 5, checked_in_today: false }),
            p('b', 'Bea', { current_row: 5 }),
            p('a', 'Abe', { current_row: 5 }),
            p('e', 'Eve', { current_row: 2, check_in: '2026-10-21T08:00:00Z', checked_in_today: undefined }),
            p('f', 'Fay', { current_row: 1, check_in: '2026-10-21T08:00:00Z', check_out: '2026-10-21T12:00:00Z' }),
        ];
        const out = orderForInspection(crew, new Set(['b']));
        expect(out.map(e => e.picker.id)).toEqual(['e', 'a', 'b', 'd', 'f', 'c']);
        expect(out.map(e => e.present)).toEqual([true, true, true, true, false, false]);
        expect(out.find(e => e.picker.id === 'b')?.inspected).toBe(true);
        expect(out.find(e => e.picker.id === 'a')?.inspected).toBe(false);
    });
});

describe('matchesInspectQuery', () => {
    it('matches name or sticker id, case-insensitive; empty query matches all', () => {
        const picker = p('77', 'María López');
        expect(matchesInspectQuery(picker, 'lóp')).toBe(true);
        expect(matchesInspectQuery(picker, 'pk-77')).toBe(true);
        expect(matchesInspectQuery(picker, '  ')).toBe(true);
        expect(matchesInspectQuery(picker, 'juan')).toBe(false);
    });
});

describe('nextForInspection', () => {
    const list = orderForInspection([p('a', 'A'), p('b', 'B'), p('c', 'C')], new Set(['b']));

    it('skips pickers already inspected today and wraps around', () => {
        expect(nextForInspection(list, 'a')?.id).toBe('c');
        expect(nextForInspection(list, 'c')?.id).toBe('a');
    });

    it('falls back to the next one when everyone is inspected', () => {
        const all = orderForInspection([p('a', 'A'), p('b', 'B')], new Set(['a', 'b']));
        expect(nextForInspection(all, 'a')?.id).toBe('b');
    });

    it('returns null when there is nobody else', () => {
        expect(nextForInspection(orderForInspection([p('a', 'A')], new Set()), 'a')).toBeNull();
        expect(nextForInspection([], 'a')).toBeNull();
    });

    it('starts from the top when the current picker is not in the list', () => {
        expect(nextForInspection(list, 'zzz')?.id).toBe('a');
    });
});
