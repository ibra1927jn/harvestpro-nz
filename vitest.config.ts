import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Zona horaria fija para toda la suite (payroll/nzst dependen de ella). Se fija aquí,
// antes de crear los workers: cambiar process.env.TZ dentro de un worker thread
// (test-setup.ts) no cambia la zona de Date, y los tests dependían de la del host.
process.env.TZ = 'Pacific/Auckland';

// Tests que necesitan un Supabase local real: van en `npm run test:integration`
// (vitest.config.integration.ts), no en `npm test`.
export const INTEGRATION_TESTS = [
  'tests/integration/**',
  'src/integration/*supabase*.integration.test.ts',
  'src/integration/role-flows-sanity.integration.test.ts',
];

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    // test-env.ts primero: pone URL/clave de Supabase falsas si faltan (clon limpio sin .env)
    setupFiles: ['./src/test-env.ts', './src/test-setup.ts'],
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', 'tests/e2e', 'e2e', ...INTEGRATION_TESTS],
    testTimeout: 30_000, // 30s per test (prevents CI hangs)
    hookTimeout: 10_000, // 10s for beforeEach/afterEach
    teardownTimeout: 5_000, // 5s for cleanup after tests
    // threads usa menos memoria que forks (shared heap vs process isolation)
    pool: 'threads',
    maxWorkers: 2,
    minWorkers: 1,
    fileParallelism: false, // evita que múltiples archivos saturen la heap
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/test-setup.ts',
        'src/test-env.ts',
        'src/vite-env.d.ts',
        'src/**/*.d.ts',
        'src/**/index.ts',
        'src/**/__mocks__/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
