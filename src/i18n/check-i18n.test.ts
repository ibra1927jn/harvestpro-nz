// @vitest-environment node
/**
 * Guardia de traducciones (scripts/i18n/check-i18n.mjs): la lógica con ejemplos
 * pequeños y, al final, el repo real (claves, placeholders y textos sin t()).
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
    extractDictFromSource, compareLocales, extractUsedKeys, findHardcoded, isUserText,
    loadAllowlist, runChecks, failures, BASELINE_FILE,
} from '../../scripts/i18n/check-i18n.mjs';

const allow = { exact: new Set<string>(['N/A']), words: ['HarvestPro', 'NZD', 'kg'], ignoreFiles: [] };

describe('locale comparison', () => {
    it('reads the keys of a locale file, and counts spreads that hide missing keys', () => {
        const r = extractDictFromSource(`const x = { ...en, 'a.b': 'Hola', "c.d": \`Adiós\`, notAKey: 'x' };`);
        expect(r.dict).toEqual({ 'a.b': 'Hola', 'c.d': 'Adiós' });
        expect(r.spreads).toBe(1);
    });

    it('reports keys missing or extra vs English and placeholder mismatches', () => {
        const r = compareLocales({
            en: { 'a.one': '{n} bins', 'a.two': 'Row {row}', 'a.three': 'Hi' },
            es: { 'a.one': '{n} bins', 'a.two': 'Hilera {fila}', 'a.extra': 'x' },
        });
        expect(r.missing.es).toEqual(['a.three']);
        expect(r.extra.es).toEqual(['a.extra']);
        expect(r.placeholderMismatch).toEqual([{ lang: 'es', key: 'a.two', expected: '{row}', actual: '{fila}' }]);
    });
});

describe('keys used in code', () => {
    it('finds t("…") keys and dynamic t(`prefix.${x}`) prefixes, ignoring non-key strings', () => {
        const r = extractUsedKeys(`
            const a = t('runner.scan.title');
            const b = t(\`nav.\${tab}\`);
            const c = t('Not a key');
            const d = translate('sync.banner.offline', { n: 2 });`, 'x.tsx');
        expect(r.keys.map((k) => k.key)).toEqual(['runner.scan.title', 'sync.banner.offline']);
        expect(r.dynamic.map((d) => d.prefix)).toEqual(['nav.']);
    });
});

describe('hard-coded user-visible strings', () => {
    const find = (src: string) => findHardcoded(src, 'src/components/X.tsx', allow).map((f) => `${f.kind}:${f.text}`);

    it('flags JSX text, text attributes, toasts and screen-reader announcements', () => {
        expect(find(`
            const X = () => {
                showToast('Saved offline', 'success');
                announce(\`Scanned \${code}.\`);
                setError('Could not save');
                return <div aria-label="Close panel" title={busy ? 'Saving…' : 'Save'}>
                    Today {n} buckets {ok && 'Done'}
                </div>;
            };`)).toEqual([
            'call:showToast:Saved offline',
            'call:announce:Scanned .',
            'call:setError:Could not save',
            'attr:aria-label:Close panel',
            'attr:title:Saving…',
            'attr:title:Save',
            'jsx-text:Today',
            'jsx-text:buckets',
            'jsx-expr:Done',
        ]);
    });

    it('does not flag translated text, code-like strings, brands/units or i18n-ignore lines', () => {
        expect(find(`
            const X = () => <div className="flex gap-2" aria-label={t('a.b')} data-testid="row-card">
                {t('runner.title')} — {n} kg
                <span title="HarvestPro">NZD</span>
                <b>{status === 'pending' ? t('x.y') : 'error_code'}</b>
                {/* i18n-ignore */}
                <i>Debug only</i>
                <i>N/A</i>
            </div>;`)).toEqual([]);
    });

    it('skips a label that only backs up its labelKey, but not a bare label', () => {
        expect(find(`
            const NAV = [
                { id: 'a', label: 'Dashboard', labelKey: 'nav.dashboard' },
                { id: 'b', label: 'History' },
            ];`)).toEqual(['prop:label:History']);
    });

    it('treats words, not punctuation or numbers, as user text', () => {
        expect(isUserText('  12:30 · 4 / 5 ', allow)).toBe(false);
        expect(isUserText('row_assignments', allow)).toBe(false);
        expect(isUserText('HarvestPro NZD', allow)).toBe(false);
        expect(isUserText('HarvestPro rocks', allow)).toBe(true);
        expect(isUserText('Hoy', allow)).toBe(true);
    });

    it('loads the repo allowlist', () => {
        expect(loadAllowlist().words).toContain('KiwiSaver');
    });
});

describe('this repository', () => {
    // Si falla: añade la clave en los 7 locales, o usa t() en vez de texto a mano
    // (node scripts/i18n/check-i18n.mjs --list <archivo> enseña cuáles).
    it('has every key in every locale, matching placeholders and no new hard-coded text', () => {
        const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as Record<string, number>;
        const r = runChecks({ baseline });
        expect(failures(r)).toEqual([]);
        expect(r.languages).toEqual(['en', 'es', 'hi', 'mi', 'sm', 'tl', 'to']);
    }, 60_000);
});
