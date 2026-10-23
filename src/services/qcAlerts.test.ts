import { describe, it, expect } from 'vitest';
import {
    badCriteriaOf, buildQcAlerts, canViewWellbeing, countUnseen, hasWellbeingFlag, isQcAlert,
    mergeInspections, receivesQcAlerts, scopeInspections, worstCriterionOf,
} from './qcAlerts';

const crew = [
    { id: 'p1', name: 'Aroha', team_leader_id: 'tl1' },
    { id: 'p2', name: 'Rua', team_leader_id: 'tl2' },
    { id: 'p3', name: 'Sione', team_leader_id: null },
];
const insp = (id: string, picker_id: string, grade: string, criteria: unknown = null, created_at = `2026-10-23T0${id.length}:00:00Z`) =>
    ({ id, picker_id, grade, criteria, created_at });

describe('qcAlerts', () => {
    it('alerts on reject or any bad criterion, not on warn', () => {
        expect(isQcAlert(insp('a', 'p1', 'reject'))).toBe(true);
        expect(isQcAlert(insp('a', 'p1', 'C', { size: 'bad' }))).toBe(true);
        expect(isQcAlert(insp('a', 'p1', 'B', { size: 'warn' }))).toBe(false);
        expect(isQcAlert(insp('a', 'p1', 'A', null))).toBe(false);
    });

    it('lists bad criteria in screen order and finds the worst one', () => {
        const i = insp('a', 'p1', 'reject', { size: 'bad', ladder: 'bad', bucket_fill: 'warn', nonsense: 'bad' });
        expect(badCriteriaOf(i)).toEqual(['ladder', 'size']);
        expect(worstCriterionOf(i)).toEqual({ key: 'ladder', state: 'bad' });
        expect(worstCriterionOf(insp('b', 'p1', 'B', { bucket_fill: 'warn' }))).toEqual({ key: 'bucket_fill', state: 'warn' });
        expect(worstCriterionOf(insp('c', 'p1', 'A', { size: 'ok' }))).toBeNull();
    });

    it('scopes: manager sees the orchard, team leader only his team, others nothing', () => {
        const all = [insp('a', 'p1', 'reject'), insp('b', 'p2', 'reject'), insp('c', 'p3', 'reject')];
        expect(scopeInspections({ inspections: all, crew, role: 'manager', userId: 'm' })).toHaveLength(3);
        expect(scopeInspections({ inspections: all, crew, role: 'team_leader', userId: 'tl1' }).map(i => i.id)).toEqual(['a']);
        expect(scopeInspections({ inspections: all, crew, role: 'runner', userId: 'r' })).toEqual([]);
        expect(scopeInspections({ inspections: all, crew, role: 'team_leader', userId: undefined })).toEqual([]);
    });

    it('builds alerts with picker name, grade and failed criteria, newest first', () => {
        const alerts = buildQcAlerts({
            inspections: [
                insp('a', 'p1', 'C', { size: 'bad' }, '2026-10-23T01:00:00Z'),
                insp('b', 'p1', 'A', null, '2026-10-23T02:00:00Z'),
                insp('c', 'p1', 'reject', null, '2026-10-23T03:00:00Z'),
                insp('d', 'p2', 'reject', null, '2026-10-23T04:00:00Z'),
            ],
            crew, role: 'team_leader', userId: 'tl1',
        });
        expect(alerts.map(a => a.id)).toEqual(['c', 'a']);
        expect(alerts[1]).toMatchObject({ pickerId: 'p1', pickerName: 'Aroha', grade: 'C', badCriteria: ['size'] });
    });

    it('merges live and fetched inspections without duplicates', () => {
        const merged = mergeInspections(
            [insp('a', 'p1', 'A', null, '2026-10-23T05:00:00Z')],
            [insp('a', 'p1', 'B', null, '2026-10-23T05:00:00Z'), insp('b', 'p1', 'A', null, '2026-10-23T06:00:00Z')],
        );
        expect(merged.map(i => `${i.id}${i.grade}`)).toEqual(['bA', 'aA']);
    });

    it('counts unseen and gates roles', () => {
        expect(countUnseen([{ id: 'a' }, { id: 'b' }], new Set(['a']))).toBe(1);
        expect(receivesQcAlerts('team_leader')).toBe(true);
        expect(receivesQcAlerts('qc_inspector')).toBe(false);
        expect(canViewWellbeing('team_leader')).toBe(true);
        expect(canViewWellbeing('runner')).toBe(false);
        expect(hasWellbeingFlag({ informed: false, comfortable: null })).toBe(true);
        expect(hasWellbeingFlag({ informed: null, comfortable: null })).toBe(false);
    });
});
