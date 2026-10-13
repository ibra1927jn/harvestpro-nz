/**
 * La fuente de iconos es un subconjunto (solo los iconos que usa el código).
 * Aquí se comprueba en un navegador real que CADA nombre del subconjunto se
 * dibuja como un glifo (1em de ancho) y no como texto: si falta un ligado, la
 * palabra ("local_shipping") es mucho más ancha que 24px.
 * El otro lado (código → subconjunto) lo cubre `npm run icons:check`.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { test, expect } from './fixtures';

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/assets/fonts/material-symbols-subset.json'), 'utf8')
) as { names: string[] };

test('every icon in the subset font renders as a glyph, not as text', async ({ page }) => {
  test.skip(test.info().project.name !== 'pixel-7', 'independiente del dispositivo');
  await page.goto('/login');
  await expect(page.locator('html.icons-ready')).toHaveCount(1, { timeout: 30_000 });

  const notGlyphs = await page.evaluate(async names => {
    const box = document.createElement('div');
    document.body.appendChild(box);
    const spans = names.map(n => {
      const s = document.createElement('span');
      s.className = 'material-symbols-outlined';
      s.style.fontSize = '24px';
      s.textContent = n;
      box.appendChild(s);
      return s;
    });
    await document.fonts.ready;
    const bad = spans
      .filter(s => Math.abs(s.getBoundingClientRect().width - 24) > 0.5)
      .map(s => `${s.textContent} (${s.getBoundingClientRect().width}px)`);
    box.remove();
    return bad;
  }, manifest.names);

  expect(notGlyphs).toEqual([]);
});
