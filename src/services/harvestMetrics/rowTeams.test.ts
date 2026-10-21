/**
 * rowTeams — qué equipo está en cada fila (mapa y «Filas activas» del team leader)
 */
import { describe, it, expect } from 'vitest';
import { rowTeamHighlight, selectTeamRowAssignments, teamLeadersOnRow } from './rowTeams';

const crew = [
    { id: 'tl1', name: 'Maria', role: 'team_leader', team_leader_id: undefined },
    { id: 'tl2', name: 'Hemi', role: 'team_leader', team_leader_id: undefined },
    { id: 'p1', name: 'Ana', role: 'picker', team_leader_id: 'tl1' },
    { id: 'p2', name: 'Bea', role: 'picker', team_leader_id: 'tl1' },
    { id: 'p3', name: 'Carl', role: 'picker', team_leader_id: 'tl2' },
    { id: 'p4', name: 'Dan', role: 'picker', team_leader_id: undefined },
];
const byId = (id: string) => crew.find(p => p.id === id)!;

const assignments = [
    { id: 'a1', row_number: 3, side: 'north' as const, assigned_pickers: ['p1', 'p2'], completion_percentage: 0, team_leader_id: 'tl1' },
    { id: 'a2', row_number: 7, side: 'south' as const, assigned_pickers: ['p3'], completion_percentage: 0, team_leader_id: null },
    // Reconstruida en el móvil: sin team_leader_id, el equipo se deduce de los pickers
    { id: 'rebuilt-9-p2', row_number: 9, side: 'north' as const, assigned_pickers: ['p2'], completion_percentage: 0 },
    { id: 'a4', row_number: 11, side: 'north' as const, assigned_pickers: ['p4'], completion_percentage: 0, team_leader_id: null },
];

describe('teamLeadersOnRow', () => {
    it('collects the team leaders from the pickers on the row and from the assignments', () => {
        expect(teamLeadersOnRow(3, [byId('p1')], assignments, crew)).toEqual(new Set(['tl1']));
        expect(teamLeadersOnRow(7, [], assignments, crew)).toEqual(new Set(['tl2']));
        // Team leader presente en la fila cuenta como su propio equipo
        expect(teamLeadersOnRow(5, [byId('tl2'), byId('p1')], assignments, crew)).toEqual(new Set(['tl2', 'tl1']));
    });

    it('ignores people without a team', () => {
        expect(teamLeadersOnRow(11, [byId('p4')], assignments, crew).size).toBe(0);
    });
});

describe('rowTeamHighlight', () => {
    it("marks my team's rows as mine (even if another team shares the row)", () => {
        expect(rowTeamHighlight('tl1', 3, [byId('p1')], assignments, crew)).toEqual({ kind: 'mine' });
        expect(rowTeamHighlight('tl1', 5, [byId('p1'), byId('p3')], assignments, crew)).toEqual({ kind: 'mine' });
    });

    it("marks other teams' rows with their team leader's name", () => {
        expect(rowTeamHighlight('tl1', 7, [byId('p3')], assignments, crew)).toEqual({ kind: 'other', leaderNames: ['Hemi'] });
    });

    it('uses the assignment when nobody is on the row yet (rebuilt rows included)', () => {
        expect(rowTeamHighlight('tl2', 9, [], assignments, crew)).toEqual({ kind: 'other', leaderNames: ['Maria'] });
        expect(rowTeamHighlight('tl1', 9, [], assignments, crew)).toEqual({ kind: 'mine' });
    });

    it('returns null for empty rows and rows of people without a team', () => {
        expect(rowTeamHighlight('tl1', 20, [], assignments, crew)).toBeNull();
        expect(rowTeamHighlight('tl1', 11, [byId('p4')], assignments, crew)).toBeNull();
    });
});

describe('selectTeamRowAssignments', () => {
    it("keeps only my team's assignments (by team_leader_id or by its pickers)", () => {
        expect(selectTeamRowAssignments(assignments, crew, 'tl1').map(a => a.id)).toEqual(['a1', 'rebuilt-9-p2']);
        expect(selectTeamRowAssignments(assignments, crew, 'tl2').map(a => a.id)).toEqual(['a2']);
    });

    it('includes a row assigned to the team leader himself', () => {
        const withLeader = [...assignments, { id: 'a5', row_number: 12, side: 'north' as const, assigned_pickers: ['tl2'], completion_percentage: 0 }];
        expect(selectTeamRowAssignments(withLeader, crew, 'tl2').map(a => a.id)).toEqual(['a2', 'a5']);
    });

    it('returns nothing without a team leader id', () => {
        expect(selectTeamRowAssignments(assignments, crew, undefined)).toEqual([]);
    });
});
