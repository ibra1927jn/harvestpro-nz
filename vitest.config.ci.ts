import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Zona horaria fija antes de crear los workers (ver vitest.config.ts)
process.env.TZ = 'Pacific/Auckland';

// CI config for GitHub Actions runners (7GB RAM)
//
// Strategy: pool 'forks' + 5 shards
//   - Forks run with separate processing, allowing OS memory reclamation
//   - jsdom location errors are handled locally in test-setup.ts
//   - 5 shards split ~365 files into ~73 per shard, reducing mass accumulation
//   - NODE_OPTIONS=--max-old-space-size=6144 set in CI workflow
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', 'tests', 'e2e'],
    testTimeout: 30_000,
    hookTimeout: 10_000,
    teardownTimeout: 5_000,
    pool: 'forks',
    // isolate debe seguir en true (por defecto): con isolate:false los módulos se
    // comparten entre archivos y los vi.mock() de un archivo no se aplican en otro.
    // (`poolOptions.forks.isolate` ya no existe en Vitest 4 y se ignoraba.)
    maxWorkers: 1,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/test-setup.ts',
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
