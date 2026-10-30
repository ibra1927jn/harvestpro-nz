/**
 * english-smell.dashboard.test.ts
 * Verifica que los strings del Dashboard tengan traducción ES
 */
import { describe, it, expect } from 'vitest';
import en from '@/i18n/locales/en';
import es from '@/i18n/locales/es';

const DASHBOARD_CANONICAL_STRINGS = [
    'dashboard.title',
    'dashboard.live_monitoring',
    'dashboard.velocity',
    'dashboard.production',
    'dashboard.est_cost',
    'dashboard.active_crew',
    'dashboard.buckets',
    'dashboard.pickers',
    'dashboard.daily_target',
    'dashboard.complete',
    'dashboard.export',
    'dashboard.live_map',
    'dashboard.kpi.bins_per_hour',
    'dashboard.kpi.nzd',
    'dashboard.wage_bleeding',
    'dashboard.wage.subtitle',
    'dashboard.wage.compliant',
    'dashboard.wage.lost_today',
    'dashboard.wage.trend_title',
    'dashboard.wage.critical',
    'dashboard.wage.all_safe',
    'dashboard.perf.top_today',
    'dashboard.perf.below_avg',
    'dashboard.perf.view_teams',
    'dashboard.trust.rls',
    'dashboard.trust.records',
    'dashboard.trust.alerts',
    'dashboard.trust.compliant',
    'dashboard.predictions.title',
    'dashboard.predictions.stable',
    'dashboard.predictions.improving',
    'dashboard.predictions.declining',
    'dashboard.velocity.drilldown_title',
    'dashboard.velocity.drilldown_picker',
    'dashboard.velocity.drilldown_bins',
    'dashboard.velocity.drilldown_trend',
    'dashboard.velocity.tap_for_details',
    'dashboard.velocity.tap_bar_details',
    'dashboard.team_leaders.title',
    'dashboard.team_leaders.picker_count',
    'dashboard.team_leaders.empty',
    'dashboard.team_leaders.manage',
];

describe('Dashboard i18n — all keys present in EN', () => {
    DASHBOARD_CANONICAL_STRINGS.forEach(key => {
        it(`EN has key: ${key}`, () => {
            expect(en[key]).toBeDefined();
            expect(en[key]).not.toBe('');
        });
    });
});

describe('Dashboard i18n — ES differs from EN (is translated)', () => {
    DASHBOARD_CANONICAL_STRINGS.forEach(key => {
        it(`ES has different value for: ${key}`, () => {
            expect(es[key]).toBeDefined();
            // ES value should differ from EN (unless it's a proper noun like NZD)
            if (!['dashboard.kpi.nzd', 'dashboard.eta'].includes(key)) {
                expect(es[key]).not.toBe(en[key]);
            }
        });
    });
});
