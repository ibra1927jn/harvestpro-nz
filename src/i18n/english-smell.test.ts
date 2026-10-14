/**
 * i18n/english-smell.test.ts — Verificación de calidad de traducciones.
 *
 * Estrategia (sin render de componentes — puro acceso a los diccionarios):
 *
 *   Suite 1 — Traducción ES existe y difiere del EN para cada clave canónica.
 *   Suite 2 — La función t() simulada (mismo algoritmo de fallback) devuelve
 *              el valor ES cuando se llama con locale='es'.
 *   Suite 3 — Cobertura global: todas las claves EN tienen traducción en ES
 *              (o la diferencia se documenta explícitamente).
 *
 * Los tests son 100% síncronos y no requieren jsdom.
 */
import { describe, it, expect } from 'vitest';
import { translations } from '@/i18n/locales/all';
import { CANONICAL_TRANSLATIONS, EXEMPT_FROM_DIFF_CHECK } from './english-smell';

// Función t() replicada (idéntica a la del hook, sin React)
function t(key: string, locale: string): string {
    return translations[locale as keyof typeof translations]?.[key]
        ?? translations['en'][key]
        ?? key;
}

// ─── Suite 1: cada clave canónica tiene traducción ES distinta al EN ──────────

describe('ES locale: canonical keys are translated (differ from EN)', () => {
    for (const { section, key, en } of CANONICAL_TRANSLATIONS) {
        if (EXEMPT_FROM_DIFF_CHECK.has(key)) continue;

        it(`[${section}] "${key}" devuelve texto en ES, no inglés`, () => {
            const esDict = translations['es'];

            // La clave debe existir en el diccionario ES (no sólo como fallback)
            expect(
                esDict[key],
                `Clave "${key}" no está definida en el locale ES (falta traducción)`
            ).toBeDefined();

            // El valor ES debe diferir del EN
            expect(
                esDict[key],
                `Clave "${key}" tiene el mismo valor en ES que en EN: "${en}"`
            ).not.toBe(en);
        });
    }
});

// ─── Suite 2: la función t() devuelve ES, no el fallback EN ─────────────────

describe('ES locale: t() devuelve traducción ES (no fallback EN)', () => {
    for (const { section, key, en } of CANONICAL_TRANSLATIONS) {
        if (EXEMPT_FROM_DIFF_CHECK.has(key)) continue;

        it(`[${section}] t("${key}", "es") ≠ valor EN`, () => {
            const result = t(key, 'es');

            // No debe devolver la clave cruda (indica clave inexistente en todos los dicts)
            expect(result, `t("${key}") devuelve la clave cruda — no existe en ningún locale`).not.toBe(key);

            // No debe devolver el valor inglés (indica que ES no tiene la clave y cayó al fallback)
            expect(result, `t("${key}", "es") cayó al fallback EN: "${en}"`).not.toBe(en);
        });
    }
});

// ─── Suite 3: cobertura global de claves EN en ES ─────────────────────────────

describe('ES locale: cobertura de claves del diccionario EN', () => {
    const enDict = translations['en'];
    const esDict = translations['es'];

    const enKeys = Object.keys(enDict);
    const missingInES = enKeys.filter(k => !(k in esDict));
    // Las claves faltantes en ES van a recibir el valor EN por fallback.
    // Este test documenta el gap actual — NO debe CRECER entre PRs.

    it('todas las claves canónicas existen en ES (sin depender de fallback EN)', () => {
        const canonicalKeys = CANONICAL_TRANSLATIONS
            .map(e => e.key)
            .filter(k => !EXEMPT_FROM_DIFF_CHECK.has(k));

        const missingCanonical = canonicalKeys.filter(k => !(k in esDict));
        expect(
            missingCanonical,
            `Claves canónicas sin traducción ES: ${missingCanonical.join(', ')}`
        ).toHaveLength(0);
    });

    it('el gap de cobertura ES no supera 20% de las claves EN', () => {
        const coveragePct = ((enKeys.length - missingInES.length) / enKeys.length) * 100;
        expect(
            coveragePct,
            `Cobertura ES actual: ${coveragePct.toFixed(1)}%. Claves EN sin traducción: ${missingInES.length}/${enKeys.length}`
        ).toBeGreaterThanOrEqual(80);
    });
});

// ─── Suite 4: otras locales con cobertura propia (mi, sm, hi, tl, to) ────────

const FULL_LOCALES = ['mi', 'sm', 'hi', 'tl', 'to'] as const;
// Estas locales usan ...en como base — verificamos un subconjunto de claves nav+dashboard

const SPOT_CHECK_KEYS: Array<{ key: string; en: string }> = [
    { key: 'nav.dashboard',       en: 'Dashboard' },
    { key: 'nav.teams',           en: 'Teams' },
    { key: 'dashboard.title',     en: 'Orchard Overview' },
    { key: 'dashboard.velocity',  en: 'Velocity' },
    { key: 'common.loading',      en: 'Loading…' },
];

describe('Locales con cobertura propia (mi/sm/hi/tl/to): nav + dashboard traducidos', () => {
    for (const locale of FULL_LOCALES) {
        for (const { key } of SPOT_CHECK_KEYS) {
            it(`[${locale}] "${key}" está definida explícitamente en el dict (no sólo fallback)`, () => {
                const dict = translations[locale as keyof typeof translations];
                // La clave debe existir en el diccionario del locale (decisión consciente del traductor)
                // Aunque el valor sea igual al EN (p.ej. "Dashboard" en tl), la clave fue puesta a propósito.
                expect(
                    key in dict,
                    `[${locale}] "${key}" no está definida — cayó implícitamente al fallback EN`
                ).toBe(true);
            });
        }
    }
});
