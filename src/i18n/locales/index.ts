import type { Locale, TranslationDict } from '../types';
import en from './en';

/**
 * Registro de idiomas. Solo el inglés (el fallback) va en el bundle principal;
 * cada otro idioma es un chunk aparte que se carga con loadLocale() antes del
 * primer render (src/index.tsx) o al cambiar de idioma. El service worker los
 * precachea todos: offline se puede arrancar y cambiar a cualquiera.
 *
 * Todos los idiomas de golpe (tests, e2e, scripts): ./all.ts.
 */
export const LOCALE_CODES = ['en', 'es'] as const satisfies readonly Locale[];

type LazyLocale = Exclude<Locale, 'en'>;

// Un import() por idioma → un chunk por idioma (scripts/route-preload.mjs lo precarga)
const loaders: Record<LazyLocale, () => Promise<{ default: TranslationDict }>> = {
    es: () => import('./es'),
};

/** Idiomas ya cargados (siempre el inglés). Mutable: loadLocale() añade. */
export const translations: Partial<Record<Locale, TranslationDict>> & { en: TranslationDict } = { en };

export function isLocale(value: unknown): value is Locale {
    return typeof value === 'string' && (LOCALE_CODES as readonly string[]).includes(value);
}

export function isLocaleLoaded(locale: Locale): boolean {
    return translations[locale] !== undefined;
}

/** Registra un diccionario ya cargado (tests y precarga). */
export function registerLocale(locale: Locale, dict: TranslationDict): void {
    translations[locale] = dict;
}

const inflight = new Map<Locale, Promise<TranslationDict>>();

/**
 * Carga el chunk de un idioma (una sola descarga aunque se pida varias veces).
 * Si falla (offline sin el chunk en caché) rechaza y permite reintentar luego.
 */
export function loadLocale(locale: Locale): Promise<TranslationDict> {
    const loaded = translations[locale];
    if (loaded) return Promise.resolve(loaded);
    let p = inflight.get(locale);
    if (!p) {
        p = loaders[locale as LazyLocale]()
            .then(m => {
                translations[locale] = m.default;
                return m.default;
            })
            .finally(() => inflight.delete(locale));
        inflight.set(locale, p);
    }
    return p;
}
