/**
 * Una sola definición de "quién es quién" para todas las pantallas.
 */
import { describe, it, expect } from 'vitest';
import {
    selectStaff, selectPickers, selectTeamLeaders, selectRunners, selectPresentToday,
    selectPresentPickers, selectTeamOf, selectUnassigned, findTeamLeader, isPresentToday,
} from './roster';

type P = { id: string; role?: string; status?: string; team_leader_id?: string; check_in?: string; check_out?: string; checked_in_today?: boolean };
const crew: P[] = [
    { id: 'tl1', role: 'team_leader', status: 'active', check_in: 'x' },
    { id: 'tl2', role: 'team_leader', status: 'active' },
    { id: 'r1', role: 'runner', status: 'active', check_in: 'x' },
    { id: 'r2', role: 'bucket_runner', status: 'active' },
    { id: 'a', role: 'picker', status: 'active', team_leader_id: 'tl1', check_in: 'x' },
    { id: 'b', role: 'picker', status: 'active', team_leader_id: 'tl1', check_in: 'x', check_out: 'y' },
    { id: 'c', role: 'picker', status: 'active', team_leader_id: 'tl2' },
    { id: 'd', role: 'picker', status: 'active' },                          // sin team leader
    { id: 'e', role: 'picker', status: 'active', team_leader_id: 'gone' },  // team leader que ya no está
    { id: 'z', role: 'picker', status: 'archived', team_leader_id: 'tl1', check_in: 'x' }, // baja
];
const ids = (l: P[]) => l.map(p => p.id).sort();

describe('roster: una sola regla para todas las pantallas', () => {
    it('plantilla = todos menos las bajas', () => {
        expect(ids(selectStaff(crew as never))).toEqual(['a', 'b', 'c', 'd', 'e', 'r1', 'r2', 'tl1', 'tl2']);
    });

    it('pickers, team leaders y runners (runner y bucket_runner son lo mismo)', () => {
        expect(ids(selectPickers(crew as never))).toEqual(['a', 'b', 'c', 'd', 'e']);
        expect(ids(selectTeamLeaders(crew as never))).toEqual(['tl1', 'tl2']);
        expect(ids(selectRunners(crew as never))).toEqual(['r1', 'r2']);
    });

    it('presente hoy = ha fichado y no ha fichado la salida', () => {
        expect(ids(selectPresentToday(crew as never))).toEqual(['a', 'r1', 'tl1']);
        expect(ids(selectPresentPickers(crew as never))).toEqual(['a']);
        expect(isPresentToday({ id: 'q', role: 'picker', status: 'active', team_leader_id: undefined, checked_in_today: true })).toBe(true);
    });

    it('equipo de un team leader: sus pickers en plantilla, sin él mismo ni bajas', () => {
        expect(ids(selectTeamOf(crew as never, 'tl1'))).toEqual(['a', 'b']);
        expect(selectTeamOf(crew as never, undefined)).toEqual([]);
    });

    it('sin team leader: sin asignar o con un team leader que ya no está', () => {
        expect(ids(selectUnassigned(crew as never))).toEqual(['d', 'e']);
    });

    it('encuentra el team leader de una persona', () => {
        expect(findTeamLeader(crew as never, { team_leader_id: 'tl2' })?.id).toBe('tl2');
        expect(findTeamLeader(crew as never, { team_leader_id: 'gone' })).toBeUndefined();
    });
});
