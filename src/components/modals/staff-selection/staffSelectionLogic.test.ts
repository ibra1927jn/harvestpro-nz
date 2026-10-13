import { describe, it, expect } from 'vitest';
import {
    batchAssignToast, countRole, emptyStaffMessage, filterStaff, initials,
    mergeStaff, selectableIds, toggleId,
} from './staffSelectionLogic';

const staff = mergeStaff(
    [{ id: 'l1', full_name: 'Aroha Ngata', orchard_id: 'o1' }, { id: 'l2', full_name: 'Ben Lee' }],
    [{ id: 'r1', full_name: 'Carla Ngata', orchard_id: 'o2' }],
);

describe('staffSelectionLogic', () => {
    it('mergeStaff asigna el rol y tolera listas nulas', () => {
        expect(staff.map(s => [s.id, s.role])).toEqual([['l1', 'team_leader'], ['l2', 'team_leader'], ['r1', 'runner']]);
        expect(mergeStaff(null, undefined)).toEqual([]);
    });

    it('filterStaff combina rol y búsqueda (sin mayúsculas, con espacios)', () => {
        expect(filterStaff(staff, 'all', '  ngata ').map(s => s.id)).toEqual(['l1', 'r1']);
        expect(filterStaff(staff, 'runner', 'ngata').map(s => s.id)).toEqual(['r1']);
        expect(filterStaff(staff, 'team_leader', '').map(s => s.id)).toEqual(['l1', 'l2']);
    });

    it('selectableIds excluye a quien ya está en el huerto', () => {
        expect([...selectableIds(staff, 'o1')]).toEqual(['l2', 'r1']);
    });

    it('toggleId no muta el set original', () => {
        const a = new Set(['x']);
        expect([...toggleId(a, 'y')]).toEqual(['x', 'y']);
        expect([...toggleId(a, 'x')]).toEqual([]);
        expect([...a]).toEqual(['x']);
    });

    it('batchAssignToast: aviso si alguno falla, plural correcto si no', () => {
        expect(batchAssignToast(2, 1)).toEqual({ message: 'Linked 2 staff. 1 failed.', type: 'warning' });
        expect(batchAssignToast(1, 0).message).toBe('Successfully linked 1 staff member.');
        expect(batchAssignToast(3, 0).message).toBe('Successfully linked 3 staff members.');
    });

    it('emptyStaffMessage según búsqueda y filtro', () => {
        expect(emptyStaffMessage('zz', 'runner')).toBe('No results for "zz"');
        expect(emptyStaffMessage('', 'all')).toBe('No staff found in the system.');
        expect(emptyStaffMessage('', 'team_leader')).toBe('No Team Leaders found.');
        expect(emptyStaffMessage('', 'runner')).toBe('No Runners found.');
    });

    it('initials y countRole', () => {
        expect(initials('aroha')).toBe('AR');
        expect(initials('')).toBe('??');
        expect(countRole(staff, 'team_leader')).toBe(2);
    });
});
