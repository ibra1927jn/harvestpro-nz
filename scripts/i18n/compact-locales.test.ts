// @vitest-environment node
/**
 * El build emite cada idioma como array de textos alineado con las claves inglesas
 * (scripts/i18n/compact-locales.mjs). Aquí se evalúa ese código generado y se
 * compara con los ficheros fuente: el diccionario que llega al móvil es idéntico.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { normalizePath } from 'vite';
import { compactLocalesPlugin, compactLocaleSource, evaluateLocale, LOCALES } from './compact-locales.mjs';
import { allTranslations } from '../../src/i18n/locales/all';

const ROOT = join(__dirname, '..', '..');
const LOCALES_DIR = join(ROOT, 'src', 'i18n', 'locales');

/** Ejecuta el módulo ESM generado (import de EN_KEYS → el módulo inglés generado). */
function runModule(code: string, enKeys: string[]): Record<string, string> {
  const body = code
    .replace(/^import\{EN_KEYS as k\}from"[^"]+";/, 'const k=__enKeys;')
    .replace('export const EN_KEYS=k;', '')
    .replace('export default d;', 'return d;');
  // Sin sentencias import/export sueltas (las palabras dentro de textos no cuentan)
  expect(body).not.toMatch(/(^|;)(import|export)[\s{]/);
  return new Function('__enKeys', body)(enKeys) as Record<string, string>;
}

describe('compact-locales', () => {
  const en = evaluateLocale(LOCALES_DIR, 'en');
  const enKeys = Object.keys(en);
  const plugin = compactLocalesPlugin();
  plugin.configResolved({ root: ROOT });

  it.each(LOCALES)('plugin loads the normalized Vite ID for %s', l => {
    const id = normalizePath(join(LOCALES_DIR, l, 'index.ts'));
    const result = plugin.load(id);
    expect(result).not.toBeNull();
    if (!result) throw new Error(`Locale module was not compacted: ${id}`);
    expect(runModule(result.code, enKeys)).toEqual(allTranslations[l as keyof typeof allTranslations]);
    if (l !== 'en') {
      const enModuleId = normalizePath(join(LOCALES_DIR, 'en', 'index.ts'));
      expect(result.code).toContain(`import{EN_KEYS as k}from${JSON.stringify(enModuleId)};`);
    }
  });

  it('leaves unrelated modules untouched', () => {
    expect(plugin.load(normalizePath(join(ROOT, 'src', 'other', 'es', 'index.ts')))).toBeNull();
    expect(plugin.load(normalizePath(join(LOCALES_DIR, 'es', 'common.ts')))).toBeNull();
    expect(plugin.load(normalizePath(join(LOCALES_DIR, 'zz', 'index.ts')))).toBeNull();
  });

  it('evaluates the TS locale sources exactly like the app imports them', () => {
    for (const l of LOCALES) {
      expect(evaluateLocale(LOCALES_DIR, l)).toEqual(allTranslations[l as keyof typeof allTranslations]);
    }
  });

  it.each(LOCALES)('generated %s module yields the same dictionary, without repeating the keys', l => {
    const dict = evaluateLocale(LOCALES_DIR, l);
    const code = compactLocaleSource(l, dict, enKeys, '/x/en/index.ts');
    expect(runModule(code, enKeys)).toEqual(dict);
    if (l !== 'en') {
      // Ninguna clave en el chunk del idioma (solo textos)
      expect(code).not.toContain('"common.retry"');
      expect(code.length).toBeLessThan(JSON.stringify(dict).length - 30_000);
    }
  });

  it('missing keys fall back (absent), extra keys are kept', () => {
    const code = compactLocaleSource('es', { 'a.one': 'uno', 'z.extra': 'extra' }, ['a.one', 'a.two'], '/x');
    expect(runModule(code, ['a.one', 'a.two'])).toEqual({ 'a.one': 'uno', 'z.extra': 'extra' });
  });
});
