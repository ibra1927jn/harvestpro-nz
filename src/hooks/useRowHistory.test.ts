import { describe, it, expect } from 'vitest';
import { groupByTeam } from './useRowHistory';
import type { RowVisit } from '@/types';

const v = (id: string, row: number, team: string | null, at: string, status: RowVisit['status'] = 'moved'): RowVisit => ({
    id, row_number: row, side: 'north', team_leader_id: team, status, assigned_at: at, ended_at: status === 'active' ? null : at,
});

describe('groupByTeam', () => {
    it('lists each team\'s rows in the order they went: 1 → 4 → 6 → now 10', () => {
        const teams = groupByTeam([
            v('d', 10, 'tl1', '2026-10-13T13:20:00+13:00', 'active'),
            v('a', 1, 'tl1', '2026-10-13T07:00:00+13:00'),
            v('x', 3, 'tl2', '2026-10-13T08:00:00+13:00'),
            v('c', 6, 'tl1', '2026-10-13T11:00:00+13:00'),
            v('b', 4, 'tl1', '2026-10-13T09:30:00+13:00'),
        ], id => (id === 'tl1' ? 'Ana' : 'Ben'));
        expect(teams.map(t => t.teamName)).toEqual(['Ana', 'Ben']);
        expect(teams[0].visits.map(x => x.row_number)).toEqual([1, 4, 6, 10]);
        expect(teams[0].visits.at(-1)?.status).toBe('active');
    });
});
