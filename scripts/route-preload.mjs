/**
 * Precarga por ruta: en el build se inyecta en index.html un script mínimo que,
 * según location.pathname, añade <link rel="modulepreload"> para el chunk de la
 * página y su pestaña por defecto. Sin esto el navegador solo pide el chunk de la
 * ruta después de descargar y ejecutar el bundle principal: un viaje de ida y
 * vuelta extra (~2 s en 3G) en cada arranque en frío.
 *
 * ROUTE_MODULES también lo usa scripts/perf-budget.mjs para medir el JS inicial.
 */

/** Módulos que se cargan en cualquier ruta al arrancar (lazy en src/index.tsx). */
export const STARTUP_MODULES = [
  'src/components/common/SyncStatusMonitor.tsx',
  'src/components/common/PwaInstallBanner.tsx',
];

/** Ruta → página + vista de la pestaña por defecto (roles de campo). */
export const ROUTE_MODULES = {
  '/login': ['src/pages/Login.tsx'],
  '/runner': ['src/pages/Runner.tsx', 'src/components/views/runner/LogisticsView.tsx'],
  '/team-leader': ['src/pages/TeamLeader.tsx', 'src/components/views/team-leader/HomeView.tsx'],
  '/qc': ['src/pages/QualityControl.tsx', 'src/components/views/qc/InspectTab.tsx'],
  '/manager': ['src/pages/Manager.tsx'],
  '/admin': ['src/pages/Admin.tsx'],
  '/hhrr': ['src/pages/HHRR.tsx'],
  '/logistics-dept': ['src/pages/LogisticsDept.tsx'],
  '/payroll': ['src/pages/Payroll.tsx'],
};

/** Idiomas que van en chunk aparte (src/i18n/locales/index.ts; el inglés va en el bundle). */
export const LAZY_LOCALES = ['es', 'fr'];
export const LOCALE_STORAGE_KEY = 'harvestpro_locale';
export const localeModule = l => `src/i18n/locales/${l}/index.ts`;

/**
 * @param {Record<string, import('rollup').OutputChunk | import('rollup').OutputAsset>} bundle
 * @returns {{ routes: Record<string, string[]>, locales: Record<string, string[]> }} URLs de JS a precargar
 */
export function routePreloadMap(bundle, root) {
  const chunks = Object.values(bundle).filter(c => c.type === 'chunk');
  const byModule = new Map();
  // Módulo → chunk que lo contiene (la fachada si existe; si Rollup lo fusionó, el que lo incluya)
  for (const c of chunks) {
    for (const id of Object.keys(c.modules)) {
      const rel = id.replace(`${root}/`, '');
      if (!byModule.has(rel) || c.facadeModuleId === id) byModule.set(rel, c);
    }
  }
  const byFile = new Map(chunks.map(c => [c.fileName, c]));
  const entry = chunks.find(c => c.isEntry);
  const closure = (start, acc = new Set()) => {
    for (const f of start) {
      if (acc.has(f)) continue;
      acc.add(f);
      closure(byFile.get(f)?.imports ?? [], acc);
    }
    return acc;
  };
  const already = entry ? closure([entry.fileName]) : new Set();
  const filesFor = modules => {
    const out = new Set();
    for (const m of modules) {
      const c = byModule.get(m);
      if (!c) throw new Error(`route-preload: no hay chunk para ${m}`);
      for (const f of closure([c.fileName])) if (!already.has(f)) out.add(f);
    }
    return out;
  };
  const startup = filesFor(STARTUP_MODULES);
  const routes = {};
  for (const [route, modules] of Object.entries(ROUTE_MODULES)) {
    routes[route] = [...new Set([...filesFor(modules), ...startup])].map(f => `/${f}`);
  }
  const locales = {};
  for (const l of LAZY_LOCALES) locales[l] = [...filesFor([localeModule(l)])].map(f => `/${f}`);
  return { routes, locales };
}

/**
 * Script inline de index.html: precarga los chunks de la ruta actual y del idioma
 * guardado (misma regla que getInitialLocale() en src/i18n/index.ts: localStorage,
 * si no el idioma del navegador). Así el chunk del idioma baja en paralelo con el
 * bundle principal y no retrasa el primer render.
 */
export function preloadScript({ routes, locales }) {
  return (
    `(function(r,g){function p(l){if(!l)return;for(var i=0;i<l.length;i++){var e=document.createElement('link');` +
    `e.rel='modulepreload';e.crossOrigin='';e.href=l[i];document.head.appendChild(e);}}` +
    `p(r[location.pathname]);var c=null;try{c=localStorage.getItem(${JSON.stringify(LOCALE_STORAGE_KEY)})}catch(x){}` +
    `if(!c||!(c in g)&&c!=='en'){c=(navigator.language||'').split('-')[0]}` +
    `if(Object.prototype.hasOwnProperty.call(g,c))p(g[c]);})` +
    `(${JSON.stringify(routes)},${JSON.stringify(locales)});`
  );
}

/** Plugin de Vite (solo build). */
export function routePreloadPlugin() {
  let root = process.cwd();
  return {
    name: 'route-preload',
    apply: 'build',
    configResolved(cfg) {
      root = cfg.root;
    },
    // Módulos de cada chunk (lo usa perf-budget.mjs para prohibir librerías en la ruta crítica)
    generateBundle(_opts, bundle) {
      const map = {};
      for (const c of Object.values(bundle)) {
        if (c.type !== 'chunk') continue;
        map[c.fileName] = Object.keys(c.modules).map(id => id.replace(`${root}/`, ''));
      }
      this.emitFile({ type: 'asset', fileName: '.vite/chunk-modules.json', source: JSON.stringify(map) });
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        // Rutas con barra final o mayúsculas no se precargan: solo es una optimización
        const code = preloadScript(routePreloadMap(ctx.bundle, root));
        return [{ tag: 'script', children: code, injectTo: 'head-prepend' }];
      },
    },
  };
}
