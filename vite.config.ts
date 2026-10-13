import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'apple-touch-icon.png',
          'favicon-32x32.png',
          'favicon-16x16.png',
        ],
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
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
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
              // Ficheros de fuentes (iconos incluidos): sin esto, sin red los iconos
              // salen como texto ("local_shipping") cuando caduca la caché HTTP
              urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                cacheableResponse: { statuses: [0, 200] },
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
            {
              urlPattern: ({ url }) => url.origin.includes('googleapis.com'),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts-stylesheets',
                cacheableResponse: { statuses: [0, 200] },
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
      rollupOptions: {
        // Capacitor plugins are native-only — never bundle them for web
        external: ['@capacitor-community/barcode-scanner'],
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
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
