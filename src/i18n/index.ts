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
import { translations } from './locales';

export type { Locale, LocaleInfo } from './types';
export { translations } from './locales';

export const SUPPORTED_LOCALES: LocaleInfo[] = [
    { code: 'en', label: 'English',          nativeName: 'English',       flag: '🇳🇿' },
    { code: 'es', label: 'Spanish',          nativeName: 'Español',       flag: '🇪🇸' },
    { code: 'mi', label: 'Māori',            nativeName: 'Te Reo Māori',  flag: '🇳🇿' },
    { code: 'sm', label: 'Samoan',           nativeName: 'Gagana Samoa',  flag: '🇼🇸' },
    { code: 'hi', label: 'Hindi',            nativeName: 'हिन्दी',         flag: '🇮🇳' },
    { code: 'to', label: 'Tongan',           nativeName: 'Lea Faka-Tonga',flag: '🇹🇴' },
    { code: 'tl', label: 'Filipino/Tagalog', nativeName: 'Filipino',      flag: '🇵🇭' },
];

// ─── Context ──────────────────────────────────────────────────

/** Valores para los placeholders {n}, {name}… de una traducción */
export type TParams = Record<string, string | number>;
export type TFunction = (key: string, params?: TParams) => string;

interface I18nContextValue {
    locale: Locale;
    setLocale: (locale: Locale) => void;
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
        const stored = localStorage.getItem(I18N_STORAGE_KEY) as Locale | null;
        if (stored && translations[stored]) return stored;
    } catch { /* Ignore SSR / private browsing */ }

    const browserLang = navigator.language?.split('-')[0];
    const detected = browserLang as Locale;
    if (translations[detected]) return detected;
    return 'en';
}

// Idioma actual para código fuera de React (announcer, servicios, ErrorBoundary)
let currentLocale: Locale | null = null;

export function getCurrentLocale(): Locale {
    if (currentLocale === null) currentLocale = getInitialLocale();
    return currentLocale;
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
    setLocale: () => { },
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

    const setLocale = useCallback((newLocale: Locale) => {
        currentLocale = newLocale;
        setLocaleState(newLocale);
        try {
            localStorage.setItem(I18N_STORAGE_KEY, newLocale);
        } catch { /* Ignore */ }
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
