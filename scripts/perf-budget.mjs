#!/usr/bin/env node
/* eslint-disable no-console -- herramienta de línea de comandos: su salida es la consola */
/**
 * Presupuesto de rendimiento (barato, para CI): se ejecuta después de `vite build`.
 *
 * - Calcula el JS/CSS inicial (entry + página + pestaña por defecto + módulos de
 *   arranque, con sus imports estáticos) de cada ruta crítica a partir de
 *   dist/.vite/manifest.json y lo compara con perf-budget.json.
 * - Falla si una ruta crítica arrastra chunks prohibidos (Sentry, PostHog, gráficos…).
 * - Falla si algún asset (p. ej. la fuente de iconos) supera su límite.
 * - Falla si el precache del service worker crece o pierde lo necesario offline.
 *
 * Uso: node scripts/perf-budget.mjs [--dist dist] [--all] [--json salida.json]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { gzipSync, brotliCompressSync, constants } from 'zlib';
import { ROUTE_MODULES, STARTUP_MODULES, LAZY_LOCALES, localeModule } from './route-preload.mjs';

const args = process.argv.slice(2);
const argValue = name => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const DIST = resolve(argValue('--dist') ?? 'dist');
const BUDGET_FILE = resolve(argValue('--budget') ?? 'perf-budget.json');
const SHOW_ALL = args.includes('--all');
const JSON_OUT = argValue('--json');

const manifest = JSON.parse(readFileSync(join(DIST, '.vite', 'manifest.json'), 'utf8'));
// fichero → módulos que contiene (lo emite scripts/route-preload.mjs)
const chunkModules = JSON.parse(readFileSync(join(DIST, '.vite', 'chunk-modules.json'), 'utf8'));
const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));

const sizeCache = new Map();
/** Tamaños en bytes: crudo, gzip -9, brotli q11. */
function sizes(file) {
  if (sizeCache.has(file)) return sizeCache.get(file);
  const buf = readFileSync(join(DIST, file));
  const s = {
    raw: buf.length,
    gzip: gzipSync(buf, { level: 9 }).length,
    brotli: brotliCompressSync(buf, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  };
  sizeCache.set(file, s);
  return s;
}

const kb = n => (n / 1024).toFixed(1);

/**
 * Clave del manifest para un módulo. Si Rollup lo fusionó en un chunk compartido
 * (p. ej. dos páginas importan algo suyo), el manifest no lo lista por su ruta:
 * se busca el chunk que lo contiene con chunk-modules.json.
 */
function manifestKey(k) {
  if (manifest[k]) return k;
  const file = Object.keys(chunkModules).find(f => chunkModules[f].includes(k));
  const key = file && Object.keys(manifest).find(mk => manifest[mk].file === file);
  if (!key) throw new Error(`perf-budget: "${k}" no está en el manifest de Vite`);
  return key;
}

/** Cierre de imports estáticos de una lista de claves del manifest. */
function closure(keys) {
  const seen = new Set();
  const stack = keys.map(manifestKey);
  while (stack.length) {
    const k = stack.pop();
    if (seen.has(k)) continue;
    const entry = manifest[k];
    if (!entry) throw new Error(`perf-budget: "${k}" no está en el manifest de Vite`);
    seen.add(k);
    for (const imp of entry.imports ?? []) stack.push(imp);
  }
  const js = new Set();
  const css = new Set();
  for (const k of seen) {
    js.add(manifest[k].file);
    for (const c of manifest[k].css ?? []) css.add(c);
  }
  return { keys: seen, js: [...js], css: [...css] };
}

function total(files, kind) {
  return files.reduce((acc, f) => acc + sizes(f)[kind], 0);
}

const failures = [];
const report = { routes: {}, assets: {} };

// ── Rutas críticas ─────────────────────────────
// JS inicial de una ruta = entry + lo que se precarga para esa ruta (route-preload.mjs)
for (const [route, cfg] of Object.entries(budget.routes)) {
  const modules = ROUTE_MODULES[route];
  if (!modules) throw new Error(`perf-budget: ruta ${route} no está en ROUTE_MODULES`);
  const c = closure(['index.html', ...modules, ...STARTUP_MODULES]);
  const jsGzip = total(c.js, 'gzip');
  const jsBrotli = total(c.js, 'brotli');
  const cssGzip = total(c.css, 'gzip');
  report.routes[route] = {
    jsGzipKB: Number(kb(jsGzip)),
    jsBrotliKB: Number(kb(jsBrotli)),
    cssGzipKB: Number(kb(cssGzip)),
    chunks: c.js
      .map(f => ({ file: f, gzipKB: Number(kb(sizes(f).gzip)) }))
      .sort((a, b) => b.gzipKB - a.gzipKB),
  };
  console.log(
    `\n[${route}] JS inicial ${kb(jsGzip)} KB gzip / ${kb(jsBrotli)} KB br ` +
      `(límite ${cfg.maxJsGzipKB} KB gzip), CSS ${kb(cssGzip)} KB gzip (límite ${cfg.maxCssGzipKB} KB)`
  );
  for (const ch of report.routes[route].chunks) console.log(`   ${String(ch.gzipKB).padStart(7)} KB  ${ch.file}`);

  if (jsGzip / 1024 > cfg.maxJsGzipKB) {
    failures.push(`${route}: JS inicial ${kb(jsGzip)} KB gzip > ${cfg.maxJsGzipKB} KB`);
  }
  if (cssGzip / 1024 > cfg.maxCssGzipKB) {
    failures.push(`${route}: CSS inicial ${kb(cssGzip)} KB gzip > ${cfg.maxCssGzipKB} KB`);
  }
  const modulesInPath = c.js.flatMap(f => chunkModules[f] ?? []);
  for (const pattern of budget.forbiddenInCriticalPath ?? []) {
    const re = new RegExp(pattern);
    const hits = [...new Set([...c.js.filter(f => re.test(f)), ...modulesInPath.filter(m => re.test(m))])];
    if (hits.length) {
      failures.push(`${route}: la ruta crítica incluye ${hits.slice(0, 5).join(', ')} (prohibido: /${pattern}/)`);
    }
  }
}

// ── Idiomas (chunk aparte cada uno, fuera del JS inicial) ──
// Un usuario no inglés descarga además el chunk de su idioma (en paralelo, precargado
// desde index.html). Que ninguno se cuele en la ruta crítica ni crezca sin control.
if (budget.locales) {
  report.locales = {};
  const initial = new Set(Object.keys(ROUTE_MODULES).flatMap(r =>
    budget.routes[r] ? closure(['index.html', ...ROUTE_MODULES[r], ...STARTUP_MODULES]).js : []));
  for (const l of LAZY_LOCALES) {
    const key = localeModule(l);
    if (!manifest[key]) {
      failures.push(`idioma ${l}: ${key} no es un chunk aparte (¿import estático de todos los idiomas?)`);
      continue;
    }
    const c = closure([key]);
    const own = c.js.filter(f => !initial.has(f));
    const g = total(own, 'gzip');
    report.locales[l] = { files: own, gzipKB: Number(kb(g)) };
    console.log(`\n[idioma ${l}] +${kb(g)} KB gzip (límite ${budget.locales.maxGzipKB} KB): ${own.join(', ')}`);
    if (g / 1024 > budget.locales.maxGzipKB) failures.push(`idioma ${l}: ${kb(g)} KB gzip > ${budget.locales.maxGzipKB} KB`);
    for (const f of initial) {
      if ((chunkModules[f] ?? []).some(m => m.startsWith(`src/i18n/locales/${l}/`))) {
        failures.push(`idioma ${l}: está en el JS inicial (${f})`);
      }
    }
  }
}

// ── Assets con límite (fuente de iconos, etc.) ─
const assetFiles = readdirSync(join(DIST, 'assets'));
for (const rule of budget.assets ?? []) {
  const re = new RegExp(rule.pattern);
  const matches = assetFiles.filter(f => re.test(f));
  if (rule.required && matches.length === 0) {
    failures.push(`asset /${rule.pattern}/ no encontrado en dist/assets`);
  }
  for (const f of matches) {
    const bytes = statSync(join(DIST, 'assets', f)).size;
    report.assets[f] = Number(kb(bytes));
    console.log(`\n[asset] ${f}: ${kb(bytes)} KB (límite ${rule.maxKB} KB)`);
    if (bytes / 1024 > rule.maxKB) failures.push(`asset ${f}: ${kb(bytes)} KB > ${rule.maxKB} KB`);
  }
}

// ── Precache del service worker ────────────────
// Lo que un móvil descarga al instalar la PWA (datos prepago): que no se cuelen
// informes, mocks ni chunks grandes que no hacen falta offline.
if (budget.precache) {
  const sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
  // Sin repetir: workbox descarga cada URL una vez aunque salga dos veces en la lista
  const urls = [...new Set([...sw.matchAll(/url:"([^"]+)"/g)].map(m => m[1]))];
  let bytes = 0;
  for (const u of urls) {
    try {
      bytes += statSync(join(DIST, u)).size;
    } catch {
      failures.push(`precache: ${u} no existe en dist/`);
    }
  }
  report.precache = { entries: urls.length, KB: Number(kb(bytes)) };
  console.log(`\n[precache] ${urls.length} entradas, ${kb(bytes)} KB sin comprimir (límite ${budget.precache.maxKB} KB)`);
  if (bytes / 1024 > budget.precache.maxKB) {
    failures.push(`precache: ${kb(bytes)} KB > ${budget.precache.maxKB} KB`);
  }
  for (const pattern of budget.precache.forbidden ?? []) {
    const re = new RegExp(pattern);
    const hits = urls.filter(u => re.test(u));
    if (hits.length) failures.push(`precache incluye ${hits.join(', ')} (prohibido: /${pattern}/)`);
  }
  for (const pattern of budget.precache.required ?? []) {
    const re = new RegExp(pattern);
    if (!urls.some(u => re.test(u))) failures.push(`precache no incluye /${pattern}/ (necesario offline)`);
  }
}

if (SHOW_ALL) {
  console.log('\n[todos los chunks JS] gzip / brotli / crudo (KB)');
  const all = Object.values(manifest)
    .map(e => e.file)
    .filter((f, i, arr) => f.endsWith('.js') && arr.indexOf(f) === i)
    .map(f => ({ f, ...sizes(f) }))
    .sort((a, b) => b.gzip - a.gzip);
  for (const x of all) {
    console.log(`  ${kb(x.gzip).padStart(7)} ${kb(x.brotli).padStart(7)} ${kb(x.raw).padStart(8)}  ${x.f}`);
  }
}

if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));

if (failures.length) {
  console.error('\n✗ Presupuesto de rendimiento superado:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\n✓ Presupuesto de rendimiento OK');
