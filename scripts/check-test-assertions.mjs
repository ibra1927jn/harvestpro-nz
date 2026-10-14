#!/usr/bin/env node
/**
 * Falla si hay tests que no pueden fallar:
 *  - it()/test() sin ninguna aserción (expect, assert, fc.assert, .rejects/.resolves)
 *  - expect(true).toBe(true) y similares
 *  - try { ... } catch { expect(true)... } (pasa pase lo que pase)
 *
 * Barato (solo lee el AST con TypeScript, no ejecuta tests). Uso: npm run test:assertions
 * Cubre todo src/ (src/integration incluido). e2e/ y tests/ van aparte.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.stryker-tmp']);

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.test\.tsx?$/.test(name)) out.push(p);
    }
    return out;
}

const ASSERT = /\bexpect(\.soft|\.poll)?\s*\(|\bassert\b|fc\.assert|expectTypeOf|\.rejects|\.resolves/;
// Helpers locales con aserciones dentro: expectX(...), assertX(...), checkX(...), verifyX(...)
const HELPER = /\b(expect|assert|check|verify)[A-Z]\w*\s*\(/;
const TRIVIAL = /expect\((true|false|1)\)\.(toBe|toEqual|toBeTruthy|toBeFalsy)\((true|false|1)?\)/;
const SWALLOW = /catch\s*(\([^)]*\))?\s*\{[^}]*expect\(true\)/;

const problems = [];
for (const file of walk(join(ROOT, 'src'))) {
    const src = readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (n) => {
        if (ts.isCallExpression(n)) {
            const callee = n.expression;
            const name = ts.isIdentifier(callee) ? callee.text
                : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) ? callee.expression.text : '';
            const fn = n.arguments[1];
            const isSkip = ts.isPropertyAccessExpression(callee) && ['skip', 'todo'].includes(callee.name.text);
            if ((name === 'it' || name === 'test') && !isSkip && fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
                const body = fn.body.getText(sf);
                const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
                const where = `${relative(ROOT, file)}:${line} ${n.arguments[0].getText(sf).slice(0, 70)}`;
                if (!ASSERT.test(body) && !HELPER.test(body)) problems.push(`no assertion  ${where}`);
                else if (TRIVIAL.test(body)) problems.push(`trivial       ${where}`);
                else if (SWALLOW.test(body)) problems.push(`swallowed     ${where}`);
            }
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);
}

if (problems.length > 0) {
    console.error(`Tests that cannot fail (${problems.length}):\n  ${problems.join('\n  ')}`);
    process.exit(1);
}
process.stdout.write('check-test-assertions: OK\n');
