/**
 * Carga de idiomas bajo demanda: solo el inglés va en el bundle; el resto se
 * carga antes del primer render o al cambiar de idioma. Cada test importa los
 * módulos de nuevo (vi.resetModules) para empezar sin los idiomas que registra
 * src/test-setup.ts.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

type I18nModule = typeof import('../index');
type LocalesModule = typeof import('./index');

async function fresh(): Promise<{ i18n: I18nModule; locales: LocalesModule }> {
    vi.resetModules();
    const locales = await import('./index');
    const i18n = await import('../index');
    return { i18n, locales };
}

beforeEach(() => {
    localStorage.removeItem('harvestpro_locale');
    vi.spyOn(console, 'warn').mockImplementation(() => { });
});

afterEach(() => {
    vi.doUnmock('./es');
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.removeItem('harvestpro_locale');
});

describe('locale registry', () => {
    it('starts with English only; other locales load as separate modules, once', async () => {
        const { locales } = await fresh();
        expect(Object.keys(locales.translations)).toEqual(['en']);
        expect(locales.isLocaleLoaded('es')).toBe(false);

        const [a, b] = await Promise.all([locales.loadLocale('es'), locales.loadLocale('es')]);
        expect(a).toBe(b);
        expect(locales.isLocaleLoaded('es')).toBe(true);
        expect(locales.translations.es?.['common.retry']).toBeTruthy();
        expect(locales.translations.es?.['common.retry']).not.toBe(locales.translations.en['common.retry']);
    });

    it('a failed load rejects and can be retried later (back online)', async () => {
        let fail = true;
        vi.doMock('./es', async (importOriginal) => {
            if (fail) throw new Error('Failed to fetch dynamically imported module');
            return importOriginal();
        });
        const { locales } = await fresh();
        // (vitest envuelve el error del mock; en el navegador es "Failed to fetch dynamically imported module")
        await expect(locales.loadLocale('es')).rejects.toThrow();
        expect(locales.isLocaleLoaded('es')).toBe(false);

        fail = false;
        vi.resetModules(); // el mock vuelve a evaluarse en el siguiente import()
        await expect(locales.loadLocale('es')).resolves.toHaveProperty('sync.offline');
        expect(locales.isLocaleLoaded('es')).toBe(true);
    });
});

describe('prepareInitialLocale (before first render)', () => {
    it('loads the stored language so the first render is already Spanish', async () => {
        localStorage.setItem('harvestpro_locale', 'es');
        const { i18n, locales } = await fresh();
        expect(i18n.getCurrentLocale()).toBe('en'); // aún sin cargar → inglés, nunca la clave

        await expect(i18n.prepareInitialLocale()).resolves.toBe('es');
        expect(i18n.getCurrentLocale()).toBe('es');
        expect(i18n.translate('common.retry')).toBe(locales.translations.es?.['common.retry']);
    });

    it('offline without the chunk: falls back to English, keeps the preference, no crash', async () => {
        localStorage.setItem('harvestpro_locale', 'es');
        vi.doMock('./es', () => { throw new Error('Failed to fetch dynamically imported module'); });
        const { i18n } = await fresh();

        await expect(i18n.prepareInitialLocale()).resolves.toBe('en');
        expect(i18n.getCurrentLocale()).toBe('en');
        expect(i18n.translate('common.retry')).toBe('Retry');
        // La preferencia no se pierde: con red, el próximo arranque sale en español
        expect(localStorage.getItem('harvestpro_locale')).toBe('es');

        // La app arranca y se ve en inglés
        render(React.createElement(i18n.I18nProvider, null,
            React.createElement(() => React.createElement('p', null, i18n.useI18n().t('common.retry')))));
        expect(screen.getByText('Retry')).toBeTruthy();
        expect(document.documentElement.lang).toBe('en');
    });

    it('a slow chunk does not block the app forever: English first, then switches when it arrives', async () => {
        localStorage.setItem('harvestpro_locale', 'es');
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        vi.doMock('./es', async (importOriginal) => {
            await gate;
            return importOriginal();
        });
        const { i18n, locales } = await fresh();

        await expect(i18n.prepareInitialLocale(20)).resolves.toBe('en');
        render(React.createElement(i18n.I18nProvider, null,
            React.createElement(() => React.createElement('p', null, i18n.useI18n().t('common.retry')))));
        expect(screen.getByText('Retry')).toBeTruthy();

        await act(async () => { release(); await locales.loadLocale('es'); });
        const es = locales.translations.es?.['common.retry'] ?? '';
        await waitFor(() => expect(screen.getByText(es)).toBeTruthy());
        expect(document.documentElement.lang).toBe('es');
    });

    it('unknown stored value or English: no extra load', async () => {
        localStorage.setItem('harvestpro_locale', 'xx');
        const { i18n, locales } = await fresh();
        await expect(i18n.prepareInitialLocale()).resolves.toBe('en');
        expect(Object.keys(locales.translations)).toEqual(['en']);
    });

    it('a language that was removed from the app (mi, sm, hi, to, tl) falls back to English, no crash', async () => {
        for (const removed of ['mi', 'sm', 'hi', 'to', 'tl']) {
            localStorage.setItem('harvestpro_locale', removed);
            const { i18n, locales } = await fresh();
            expect(locales.isLocale(removed)).toBe(false);
            await expect(i18n.prepareInitialLocale()).resolves.toBe('en');
            expect(i18n.getCurrentLocale()).toBe('en');
            expect(i18n.translate('common.retry')).toBe('Retry');
            expect(Object.keys(locales.translations)).toEqual(['en']);
            // La app arranca en inglés
            const { unmount } = render(React.createElement(i18n.I18nProvider, null,
                React.createElement(() => React.createElement('p', null, i18n.useI18n().t('common.retry')))));
            expect(screen.getByText('Retry')).toBeTruthy();
            expect(document.documentElement.lang).toBe('en');
            unmount();
        }
    });
});

describe('setLocale (language switch)', () => {
    function Switcher({ i18n, to }: { i18n: I18nModule; to: 'es' }) {
        const { t, setLocale, locale } = i18n.useI18n();
        const [result, setResult] = React.useState<string>('');
        return React.createElement('div', null,
            React.createElement('p', null, `${locale}:${t('common.retry')}`),
            React.createElement('button', { onClick: () => { void setLocale(to).then(ok => setResult(String(ok))); } }, 'switch'),
            React.createElement('output', null, result));
    }

    it('loads the language chunk on demand, then switches and remembers it', async () => {
        const { i18n, locales } = await fresh();
        render(React.createElement(i18n.I18nProvider, null, React.createElement(Switcher, { i18n, to: 'es' })));
        expect(screen.getByText('en:Retry')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'switch' }));
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe('true'));
        expect(screen.getByText(`es:${locales.translations.es?.['common.retry']}`)).toBeTruthy();
        expect(document.documentElement.lang).toBe('es');
        expect(localStorage.getItem('harvestpro_locale')).toBe('es');
        expect(i18n.translate('common.retry')).toBe(locales.translations.es?.['common.retry']);
    });

    it('offline and the chunk is not available: stays in the current language, no crash', async () => {
        vi.doMock('./es', () => { throw new Error('Failed to fetch dynamically imported module'); });
        const { i18n } = await fresh();
        render(React.createElement(i18n.I18nProvider, null, React.createElement(Switcher, { i18n, to: 'es' })));

        fireEvent.click(screen.getByRole('button', { name: 'switch' }));
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe('false'));
        expect(screen.getByText('en:Retry')).toBeTruthy();
        expect(localStorage.getItem('harvestpro_locale')).toBeNull();
        expect(i18n.getCurrentLocale()).toBe('en');
    });
});
