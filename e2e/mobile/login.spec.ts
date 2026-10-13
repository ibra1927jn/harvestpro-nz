/**
 * Login en el móvil: usable sin zoom ni scroll lateral, y sin descargar la
 * imagen del panel de escritorio (que en el móvil está oculto).
 */
import { test, expect } from './fixtures';
import { collectErrors, layoutReport, snap, axeSerious, recordFinding } from './helpers';

test('login screen is usable on the phone and light on data', async ({ page }) => {
  const errs = collectErrors(page);
  const requested: string[] = [];
  page.on('request', r => requested.push(r.url()));
  const fontBytes: number[] = [];
  page.on('response', async r => {
    if (r.url().startsWith('https://fonts.gstatic.com/') && r.url().includes('materialsymbols')) {
      const body = await r.body().catch(() => null);
      if (body) fontBytes.push(body.length);
    }
  });

  await page.goto('/login');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await snap(page, test.info(), 'login');

  const layout = await layoutReport(page);
  recordFinding(test.info(), 'login', { ...layout, axe: await axeSerious(page) });
  expect(layout.overflowX, JSON.stringify(layout.overflowX)).toBeNull();
  expect(layout.smallInputs, JSON.stringify(layout.smallInputs)).toEqual([]);
  expect(layout.covered, JSON.stringify(layout.covered)).toEqual([]);

  const submit = page.locator('button[type="submit"]');
  const box = await submit.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);

  // El panel con la foto solo se ve en escritorio (lg); en el móvil no debe bajarse
  const vw = page.viewportSize()!.width;
  if (vw < 1024) {
    expect(requested.filter(u => u.includes('orchard-hero'))).toEqual([]);
  }
  // Fuente de iconos: solo los ejes usados (la variable completa pesaba 1.1 MB)
  for (const b of fontBytes) expect(b).toBeLessThan(600 * 1024);
  expect(errs.errors, errs.errors.join('\n')).toEqual([]);
});
