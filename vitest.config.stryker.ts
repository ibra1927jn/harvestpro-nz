import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config';

// Config para mutation testing: solo ejecuta los tests indicados en STRYKER_TESTS
// (lista separada por comas) para que cada ejecucion sea corta.
// No usar mergeConfig: concatena los arrays de include y acabaria ejecutando toda la suite.
const tests = (process.env.STRYKER_TESTS ?? '')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean);

if (tests.length === 0) {
  throw new Error('STRYKER_TESTS is required (comma-separated test files)');
}

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: tests,
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
  },
});
