/**
 * Sesión en el móvil: Android mata la PWA en segundo plano a menudo. Al volver
 * a abrirla (sessionStorage vacío) el usuario debe seguir dentro, también sin
 * cobertura — si no, un runner en el huerto se queda fuera hasta tener señal.
 */
import { test, expect } from './fixtures';
import { loginAs, waitForAppIdle, navOrMenu } from './helpers';

test('runner stays logged in after the app is closed and reopened', async ({ page, context }) => {
  await loginAs(page, 'runner');
  await page.close();

  // Nueva "apertura" de la PWA: misma localStorage, sessionStorage vacío
  const reopened = await context.newPage();
  await reopened.goto('/');
  await expect(reopened).toHaveURL(/\/runner/, { timeout: 30_000 });
  await waitForAppIdle(reopened);
  await expect(navOrMenu(reopened)).toBeVisible();
});

test('runner can reopen the app with no signal after it was killed', async ({ page, context }) => {
  await loginAs(page, 'runner');
  // Primera visita completa: el service worker cachea el shell (solo build)
  const hasSw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>(r => setTimeout(() => r(null), 15_000)),
    ]);
    return !!reg;
  });
  test.skip(!hasSw, 'No service worker (dev server)');
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 })
    .toBe(true);
  await page.close();

  await context.setOffline(true);
  const reopened = await context.newPage();
  await reopened.goto('/runner');
  await expect(reopened).toHaveURL(/\/runner/, { timeout: 30_000 });
  await expect(navOrMenu(reopened)).toBeVisible({ timeout: 30_000 });
  await context.setOffline(false);
});
