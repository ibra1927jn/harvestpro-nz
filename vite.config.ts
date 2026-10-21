import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';
import { checkIconSubset } from './scripts/icons/check-icons.mjs';
import { routePreloadPlugin } from './scripts/route-preload.mjs';
import { compactLocalesPlugin } from './scripts/i18n/compact-locales.mjs';

/** Falla el build si el código usa un icono que no está en la fuente subconjunto. */
function iconSubsetGuard(): Plugin {
  return {
    name: 'icon-subset-guard',
    // Solo en build (~4 s analizando src/); en dev no retrasa el arranque
    apply: 'build',
    buildStart() {
      const r = checkIconSubset();
      if (!r.ok) {
        this.error(`Fuente de iconos desactualizada (npm run icons:build):\n  - ${r.problems.join('\n  - ')}`);
      }
    },
  };
}

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      iconSubsetGuard(),
      routePreloadPlugin(),
      // Idiomas sin repetir las claves en cada chunk (solo build)
      compactLocalesPlugin(),
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        // favicon/iconos ya entran por globPatterns: includeAssets e includeManifestIcons
        // los volvían a añadir y salían duplicados en el precache
        includeManifestIcons: false,
        manifest: {
          name: 'HarvestPro NZ',
          short_name: 'HarvestPro',
          description: 'Harvest workforce management platform for New Zealand orchards',
          theme_color: '#16a34a',
          background_color: '#1a1a2e',
          // Antes en public/manifest.json (había dos manifests y solo valía el primero)
          start_url: '/',
          display: 'standalone',
          orientation: 'portrait-primary',
          categories: ['business', 'productivity'],
          icons: [
            {
              src: '/icons/icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: '/icons/icon-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable',
            },
            {
              src: '/icons/icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          // woff2: fuentes autoalojadas (Inter + iconos) precacheadas → arranque offline con iconos
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          globIgnores: [
            // informe del bundle (rollup-plugin-visualizer), ~700 KB: no es parte de la app
            'stats.html',
            // MSW solo existe en modo mock
            'mockServiceWorker.js',
            // imagen del hero de login de escritorio (oculta en móvil): caché en tiempo de ejecución
            'orchard-hero.png',
            // Sentry/PostHog se cargan tras la primera interacción y solo si están
            // configurados: no gastar ~200 KB de datos en la instalación del SW
            'assets/vendor-sentry-*.js',
            'assets/vendor-analytics-*.js',
            // RRHH es trabajo de oficina con conexión (escrituras directas, sin cola
            // offline): sus pantallas no se descargan al instalar la PWA en el móvil
            // de campo; se cachean la primera vez que se abren (CacheFirst abajo)
            'assets/HHRR-*.js',
            'assets/EmployeesTab-*.js',
            'assets/ContractsTab-*.js',
            'assets/PayrollTab-*.js',
            'assets/DocumentsTab-*.js',
            'assets/CalendarTab-*.js',
            'assets/SeasonalPlanningTab-*.js',
            // «Mi cuenta» (foto, datos, contraseña): todo lo que hace necesita red, así que
            // no se precachea; se guarda en caché la primera vez que se abre (CacheFirst abajo)
            'assets/AccountSheet-*.js',
          ],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.origin.includes('supabase.co'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'supabase-api-cache',
                networkTimeoutSeconds: 5,
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Chunks con hash excluidos del precache: inmutables → CacheFirst
              urlPattern: ({ url, sameOrigin }) =>
                sameOrigin &&
                /^\/assets\/(vendor-(sentry|analytics)|HHRR|EmployeesTab|ContractsTab|PayrollTab|DocumentsTab|CalendarTab|SeasonalPlanningTab|AccountSheet)-[\w-]+\.js$/.test(url.pathname),
              handler: 'CacheFirst',
              options: {
                cacheName: 'deferred-vendor-chunks',
                cacheableResponse: { statuses: [200] },
                // 2 vendor + 7 de RRHH + Mi cuenta (y una versión anterior de cada uno tras un deploy)
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 },
              },
            },
            {
              urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname === '/orchard-hero.png',
              handler: 'CacheFirst',
              options: {
                cacheName: 'images',
                cacheableResponse: { statuses: [200] },
                expiration: { maxEntries: 4 },
              },
            },
          ],
        },
      }),
      visualizer({
        filename: 'dist/stats.html',
        open: false,
        gzipSize: true,
        brotliSize: true,
      }),
    ],
    build: {
      // manifest.json: lo usa scripts/perf-budget.mjs para calcular el JS inicial por ruta
      manifest: true,
      rollupOptions: {
        // Capacitor plugins are native-only — never bundle them for web
        external: ['@capacitor-community/barcode-scanner'],
        output: {
          // Un chunk por idioma con nombre legible (precache y perf-budget los buscan por nombre)
          chunkFileNames: chunk => {
            const m = /\/src\/i18n\/locales\/([a-z]{2})\/index\.ts$/.exec(chunk.facadeModuleId ?? '');
            return m ? `assets/locale-${m[1]}-[hash].js` : 'assets/[name]-[hash].js';
          },
          manualChunks: {
            // react-dom/client y scheduler iban en el chunk index (cambia en cada deploy)
            'vendor-react': ['react', 'react-dom', 'react-dom/client', 'react-router-dom', 'scheduler'],
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-state': ['zustand', 'dexie', '@tanstack/react-query'],
            // Split Sentry and PostHog into separate chunks — each lazy-loaded independently
            // This reduces the initial JS payload by ~400KB on first load
            'vendor-sentry': ['@sentry/react'],
            'vendor-analytics': ['posthog-js'],
          },
        },
      },
    },
    optimizeDeps: {
      // Exclude native Capacitor plugins from Vite's pre-bundling
      exclude: ['@capacitor-community/barcode-scanner'],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // QA-4 FIX: Vitest coverage configuration
    // Run: npm run test:coverage to generate coverage report
    test: {
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov'],
        reportsDirectory: './coverage',
        exclude: [
          'src/types/database.types.ts', // Generated — not hand-written
          'src/stories/**',
          '**/*.test.ts',
          '**/*.test.tsx',
          '**/__tests__/**',
          'src/config/sentry.ts', // Third-party integration wrapper
        ],
        thresholds: {
          // Baseline thresholds — increase by 5% each quarter
          statements: 70,
          functions: 70,
          branches: 60,
          lines: 70,
        },
      },
    },
  };
});
