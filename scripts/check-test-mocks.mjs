#!/usr/bin/env node
/**
 * Guard: los vi.mock() de los tests deben poder aplicarse.
 *
 * Vitest carga los setupFiles ANTES que cada archivo de test. Si un setup importa
 * módulos de la app, esos módulos (y sus dependencias) ya están evaluados cuando
 * el test registra sus vi.mock(), y el mock se ignora en silencio para ellos.
 *
 * Comprueba (análisis estático, no ejecuta tests):
 *  1. Los setupFiles no importan (transitivamente) ningún módulo de src/.
 *  2. Ningún test hace vi.mock()/vi.doMock() de un módulo que ya cargó el setup.
 *  3. Ningún vitest.config*.ts desactiva `isolate` (los módulos se compartirían entre archivos).
 *
 * Uso: npm run test:mock-guard   (sale con 1 si hay problemas)
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const SRC = join(ROOT, 'src');
const SETUP_FILES = ['src/test-setup.ts'].map((f) => join(ROOT, f));
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.stryker-tmp', 'e2e', '.git']);
const EXTS = ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx'];

function resolveSpec(spec, fromFile) {
    let base;
    if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
    else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
    else return null; // paquete de node_modules: no es código de la app
    for (const ext of EXTS) {
        const p = base + ext;
        if (existsSync(p) && statSync(p).isFile()) return p;
    }
    return null;
}

function parse(file) {
    const src = readFileSync(file, 'utf8');
    return ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

// Imports estáticos que sobreviven a la compilación (ignora `import type` y los dinámicos)
function staticImports(sf) {
    const out = [];
    for (const st of sf.statements) {
        if (ts.isImportDeclaration(st)) {
            const c = st.importClause;
            if (c?.isTypeOnly) continue;
            const named = c?.namedBindings;
            if (c && !c.name && named && ts.isNamedImports(named) && named.elements.length > 0 && named.elements.every((e) => e.isTypeOnly)) continue;
            out.push(st.moduleSpecifier.text);
        } else if (ts.isExportDeclaration(st) && st.moduleSpecifier && !st.isTypeOnly) {
            out.push(st.moduleSpecifier.text);
        }
    }
    return out;
}

// Primer argumento literal de vi.mock / vi.doMock
function mockTargets(sf) {
    const out = [];
    const visit = (n) => {
        if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
            && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === 'vi'
            && ['mock', 'doMock'].includes(n.expression.name.text)) {
            const a = n.arguments[0];
            if (a && ts.isStringLiteralLike(a)) out.push({ spec: a.text, line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1 });
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return out;
}

// 1. Cierre transitivo de los setupFiles (los módulos que el setup mockea no se recorren)
const preloaded = new Set();
for (const setup of SETUP_FILES) {
    const sf = parse(setup);
    const mockedBySetup = new Set(mockTargets(sf).map((m) => resolveSpec(m.spec, setup)).filter(Boolean));
    const stack = staticImports(sf).map((s) => resolveSpec(s, setup)).filter(Boolean);
    while (stack.length) {
        const f = stack.pop();
        if (preloaded.has(f) || mockedBySetup.has(f) || SETUP_FILES.includes(f)) continue;
        preloaded.add(f);
        for (const s of staticImports(parse(f))) {
            const r = resolveSpec(s, f);
            if (r) stack.push(r);
        }
    }
}

// 2. Tests que mockean algo ya precargado
function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(test|spec)\.tsx?$/.test(name)) out.push(p);
    }
    return out;
}
const offenders = [];
for (const file of [...walk(SRC), ...(existsSync(join(ROOT, 'tests')) ? walk(join(ROOT, 'tests')) : [])]) {
    const sf = parse(file);
    const hits = mockTargets(sf).filter((m) => preloaded.has(resolveSpec(m.spec, file)));
    if (hits.length) offenders.push(`${relative(ROOT, file)}: ${hits.map((h) => `${h.spec} (l.${h.line})`).join(', ')}`);
}

// 3. isolate:false comparte la caché de módulos entre archivos de test
const noIsolate = readdirSync(ROOT).filter((f) => /^vitest\.config.*\.[cm]?[jt]s$/.test(f))
    .filter((f) => /\bisolate\s*:\s*false\b/.test(readFileSync(join(ROOT, f), 'utf8').replace(/\/\/.*$/gm, '')));

const rel = (f) => relative(ROOT, f);
process.stdout.write(`check-test-mocks: setup preloads ${preloaded.size} app module(s); ${offenders.length} test file(s) mock a preloaded module\n`);
if (preloaded.size > 0 || offenders.length > 0 || noIsolate.length > 0) {
    if (noIsolate.length) console.error(`\nVitest configs with isolate: false (mocks leak between files): ${noIsolate.join(', ')}`);
    if (preloaded.size) console.error(`\nApp modules loaded by the setup files (move them out of the global setup):\n  ${[...preloaded].map(rel).sort().join('\n  ')}`);
    if (offenders.length) console.error(`\nTest files whose vi.mock() cannot apply:\n  ${offenders.join('\n  ')}`);
    process.exit(1);
}
