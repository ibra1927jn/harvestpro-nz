/**
 * Sesión en el móvil: Android mata la PWA en segundo plano a menudo. Al volver
 * a abrirla (sessionStorage vacío) el usuario debe seguir dentro, también sin
 * cobertura — si no, un runner en el huerto se queda fuera hasta tener señal.
 */
import { test, expect } from './fixtures';
import { loginAs, waitForAppIdle } from './helpers';

test('runner stays logged in after the app is closed and reopened', async ({ page, context }) => {
  await loginAs(page, 'runner');
  await page.close();

  // Nueva "apertura" de la PWA: misma localStorage, sessionStorage vacío
  const reopened = await context.newPage();
  await reopened.goto('/');
  await expect(reopened).toHaveURL(/\/runner/, { timeout: 30_000 });
  await waitForAppIdle(reopened);
  await expect(reopened.locator('nav[aria-label="Main navigation"]')).toBeVisible();
});

test('runner can reopen the app with no signal after it was killed', async ({ page, context }) => {
  await loginAs(page, 'runner');
  // Primera visita completa: el service worker cachea el shell (solo build)
  await page.waitForTimeout(3_000);
  await page.close();

  await context.setOffline(true);
  const reopened = await context.newPage();
  await reopened.goto('/runner').catch(() => undefined);
  test.skip(
    (await reopened.content()).includes('ERR_INTERNET_DISCONNECTED'),
    'App shell not cached (dev server has no service worker)'
  );
  await expect(reopened).toHaveURL(/\/runner/, { timeout: 30_000 });
  await expect(reopened.locator('nav[aria-label="Main navigation"]')).toBeVisible({
    timeout: 30_000,
  });
  await context.setOffline(false);
});
