/** i18n types — used by all locale files and the context */
export type Locale = 'en' | 'es' | 'fr';

export interface LocaleInfo {
    code: Locale;
    label: string;
    nativeName: string;
    flag: string;
}

export type TranslationDict = Record<string, string>;
