/**
 * Vitest config para integration tests — usa entorno Node, no jsdom.
 * Los integration tests golpean Supabase local real, sin mocks.
 *
 * Ejecutar: npm run test:integration
 * Necesita `supabase start` y, para los de src/integration, SUPABASE_SERVICE_ROLE_KEY
 * (sin ella esos se saltan). `npm test` los excluye (INTEGRATION_TESTS en vitest.config.ts).
 */
import { defineConfig } from 'vitest/config';
import path from 'path';
import { INTEGRATION_TESTS } from './vitest.config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',   // No jsdom — fetch real a localhost
        setupFiles: [],         // Sin test-setup.ts — sin mocks, sin fake-indexeddb
        include: INTEGRATION_TESTS,
        testTimeout: 30_000,
        hookTimeout: 30_000,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
