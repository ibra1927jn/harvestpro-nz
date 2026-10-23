/**
 * i18n — Lightweight Internationalization for HarvestPro NZ
 *
 * Architecture:
 *   types.ts          — Locale / LocaleInfo / TranslationDict types
 *   locales/<lang>/   — Feature-scoped translation files per language
 *   locales/index.ts  — Merges all locales into a single lookup table
 *   index.ts (this)   — React Context + hooks
 *
 * Usage:
 *   const { t, locale, setLocale } = useTranslation();
 *   t('settings.title') => 'Settings' / 'Ajustes' / …
 *
 * Fallback chain: requested locale → EN → return key itself
 */
import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import type { Locale, LocaleInfo } from './types';
import { translations, isLocale, isLocaleLoaded, loadLocale } from './locales';

export type { Locale, LocaleInfo } from './types';
// translations: solo los idiomas ya cargados (siempre inglés). Todos: './locales/all' (tests)
export { translations, isLocaleLoaded, loadLocale } from './locales';

export const SUPPORTED_LOCALES: LocaleInfo[] = [
    { code: 'en', label: 'English',          nativeName: 'English',       flag: '🇳🇿' },
    { code: 'es', label: 'Spanish',          nativeName: 'Español',       flag: '🇪🇸' },
];

// ─── Context ──────────────────────────────────────────────────

/** Valores para los placeholders {n}, {name}… de una traducción */
export type TParams = Record<string, string | number>;
export type TFunction = (key: string, params?: TParams) => string;

interface I18nContextValue {
    locale: Locale;
    /** Carga el idioma si hace falta y lo activa. false si no se pudo cargar (sigue el actual). */
    setLocale: (locale: Locale) => Promise<boolean>;
    t: TFunction;
    localeInfo: LocaleInfo;
}

const I18N_STORAGE_KEY = 'harvestpro_locale';

/** Sustituye {nombre} por params.nombre; deja intacto lo que no venga en params. */
export function interpolate(text: string, params?: TParams): string {
    if (!params) return text;
    return text.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, k: string) =>
        Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : m);
}

function lookup(locale: Locale, key: string): string {
    return translations[locale]?.[key] ?? translations['en'][key] ?? key;
}

function getInitialLocale(): Locale {
    try {
        const stored = localStorage.getItem(I18N_STORAGE_KEY);
        if (isLocale(stored)) return stored;
    } catch { /* Ignore SSR / private browsing */ }

    // Misma regla que el script de precarga de index.html (scripts/route-preload.mjs)
    const browserLang = navigator.language?.split('-')[0];
    if (isLocale(browserLang)) return browserLang;
    return 'en';
}

// Idioma actual para código fuera de React (announcer, servicios, ErrorBoundary)
let currentLocale: Locale | null = null;

/** Idioma en uso. Si su chunk aún no está cargado, inglés (el texto saldría en inglés igualmente). */
export function getCurrentLocale(): Locale {
    if (currentLocale === null) currentLocale = getInitialLocale();
    return isLocaleLoaded(currentLocale) ? currentLocale : 'en';
}

// Idioma guardado cuyo chunk no llegó a tiempo para el primer render
let pendingLocale: Locale | null = null;
// El I18nProvider escucha para pasar a ese idioma si su chunk llega tarde
const lateLoadListeners = new Set<(locale: Locale) => void>();

/** Espera máxima al chunk del idioma antes del primer render (luego se pinta en inglés). */
export const INITIAL_LOCALE_TIMEOUT_MS = 8_000;

/**
 * Antes del primer render (detrás del splash): carga el idioma guardado para que
 * un usuario en español no vea la app en inglés ni un parpadeo. index.html ya lo
 * pidió en paralelo (modulepreload), así que normalmente está listo.
 * Si falla (offline sin el chunk en caché) o tarda demasiado: inglés, sin romper,
 * y sin olvidar la preferencia (si el chunk llega después, se cambia solo).
 */
export async function prepareInitialLocale(timeoutMs: number = INITIAL_LOCALE_TIMEOUT_MS): Promise<Locale> {
    if (currentLocale === null) currentLocale = getInitialLocale();
    const wanted = currentLocale;
    if (isLocaleLoaded(wanted)) return wanted;
    const load = loadLocale(wanted);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>(resolve => { timer = setTimeout(() => resolve('timeout'), timeoutMs); });
    try {
        const r = await Promise.race([load.then(() => 'ok' as const), timeout]);
        if (r === 'ok') return wanted;
        console.warn(`[i18n] Locale "${wanted}" is taking too long; starting in English`);
        // Llega tarde: avisar al provider (si el usuario no ha elegido otro mientras)
        pendingLocale = wanted;
        load.then(() => {
            if (pendingLocale !== wanted) return;
            pendingLocale = null;
            currentLocale = wanted;
            lateLoadListeners.forEach(fn => fn(wanted));
        }).catch(() => { pendingLocale = null; });
    } catch (err) {
        console.warn(`[i18n] Could not load locale "${wanted}"; using English`, err);
    } finally {
        clearTimeout(timer);
    }
    return 'en';
}

/** Cambia el idioma de translate() (el I18nProvider lo hace solo; útil fuera de React/tests). */
export function setCurrentLocale(locale: Locale): void {
    currentLocale = locale;
}

/** t() sin hooks: usa el idioma elegido en la app (el mismo que el I18nProvider). */
export function translate(key: string, params?: TParams, locale: Locale = getCurrentLocale()): string {
    return interpolate(lookup(locale, key), params);
}

const I18nContext = createContext<I18nContextValue>({
    locale: 'en',
    setLocale: () => Promise.resolve(false),
    // Sin provider (tests aislados, ErrorBoundary raíz): mismo idioma guardado
    t: (key: string, params?: TParams) => translate(key, params),
    localeInfo: SUPPORTED_LOCALES[0],
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [locale, setLocaleState] = useState<Locale>(getCurrentLocale);

    // <html lang> sigue al idioma elegido: los lectores de pantalla eligen la voz por él
    useEffect(() => {
        currentLocale = locale;
        if (typeof document !== 'undefined') document.documentElement.lang = locale;
    }, [locale]);

    // Chunk del idioma guardado que llegó después del primer render (red lenta)
    useEffect(() => {
        const onLate = (l: Locale) => setLocaleState(l);
        lateLoadListeners.add(onLate);
        return () => { lateLoadListeners.delete(onLate); };
    }, []);

    const setLocale = useCallback(async (newLocale: Locale): Promise<boolean> => {
        try {
            await loadLocale(newLocale);
        } catch (err) {
            // Offline sin ese idioma en caché: se queda el actual
            console.warn(`[i18n] Could not load locale "${newLocale}"`, err);
            return false;
        }
        pendingLocale = null;
        currentLocale = newLocale;
        setLocaleState(newLocale);
        try {
            localStorage.setItem(I18N_STORAGE_KEY, newLocale);
        } catch { /* Ignore */ }
        return true;
    }, []);

    const t = useCallback((key: string, params?: TParams): string => {
        const result = lookup(locale, key);
        if (result === key && import.meta.env.DEV) {
            // Solo emitir si no es un key de test/placeholder
            if (!key.startsWith('test.') && typeof window !== 'undefined') {
                console.warn(`[i18n] Missing key: "${key}" for locale "${locale}"`);
            }
        }
        return interpolate(result, params);
    }, [locale]);

    const localeInfo = useMemo(
        () => SUPPORTED_LOCALES.find(l => l.code === locale) ?? SUPPORTED_LOCALES[0],
        [locale]
    );

    const value = useMemo(() => ({ locale, setLocale, t, localeInfo }), [locale, setLocale, t, localeInfo]);

    return React.createElement(I18nContext.Provider, { value }, children);
};

export function useI18n() {
    return useContext(I18nContext);
}

export function useTranslation() {
    const { t, locale, setLocale, localeInfo } = useI18n();
    return { t, locale, setLocale, localeInfo };
}
