import { describe, it, expect } from 'vitest';
import en from '@/i18n/locales/en';
import es from '@/i18n/locales/es';

const TEAMS_KEYS = [
    'teams.header',
    'teams.active_runners',
    'teams.harvest_teams',
    'teams.team_leader',
    'teams.members',
    'teams.team_buckets',
    'teams.import_csv',
    'teams.link_staff',
    'teams.view_profile',
    'teams.leaders_one',
    'teams.leaders_other',
    'teams.active_one',
    'teams.active_other',
    'teams.team_leader_role',
    'teams.no_team_members',
    'teams.no_harvest_teams',
    'teams.no_runners_assigned',
];

describe('Teams i18n — all keys present in EN', () => {
    TEAMS_KEYS.forEach(key => {
        it(`EN has key: ${key}`, () => {
            expect(en[key]).toBeDefined();
        });
    });
});

describe('Teams i18n — ES translations exist', () => {
    TEAMS_KEYS.forEach(key => {
        it(`ES has key: ${key}`, () => {
            expect(es[key]).toBeDefined();
        });
    });
});
