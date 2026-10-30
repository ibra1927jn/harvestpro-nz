/**
 * english-smell.logistics.test.ts
 * Verifica que los strings del panel de logística tengan traducción ES
 * y que ninguna clave devuelva su propio nombre (falta de traducción).
 */
import { describe, it, expect } from 'vitest';
import en from '@/i18n/locales/en';
import es from '@/i18n/locales/es';

const LOGISTICS_KEYS = [
    // Health banner
    'logistics.health.headline.green',
    'logistics.health.headline.amber',
    'logistics.health.headline.red',
    'logistics.health.status.green',
    'logistics.health.status.amber',
    'logistics.health.status.red',
    // Backlog chart
    'logistics.backlog.title',
    'logistics.backlog.subtitle',
    'logistics.backlog.y_axis',
    'logistics.backlog.empty',
    // SLA card
    'logistics.sla.title',
    'logistics.sla.vs_week',
    'logistics.sla.no_data',
    'logistics.sla.cycle',
    // Runner leaderboard
    'logistics.leaderboard.title',
    'logistics.leaderboard.col.runner',
    'logistics.leaderboard.col.cycles',
    'logistics.leaderboard.col.avg_cycle',
    'logistics.leaderboard.empty',
    // Events feed
    'logistics.events.title',
    'logistics.events.pickup_requested',
    'logistics.events.row_blocked',
    'logistics.events.alert',
    'logistics.events.empty',
    // Full view link
];

describe('logistics i18n — EN keys present and non-empty', () => {
    for (const key of LOGISTICS_KEYS) {
        it(`EN: "${key}" is defined and not empty`, () => {
            const val = en[key];
            expect(val, `EN key "${key}" missing`).toBeDefined();
            expect(val, `EN key "${key}" is empty`).not.toBe('');
            // La traducción no debe ser igual a la clave misma
            expect(val, `EN key "${key}" returns key as value (missing translation)`).not.toBe(key);
        });
    }
});

describe('logistics i18n — ES keys present, non-empty, and differ from EN', () => {
    for (const key of LOGISTICS_KEYS) {
        it(`ES: "${key}" is translated (differs from EN)`, () => {
            const enVal = en[key];
            const esVal = es[key];
            expect(esVal, `ES key "${key}" missing`).toBeDefined();
            expect(esVal, `ES key "${key}" is empty`).not.toBe('');
            expect(esVal, `ES key "${key}" returns key as value`).not.toBe(key);
            // La versión ES debe ser diferente de la EN
            expect(esVal, `ES key "${key}" identical to EN — no translation?`).not.toBe(enVal);
        });
    }
});
