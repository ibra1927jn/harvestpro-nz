import { describe, it, expect } from 'vitest';
import { countUnreadBroadcasts, isUnreadBroadcast, rolesForAudiences, toggleAudience } from './broadcastAudience';
import { buildBroadcast } from '@/hooks/useMessagingActions';

describe('broadcastAudience', () => {
    it('everyone = no target roles (RLS: visible to every role of the orchard)', () => {
        expect(rolesForAudiences(['all'])).toEqual([]);
        expect(rolesForAudiences([])).toEqual([]);
        expect(buildBroadcast('m', 'o', 't', 'c', 'normal').target_roles).toEqual([]);
    });

    it('maps groups to roles, office included', () => {
        expect(rolesForAudiences(['qc', 'office']).sort()).toEqual(['hr_admin', 'logistics', 'payroll_admin', 'qc_inspector']);
        expect(rolesForAudiences(['team_leaders', 'runners'])).toEqual(['team_leader', 'runner']);
    });

    it('toggling: "everyone" is exclusive, empty falls back to everyone', () => {
        expect(toggleAudience(['all'], 'qc')).toEqual(['qc']);
        expect(toggleAudience(['qc'], 'runners')).toEqual(['qc', 'runners']);
        expect(toggleAudience(['qc'], 'qc')).toEqual(['all']);
        expect(toggleAudience(['qc', 'runners'], 'all')).toEqual(['all']);
    });

    it('counts unread broadcasts (not mine, not acknowledged by me)', () => {
        const list = [
            { sender_id: 'm', acknowledged_by: [] },
            { sender_id: 'm', acknowledged_by: ['me'] },
            { sender_id: 'me', acknowledged_by: [] },
        ];
        expect(countUnreadBroadcasts(list, 'me')).toBe(1);
        expect(isUnreadBroadcast(list[0], undefined)).toBe(false);
        expect(countUnreadBroadcasts(undefined, 'me')).toBe(0);
    });
});
