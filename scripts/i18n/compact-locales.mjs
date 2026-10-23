/**
 * compact-locales — en el build, cada idioma se emite como un array de textos en
 * el orden de las claves inglesas, sin repetir las 1600+ claves en todos los idiomas.
 * Las claves van una sola vez, en el diccionario inglés (bundle principal).
 *
 * Ahorra ~37 KB sin comprimir por idioma (también en el precache del service
 * worker) y algo de gzip en cada chunk de idioma. El resultado es el mismo
 * objeto clave → texto: lo comprueba scripts/i18n/compact-locales.test.ts
 * comparando con los ficheros fuente. En dev y en los tests se usa el TS original.
 */
import { buildSync } from 'esbuild';
import { join } from 'node:path';
import { normalizePath } from 'vite';

export const LOCALES = ['en', 'es', 'fr'];

/** Evalúa src/i18n/locales/<lang>/index.ts (con sus imports) → { clave: texto }. */
export function evaluateLocale(localesDir, lang) {
  const out = buildSync({
    entryPoints: [join(localesDir, lang, 'index.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'neutral',
    write: false,
    logLevel: 'silent',
  });
  const module = { exports: {} };
  new Function('module', 'exports', out.outputFiles[0].text)(module, module.exports);
  const dict = module.exports.default;
  if (!dict || typeof dict !== 'object') throw new Error(`compact-locales: ${lang} no exporta un diccionario`);
  return dict;
}

/**
 * Código JS del módulo de un idioma.
 * - en: exporta EN_KEYS (orden de referencia) y el diccionario.
 * - resto: importa EN_KEYS del módulo inglés; textos alineados (null = falta → fallback inglés);
 *   claves que no existan en inglés (no debería haber: check-i18n lo impide) van aparte.
 */
export function compactLocaleSource(lang, dict, enKeys, enModuleId) {
  const zip =
    'const d={};for(let i=0;i<k.length;i++)if(v[i]!==null)d[k[i]]=v[i];';
  if (lang === 'en') {
    return (
      `const k=${JSON.stringify(enKeys)};const v=${JSON.stringify(enKeys.map(key => dict[key]))};` +
      `${zip}export const EN_KEYS=k;export default d;`
    );
  }
  const values = enKeys.map(key => (Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : null));
  const enSet = new Set(enKeys);
  const extra = Object.fromEntries(Object.entries(dict).filter(([key]) => !enSet.has(key)));
  return (
    `import{EN_KEYS as k}from${JSON.stringify(enModuleId)};const v=${JSON.stringify(values)};` +
    `${zip}Object.assign(d,${JSON.stringify(extra)});export default d;`
  );
}

/** Plugin de Vite (solo build). */
export function compactLocalesPlugin() {
  let localesDir = '';
  let cache = null;
  const build = () => {
    if (cache) return cache;
    const dicts = Object.fromEntries(LOCALES.map(l => [l, evaluateLocale(localesDir, l)]));
    cache = { dicts, enKeys: Object.keys(dicts.en) };
    return cache;
  };
  return {
    name: 'compact-locales',
    apply: 'build',
    enforce: 'pre',
    configResolved(cfg) {
      localesDir = normalizePath(join(cfg.root, 'src', 'i18n', 'locales'));
    },
    load(id) {
      const moduleId = normalizePath(id);
      const m = moduleId.startsWith(`${localesDir}/`) && /\/([a-z]{2})\/index\.ts$/.exec(moduleId);
      if (!m || !LOCALES.includes(m[1]) || moduleId !== `${localesDir}/${m[1]}/index.ts`) return null;
      const { dicts, enKeys } = build();
      return { code: compactLocaleSource(m[1], dicts[m[1]], enKeys, `${localesDir}/en/index.ts`), map: null };
    },
  };
}
