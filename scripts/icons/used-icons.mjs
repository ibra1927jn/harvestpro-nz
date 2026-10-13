/**
 * Detecta los nombres de Material Symbols que usa el código.
 *
 * Recorre con el compilador de TypeScript todos los literales de texto (strings,
 * templates y texto JSX) de src/ (sin tests ni stories), los trocea en palabras
 * `[a-z0-9_]+` y se queda con las que son nombres de icono reales. Es un
 * superconjunto (p. ej. 'close' también es una palabra normal), lo que solo
 * añade algún glifo de más; a cambio cubre iconos dinámicos como
 * `icon: 'groups'` o `{ok ? 'check' : 'close'}`.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..', '..');
export const NAMES_FILE = join(HERE, 'material-symbols-names.txt');
export const FONT_FILE = join(ROOT, 'src', 'assets', 'fonts', 'material-symbols-subset.woff2');
export const FONT_MANIFEST = join(ROOT, 'src', 'assets', 'fonts', 'material-symbols-subset.json');

const SKIP_FILE = /(\.test\.|\.spec\.|\.stories\.|\.d\.ts$)/;
const SKIP_DIR = new Set(['__tests__', 'stories', 'mocks', 'test', 'tests']);

export function knownIconNames() {
  return new Set(
    readFileSync(NAMES_FILE, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
  );
}

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIR.has(name)) yield* sourceFiles(full);
    } else if (/\.(tsx?|jsx?)$/.test(name) && !SKIP_FILE.test(name)) {
      yield full;
    }
  }
}

function literalTexts(file) {
  const code = readFileSync(file, 'utf8');
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, false, kind);
  const out = [];
  const visit = node => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      out.push(node.text);
    } else if (ts.isJsxText(node)) {
      out.push(node.getText(sf));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/**
 * @returns {{ names: string[], where: Map<string, string[]> }} nombres usados
 *   (ordenados) y en qué ficheros aparece cada uno.
 */
export function collectUsedIcons(srcDir = join(ROOT, 'src')) {
  const known = knownIconNames();
  const where = new Map();
  for (const file of sourceFiles(srcDir)) {
    for (const text of literalTexts(file)) {
      for (const word of text.match(/[a-z0-9_]+/g) ?? []) {
        if (!known.has(word)) continue;
        const rel = relative(ROOT, file);
        const list = where.get(word) ?? [];
        if (!list.includes(rel)) list.push(rel);
        where.set(word, list);
      }
    }
  }
  return { names: [...where.keys()].sort(), where };
}
