#!/usr/bin/env node
/**
 * Regenera la fuente de iconos con SOLO los glifos que usa el código.
 *
 *   npm run icons:build      (detrás de un proxy: NODE_USE_ENV_PROXY=1 npm run icons:build)
 *
 * 1. Detecta los nombres usados (scripts/icons/used-icons.mjs).
 * 2. Pide a Google Fonts el subconjunto (`icon_names=`) con los mismos ejes que
 *    antes (opsz 24, wght 400, FILL 0..1, GRAD 0) para que el aspecto sea idéntico.
 * 3. Guarda src/assets/fonts/material-symbols-subset.woff2 (autoalojada: funciona
 *    sin red y la precachea el service worker) y un .json con los nombres y el hash.
 *
 * `npm run icons:check` (CI) falla si el código usa un icono que no está en la fuente.
 */
import { writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { collectUsedIcons, FONT_FILE, FONT_MANIFEST } from './used-icons.mjs';

const AXES = 'opsz,wght,FILL,GRAD@24,400,0..1,0';
// UA de Chrome: Google solo sirve woff2 a navegadores que lo soportan
const UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

const { names } = collectUsedIcons();
const cssUrl =
  `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:${AXES}` +
  `&icon_names=${names.join(',')}&display=block`;

const cssRes = await fetch(cssUrl, { headers: { 'User-Agent': UA } });
if (!cssRes.ok) throw new Error(`Google Fonts CSS ${cssRes.status}: ${await cssRes.text()}`);
const css = await cssRes.text();
const fontUrl = css.match(/url\((https:[^)]+)\)\s*format\('woff2'\)/)?.[1];
if (!fontUrl) throw new Error(`No se encontró woff2 en la respuesta:\n${css}`);

const fontRes = await fetch(fontUrl, { headers: { 'User-Agent': UA } });
if (!fontRes.ok) throw new Error(`Descarga de fuente ${fontRes.status}`);
const font = Buffer.from(await fontRes.arrayBuffer());
writeFileSync(FONT_FILE, font);

const sha256 = createHash('sha256').update(font).digest('hex');
writeFileSync(
  FONT_MANIFEST,
  JSON.stringify(
    {
      comment: 'Generado por scripts/icons/build-icon-font.mjs — no editar a mano',
      axes: AXES,
      sha256,
      bytes: font.length,
      names,
    },
    null,
    2
  ) + '\n'
);
console.log(`✓ ${names.length} iconos, ${(font.length / 1024).toFixed(1)} KB → ${FONT_FILE}`);
