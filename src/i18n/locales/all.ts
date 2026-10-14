/**
 * Todos los idiomas cargados de golpe. SOLO para tests, e2e y scripts: la app
 * usa ./index.ts (inglés + carga bajo demanda). No importar desde src/ de la app.
 */
import type { Locale, TranslationDict } from '../types';
import en from './en';
import es from './es';
import mi from './mi';
import sm from './sm';
import hi from './hi';
import to from './to';
import tl from './tl';

export const allTranslations: Record<Locale, TranslationDict> = { en, es, mi, sm, hi, to, tl };
export { allTranslations as translations };
