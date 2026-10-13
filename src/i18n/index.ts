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

interface I18nContextValue {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: (key: string) => string;
    localeInfo: LocaleInfo;
}

const I18N_STORAGE_KEY = 'harvestpro_locale';

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

const I18nContext = createContext<I18nContextValue>({
    locale: 'en',
    setLocale: () => { },
    t: (key: string) => {
        if (import.meta.env.DEV && typeof window !== 'undefined') {
            console.warn(`[i18n] Missing key (no provider): "${key}"`);
        }
        return key;
    },
    localeInfo: SUPPORTED_LOCALES[0],
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

    // <html lang> sigue al idioma elegido: los lectores de pantalla eligen la voz por él
    useEffect(() => {
        if (typeof document !== 'undefined') document.documentElement.lang = locale;
    }, [locale]);

    const setLocale = useCallback((newLocale: Locale) => {
        setLocaleState(newLocale);
        try {
            localStorage.setItem(I18N_STORAGE_KEY, newLocale);
        } catch { /* Ignore */ }
    }, []);

    const t = useCallback((key: string): string => {
        const result = translations[locale]?.[key] ?? translations['en'][key] ?? key;
        if (result === key && import.meta.env.DEV) {
            // Solo emitir si no es un key de test/placeholder
            if (!key.startsWith('test.') && typeof window !== 'undefined') {
                console.warn(`[i18n] Missing key: "${key}" for locale "${locale}"`);
            }
        }
        return result;
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
