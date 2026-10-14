// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const TEMP_ROOT = resolve(tmpdir());
const fixtures: string[] = [];
type Guard = 'check-test-assertions.mjs' | 'check-test-mocks.mjs';

function write(root: string, file: string, text: string) {
  const path = join(root, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function fixture() {
  // Espacios y caracteres escapados en file: URL deben seguir siendo rutas válidas.
  const root = mkdtempSync(join(TEMP_ROOT, 'harvest-guards # ñ '));
  fixtures.push(root);
  symlinkSync(join(ROOT, 'node_modules'), join(root, 'node_modules'), 'junction');
  for (const guard of ['check-test-assertions.mjs', 'check-test-mocks.mjs']) {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    copyFileSync(join(ROOT, 'scripts', guard), join(root, 'scripts', guard));
  }
  write(root, 'src/i18n/locales/index.ts', "export { default } from './en';");
  write(root, 'src/i18n/locales/en/index.ts', "export default { test: 'TEST' };");
  write(root, 'src/test-setup.ts', "import './i18n/locales';");
  write(root, 'src/example.test.ts', `
    vi.resetModules();
    vi.doMock('@/i18n/locales/index', () => ({}));
    it('checks a value', () => { expect(2 + 2).toBe(4); });
  `);
  return root;
}

function run(root: string, guard: Guard) {
  const result = spawnSync(process.execPath, [join(root, 'scripts', guard)], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    // Verificar el destino antes de borrar recursivamente el fixture temporal.
    expect(dirname(root)).toBe(TEMP_ROOT);
    rmSync(root, { recursive: true, force: true });
  }
});

describe('test guards CLI', () => {
  it('accepts valid tests and locale doMock after resetModules from an escaped file URL', () => {
    const root = fixture();
    for (const guard of ['check-test-assertions.mjs', 'check-test-mocks.mjs'] as const) {
      const result = run(root, guard);
      expect(result.status, result.output).toBe(0);
    }
  });

  it('rejects a test without assertions', () => {
    const root = fixture();
    write(root, 'src/invalid.test.ts', "it('has no assertion', () => { const value = 1; });");
    const result = run(root, 'check-test-assertions.mjs');
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain('no assertion');
    expect(result.output).toContain('invalid.test.ts');
  });

  it('rejects preloaded application modules and their mocks outside the locale directory', () => {
    const root = fixture();
    write(root, 'src/i18n/locales-extra/index.ts', 'export const value = 1;');
    write(root, 'src/test-setup.ts', "import './i18n/locales-extra';");
    write(root, 'src/example.test.ts', `
      vi.mock('@/i18n/locales-extra/index', () => ({}));
      it('checks a value', () => { expect(2 + 2).toBe(4); });
    `);
    const result = run(root, 'check-test-mocks.mjs');
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain('App modules loaded by the setup files');
    expect(result.output).toContain('example.test.ts: @/i18n/locales-extra/index');
  });
});
