// Mutation testing (Stryker). Ejecutar por modulo para que sea rapido:
//   STRYKER_TESTS=src/utils/nzst.test.ts npm run test:mutation -- --mutate src/utils/nzst.ts
// STRYKER_TESTS limita los tests que corre vitest (ver vitest.config.stryker.ts).
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.stryker.ts', related: false },
  plugins: ['@stryker-mutator/vitest-runner'],
  concurrency: 1,
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress', 'json'],
  jsonReporter: { fileName: process.env.STRYKER_REPORT ?? 'reports/mutation/mutation.json' },
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
  timeoutMS: 20000,
  thresholds: { high: 80, low: 60, break: null },
  ignorePatterns: [
    'android', 'docs', 'evidencias', 'e2e', 'tests', 'coverage', 'dist',
    'reports', 'supabase', 'sql', '*.txt', '*.md', 'public',
  ],
};
