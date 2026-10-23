/**
 * Todos los idiomas cargados de golpe. SOLO para tests, e2e y scripts: la app
 * usa ./index.ts (inglés + carga bajo demanda). No importar desde src/ de la app.
 */
import type { Locale, TranslationDict } from '../types';
import en from './en';
import es from './es';

export const allTranslations: Record<Locale, TranslationDict> = { en, es };
export { allTranslations as translations };
