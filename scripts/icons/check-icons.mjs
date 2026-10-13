#!/usr/bin/env node
/**
 * Falla si el código usa un icono de Material Symbols que no está en la fuente
 * subconjunto, o si la fuente y su .json no coinciden (hash).
 * Lo ejecutan `npm run icons:check` (CI) y el build de Vite (plugin en vite.config.ts).
 * Arreglo: `npm run icons:build` y commitear la fuente regenerada.
 */
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { pathToFileURL } from 'url';
import { collectUsedIcons, FONT_FILE, FONT_MANIFEST } from './used-icons.mjs';

export function checkIconSubset() {
  const manifest = JSON.parse(readFileSync(FONT_MANIFEST, 'utf8'));
  const font = readFileSync(FONT_FILE);
  const sha = createHash('sha256').update(font).digest('hex');
  const inFont = new Set(manifest.names);
  const { names, where } = collectUsedIcons();
  const missing = names.filter(n => !inFont.has(n)).map(n => ({ name: n, files: where.get(n) }));
  const used = new Set(names);
  const extra = manifest.names.filter(n => !used.has(n));
  const problems = [];
  if (sha !== manifest.sha256) {
    problems.push('material-symbols-subset.woff2 no coincide con su .json (hash distinto)');
  }
  for (const m of missing) {
    problems.push(`icono "${m.name}" usado en ${m.files.join(', ')} no está en la fuente`);
  }
  return { ok: problems.length === 0, problems, missing, extra, used: names.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const r = checkIconSubset();
  if (!r.ok) {
    console.error('✗ Fuente de iconos desactualizada:');
    for (const p of r.problems) console.error(`  - ${p}`);
    console.error('  → ejecuta `npm run icons:build` (con red) y commitea src/assets/fonts/.');
    process.exit(1);
  }
  const extra = r.extra.length ? ` (${r.extra.length} sin usar: ${r.extra.join(', ')})` : '';
  console.log(`✓ ${r.used} iconos usados, todos en la fuente${extra}`);
}
