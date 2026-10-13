#!/usr/bin/env node
/* eslint-disable no-console -- herramienta de línea de comandos: su salida es la consola */
/**
 * check-i18n — guardia barata de traducciones (solo lee el AST con TypeScript).
 *
 *  (a) toda clave usada en código (t('...')) existe en todos los locales
 *  (b) ningún locale tiene claves que falten respecto a EN (ni claves sobrantes)
 *  (c) los placeholders ({n}, {mm}…) coinciden en todos los locales
 *  (d) textos visibles escritos a mano en JSX / toasts / aria-label / announce()
 *      que no pasan por t(). Heurística + allowlist (marcas, unidades) +
 *      baseline por archivo (trinquete: el número por archivo solo puede bajar).
 *
 * Uso:
 *   node scripts/i18n/check-i18n.mjs                 → falla (exit 1) si algo no cuadra
 *   node scripts/i18n/check-i18n.mjs --list [ruta]   → lista los textos a mano (opcional: filtra por ruta)
 *   node scripts/i18n/check-i18n.mjs --json          → resumen en JSON
 *   node scripts/i18n/check-i18n.mjs --update-baseline
 * Para ignorar un caso concreto: comentario `i18n-ignore` en la misma línea o la anterior.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..', '..');
export const BASELINE_FILE = join(HERE, 'hardcoded-baseline.json');
export const ALLOWLIST_FILE = join(HERE, 'allowlist.json');

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.stryker-tmp', '__tests__', '__mocks__', 'test', 'mocks']);
const SKIP_FILE = /\.(test|spec|stories)\.tsx?$|\.d\.ts$/;

const toPosix = (p) => p.split(sep).join('/');

function walk(dir, filter, out = []) {
    if (!existsSync(dir)) return out;
    for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, filter, out);
        else if (filter(p)) out.push(p);
    }
    return out;
}

function parse(file, text) {
    const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
}

// ─── Locales ─────────────────────────────────────────────────────────

const propName = (n) => {
    if (!n) return undefined;
    if (ts.isStringLiteral(n) || ts.isIdentifier(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
    return undefined;
};

/** Claves 'a.b': 'valor' de un archivo de locale (solo propiedades con texto literal). */
export function extractDictFromSource(text, file = 'locale.ts') {
    const sf = parse(file, text);
    const dict = {};
    const nonLiteral = [];
    let spreads = 0;
    const visit = (n) => {
        if (ts.isObjectLiteralExpression(n)) {
            for (const p of n.properties) {
                if (ts.isSpreadAssignment(p)) { spreads++; continue; }
                if (!ts.isPropertyAssignment(p)) continue;
                const key = propName(p.name);
                if (key === undefined || !key.includes('.')) continue;
                const init = p.initializer;
                if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) dict[key] = init.text;
                else nonLiteral.push(key);
            }
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return { dict, nonLiteral, spreads };
}

/** Lee src/i18n/locales/<lang>/*.ts → { lang: {key: value} } (claves propias, sin heredar). */
export function loadLocales(localesDir = join(ROOT, 'src/i18n/locales')) {
    const out = {};
    const spreads = {};
    for (const lang of readdirSync(localesDir)) {
        const dir = join(localesDir, lang);
        if (!statSync(dir).isDirectory()) continue;
        out[lang] = {};
        spreads[lang] = 0;
        for (const file of walk(dir, (p) => p.endsWith('.ts') && !SKIP_FILE.test(p))) {
            const r = extractDictFromSource(readFileSync(file, 'utf8'), file);
            Object.assign(out[lang], r.dict);
            // Solo se cuentan claves literales: un `...en` no hace pasar claves que faltan
            spreads[lang] += r.spreads;
        }
    }
    return { locales: out, spreads };
}

export function placeholders(value) {
    return [...new Set(value.match(/\{[A-Za-z_][A-Za-z0-9_]*\}/g) ?? [])].sort();
}

/** (b) + (c): claves que faltan / sobran por locale y placeholders distintos de EN. */
export function compareLocales(locales, base = 'en') {
    const en = locales[base] ?? {};
    const enKeys = Object.keys(en);
    const missing = {};
    const extra = {};
    const placeholderMismatch = [];
    const empty = [];
    for (const [lang, dict] of Object.entries(locales)) {
        for (const [k, v] of Object.entries(dict)) if (v.trim() === '') empty.push({ lang, key: k });
        if (lang === base) continue;
        missing[lang] = enKeys.filter((k) => !(k in dict));
        extra[lang] = Object.keys(dict).filter((k) => !(k in en));
        for (const k of enKeys) {
            if (!(k in dict)) continue;
            const a = placeholders(en[k]).join(',');
            const b = placeholders(dict[k]).join(',');
            if (a !== b) placeholderMismatch.push({ lang, key: k, expected: a, actual: b });
        }
    }
    return { missing, extra, placeholderMismatch, empty };
}

// ─── Código ──────────────────────────────────────────────────────────

const T_NAMES = new Set(['t', 'translate', 'tr']);

/** (a) claves t('…') y prefijos dinámicos t(`x.${y}`) usados en un archivo. */
export function extractUsedKeys(text, file = 'file.tsx') {
    const sf = parse(file, text);
    const keys = [];
    const dynamic = [];
    const visit = (n) => {
        if (ts.isCallExpression(n) && n.arguments.length > 0) {
            const c = n.expression;
            const name = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : undefined;
            const isI18nService = ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression) && c.expression.text === 'i18n';
            if (name && T_NAMES.has(name) && !isI18nService) {
                const a = n.arguments[0];
                const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
                if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) {
                    if (/^[a-z][\w-]*(\.[\w-]+)+$/i.test(a.text)) keys.push({ key: a.text, line });
                } else if (ts.isTemplateExpression(a)) {
                    dynamic.push({ prefix: a.head.text, line });
                }
            }
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return { keys, dynamic };
}

// Atributos / props que acaban en pantalla o en el lector de pantalla
const TEXT_ATTRS = new Set([
    'aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'aria-placeholder',
    'title', 'placeholder', 'alt', 'label', 'subtitle', 'description', 'message', 'emptyMessage',
    'emptyText', 'emptyTitle', 'helperText', 'confirmLabel', 'cancelLabel', 'confirmText', 'cancelText',
    'tooltip', 'heading', 'actionLabel', 'buttonLabel', 'srText', 'announcement', 'hint', 'ariaLabel',
    'loadingText', 'errorText', 'sublabel', 'subLabel', 'badge', 'unit',
]);
const TEXT_PROPS = new Set([
    'label', 'title', 'subtitle', 'description', 'desc', 'message', 'placeholder', 'text', 'emptyMessage',
    'hint', 'tooltip', 'heading', 'ariaLabel', 'announcement', 'sublabel', 'subLabel', 'detail', 'body',
    'confirmLabel', 'cancelLabel', 'actionLabel', 'reason',
]);
const CALL_NAMES = new Set(['showToast', 'addToast', 'setToast', 'announce', 'notify', 'alert', 'confirm', 'prompt']);
const SETTER = /^set(Error|Success|Message|Warning|Notice|Info|Toast|StatusMessage|Feedback|Hint)\w*$/;
const TOAST_METHODS = new Set(['success', 'error', 'info', 'warning', 'warn']);
// Funciones cuyo texto (nombre accesible) va en otro argumento
const LABEL_ARG = { buttonLike: 1 };

/** Textos literales que un expression aporta a la UI (sin entrar en args de llamadas ni condiciones). */
function collectText(expr, out) {
    if (!expr) return;
    if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isNonNullExpression(expr)) return collectText(expr.expression, out);
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) { out.push({ node: expr, text: expr.text }); return; }
    if (ts.isTemplateExpression(expr)) {
        const parts = [expr.head.text, ...expr.templateSpans.map((s) => s.literal.text)].join(' ');
        out.push({ node: expr, text: parts });
        for (const s of expr.templateSpans) collectText(s.expression, out);
        return;
    }
    if (ts.isConditionalExpression(expr)) { collectText(expr.whenTrue, out); collectText(expr.whenFalse, out); return; }
    if (ts.isBinaryExpression(expr)) {
        const k = expr.operatorToken.kind;
        if (k === ts.SyntaxKind.PlusToken || k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) {
            collectText(expr.left, out); collectText(expr.right, out);
        } else if (k === ts.SyntaxKind.AmpersandAmpersandToken) collectText(expr.right, out);
    }
}

const HAS_WORD = /\p{L}{2,}/u;
// Identificadores / claves / clases: no son texto para personas
const CODE_LIKE = [
    /^[a-z][a-z0-9]*([_.:/-][a-z0-9]+)+$/i,  // snake / dot / kebab / rutas
    /^[A-Z0-9]+(_[A-Z0-9]+)+$/,              // CONSTANTES
    /^(https?:|mailto:|tel:|\/|#|data:)/,     // urls
    /^[\w.+-]+@[\w-]+\.[\w.]+$/,              // emails
];

export function isUserText(raw, allow) {
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text || !HAS_WORD.test(text)) return false;
    if (CODE_LIKE.some((r) => r.test(text))) return false;
    if (allow.exact.has(text)) return false;
    // Quitando marcas/unidades permitidas, ¿queda alguna palabra?
    let rest = ` ${text} `;
    for (const w of allow.words) rest = rest.split(w).join(' ');
    return HAS_WORD.test(rest);
}

export function loadAllowlist(file = ALLOWLIST_FILE) {
    const j = JSON.parse(readFileSync(file, 'utf8'));
    // Las más largas primero para que 'HarvestPro NZ' gane a 'NZ'
    const words = [...(j.words ?? [])].sort((a, b) => b.length - a.length).map((w) => w);
    return { exact: new Set(j.exact ?? []), words, ignoreFiles: j.ignoreFiles ?? [] };
}

/** (d) textos visibles escritos a mano en un archivo. */
export function findHardcoded(text, file, allow) {
    const sf = parse(file, text);
    const lines = text.split('\n');
    const isTsx = file.endsWith('.tsx');
    const findings = [];
    // i18n-ignore en la línea del texto o en la anterior (para texto JSX: desde la etiqueta que lo abre)
    const ignored = (node) => {
        const from = sf.getLineAndCharacterOfPosition(node.pos).line - 1;
        const to = sf.getLineAndCharacterOfPosition(node.getStart()).line;
        for (let l = Math.max(0, from); l <= to; l++) if (/i18n-ignore/.test(lines[l] ?? '')) return true;
        return false;
    };
    const add = (node, raw, kind) => {
        if (!isUserText(raw, allow) || ignored(node)) return;
        const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        findings.push({ file, line, kind, text: raw.replace(/\s+/g, ' ').trim().slice(0, 80) });
    };
    const addExpr = (expr, kind) => { const o = []; collectText(expr, o); for (const x of o) add(x.node, x.text, kind); };

    // Ligaduras de la fuente de iconos (<span className="material-symbols-outlined">close</span>)
    const isIconText = (n) => {
        const el = n.parent;
        if (!el || !ts.isJsxElement(el)) return false;
        const attrs = el.openingElement.attributes.properties;
        const get = (name) => attrs.find((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === name);
        const cls = get('className');
        const clsText = cls?.initializer ? cls.initializer.getText(sf) : '';
        if (/material-(symbols|icons)/.test(clsText)) return true;
        const hidden = get('aria-hidden');
        return !!hidden && /^[a-z_]+$/.test(n.getText(sf).trim());
    };
    const visit = (n) => {
        if (ts.isJsxText(n)) { if (!isIconText(n)) add(n, n.text, 'jsx-text'); }
        else if (ts.isJsxExpression(n) && n.expression && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) { if (!isIconText(n)) addExpr(n.expression, 'jsx-expr'); }
        else if (ts.isJsxAttribute(n)) {
            const name = n.name.getText(sf);
            if (TEXT_ATTRS.has(name) && n.initializer) {
                if (ts.isStringLiteral(n.initializer)) add(n.initializer, n.initializer.text, `attr:${name}`);
                else if (ts.isJsxExpression(n.initializer) && n.initializer.expression) addExpr(n.initializer.expression, `attr:${name}`);
            }
        } else if (ts.isCallExpression(n)) {
            const c = n.expression;
            const name = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : '';
            const owner = ts.isPropertyAccessExpression(c) ? c.expression.getText(sf) : '';
            const isToastMethod = TOAST_METHODS.has(name) && /toast/i.test(owner);
            if (name in LABEL_ARG && n.arguments[LABEL_ARG[name]]) addExpr(n.arguments[LABEL_ARG[name]], `call:${name}`);
            else if (CALL_NAMES.has(name) || SETTER.test(name) || isToastMethod) {
                for (const a of n.arguments.slice(0, 2)) {
                    if (ts.isObjectLiteralExpression(a)) {
                        for (const p of a.properties) if (ts.isPropertyAssignment(p) && TEXT_PROPS.has(propName(p.name) ?? '')) addExpr(p.initializer, `call:${name}`);
                    } else if (ts.isArrowFunction(a)) {
                        // setError(() => 'x') es raro; no se sigue
                    } else addExpr(a, `call:${name}`);
                    // segundo arg solo si es objeto (opciones de toast)
                    if (!ts.isObjectLiteralExpression(a)) break;
                }
            }
        } else if (isTsx && ts.isPropertyAssignment(n) && TEXT_PROPS.has(propName(n.name) ?? '')) {
            // { label: 'Texto' } en configs de UI (solo .tsx)
            addExpr(n.initializer, `prop:${propName(n.name)}`);
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return findings;
}

// ─── Informe completo ────────────────────────────────────────────────

export function sourceFiles(root = ROOT) {
    return walk(join(root, 'src'), (p) => /\.tsx?$/.test(p) && !SKIP_FILE.test(p))
        .filter((p) => !toPosix(p).includes('/src/i18n/') && !toPosix(p).includes('/src/services/translations/'));
}

const UI_DIRS = /^src\/(components|pages|hooks|context|App\.tsx|routes\.tsx|index\.tsx)/;

export function runChecks({ root = ROOT, allow = loadAllowlist(), baseline } = {}) {
    const { locales, spreads } = loadLocales(join(root, 'src/i18n/locales'));
    const cmp = compareLocales(locales);
    const used = new Map();
    const dynamic = [];
    const hardcoded = [];
    for (const abs of sourceFiles(root)) {
        const rel = toPosix(relative(root, abs));
        const text = readFileSync(abs, 'utf8');
        const u = extractUsedKeys(text, rel);
        for (const k of u.keys) { if (!used.has(k.key)) used.set(k.key, []); used.get(k.key).push(`${rel}:${k.line}`); }
        for (const d of u.dynamic) dynamic.push({ ...d, file: rel });
        if (UI_DIRS.test(rel) && !allow.ignoreFiles.some((f) => rel.startsWith(f))) hardcoded.push(...findHardcoded(text, rel, allow));
    }
    const langs = Object.keys(locales);
    const unknownKeys = [];
    for (const [key, where] of used) {
        const missingIn = langs.filter((l) => !(key in locales[l]));
        if (missingIn.length) unknownKeys.push({ key, missingIn, where: where.slice(0, 3) });
    }
    const enKeys = Object.keys(locales.en ?? {});
    const badDynamic = dynamic.filter((d) => d.prefix && !enKeys.some((k) => k.startsWith(d.prefix)));
    const perFile = {};
    for (const f of hardcoded) perFile[f.file] = (perFile[f.file] ?? 0) + 1;
    const regressions = [];
    if (baseline) {
        for (const [file, n] of Object.entries(perFile)) if (n > (baseline[file] ?? 0)) regressions.push({ file, count: n, allowed: baseline[file] ?? 0 });
    }
    return {
        languages: langs,
        keyCount: Object.fromEntries(langs.map((l) => [l, Object.keys(locales[l]).length])),
        spreads, ...cmp, unknownKeys, badDynamic, dynamic, hardcoded, perFile, regressions,
        unusedEnKeys: enKeys.filter((k) => !used.has(k) && !dynamic.some((d) => d.prefix && k.startsWith(d.prefix))),
    };
}

export function failures(r) {
    const f = [];
    for (const u of r.unknownKeys) f.push(`clave usada en código sin traducir en [${u.missingIn.join(',')}]: ${u.key} (${u.where.join(', ')})`);
    for (const [l, ks] of Object.entries(r.missing)) for (const k of ks) f.push(`locale ${l}: falta ${k}`);
    for (const [l, ks] of Object.entries(r.extra)) for (const k of ks) f.push(`locale ${l}: clave que no existe en en: ${k}`);
    for (const p of r.placeholderMismatch) f.push(`locale ${p.lang}: placeholders de ${p.key} = [${p.actual}] (en: [${p.expected}])`);
    for (const e of r.empty) f.push(`locale ${e.lang}: valor vacío en ${e.key}`);
    for (const d of r.badDynamic) f.push(`t(\`${d.prefix}\${…}\`) sin ninguna clave con ese prefijo (${d.file}:${d.line})`);
    for (const g of r.regressions) f.push(`${g.file}: ${g.count} textos sin t() (máximo permitido ${g.allowed}); usa t() o i18n-ignore`);
    return f;
}

// ─── CLI ─────────────────────────────────────────────────────────────

function main(argv) {
    const baseline = existsSync(BASELINE_FILE) ? JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) : {};
    const r = runChecks({ baseline });
    if (argv.includes('--update-baseline')) {
        const sorted = Object.fromEntries(Object.entries(r.perFile).sort(([a], [b]) => a.localeCompare(b)));
        writeFileSync(BASELINE_FILE, JSON.stringify(sorted, null, 2) + '\n');
        console.log(`baseline: ${r.hardcoded.length} textos en ${Object.keys(sorted).length} archivos`);
        return 0;
    }
    const li = argv.indexOf('--list');
    if (li >= 0) {
        const filter = argv[li + 1] && !argv[li + 1].startsWith('--') ? argv[li + 1] : '';
        for (const h of r.hardcoded.filter((x) => x.file.includes(filter))) console.log(`${h.file}:${h.line}\t${h.kind}\t${h.text}`);
        return 0;
    }
    const summary = {
        languages: r.languages,
        keys: r.keyCount,
        missingVsEn: Object.fromEntries(Object.entries(r.missing).map(([l, k]) => [l, k.length])),
        extraVsEn: Object.fromEntries(Object.entries(r.extra).map(([l, k]) => [l, k.length])),
        placeholderMismatches: r.placeholderMismatch.length,
        keysUsedButUntranslated: r.unknownKeys.length,
        keysUsedButNotInEn: r.unknownKeys.filter((u) => u.missingIn.includes('en')).length,
        hardcoded: r.hardcoded.length,
        hardcodedFiles: Object.keys(r.perFile).length,
        unusedEnKeys: r.unusedEnKeys.length,
    };
    if (argv.includes('--json')) { console.log(JSON.stringify(summary, null, 2)); return 0; }
    const f = failures(r);
    console.log(`i18n: ${JSON.stringify(summary)}`);
    if (f.length) {
        console.error(f.slice(0, 200).join('\n'));
        if (f.length > 200) console.error(`… y ${f.length - 200} más`);
        console.error(`\n✗ check-i18n: ${f.length} problemas`);
        return 1;
    }
    console.log('✓ check-i18n OK');
    return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
