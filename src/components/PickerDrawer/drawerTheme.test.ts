import { describe, it, expect } from 'vitest';
import { drawerRoleOf, drawerTheme, statusLabelKey } from './drawerTheme';

describe('drawerTheme', () => {
    it('team leaders and runners get their own colours and label', () => {
        expect(drawerTheme('team_leader')).toMatchObject({ roleColor: '#4f46e5', roleLabelKey: 'panel.role.team_leader' });
        expect(drawerTheme('runner')).toMatchObject({ roleColor: '#d97706', roleLabelKey: 'panel.role.runner' });
    });

    it('any other role (or none) is shown as a picker', () => {
        for (const r of ['picker', 'manager', '', null, undefined]) {
            expect(drawerRoleOf(r)).toBe('picker');
            expect(drawerTheme(r).roleLabelKey).toBe('panel.role.picker');
        }
    });

    it('status label: active, on break, anything else is away', () => {
        expect(statusLabelKey('active')).toBe('panel.status.active');
        expect(statusLabelKey('on_break')).toBe('panel.status.break');
        expect(statusLabelKey('inactive')).toBe('panel.status.away');
        expect(statusLabelKey('archived')).toBe('panel.status.away');
    });
});
