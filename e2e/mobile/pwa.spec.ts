/**
 * PWA en el móvil: manifest válido, service worker activo y el shell de la
 * app carga sin conexión tras la primera visita. Requiere el build
 * (vite preview); con el dev server no hay service worker y se omite.
 */
import { test, expect } from './fixtures';
import { loginAs, navOrMenu } from './helpers';

const DEV = process.env.MOBILE_SERVER === 'dev';

test.describe('PWA', () => {
  test.skip(DEV, 'service worker only exists in the production build');

  test('manifest is valid and installable', async ({ page, request }) => {
    await page.goto('/login');
    const hrefs = await page
      .locator('link[rel="manifest"]')
      .evaluateAll(ls => ls.map(l => (l as HTMLLinkElement).href));
    // Un solo manifest: con dos, el navegador usa el primero y el otro se ignora
    expect(hrefs, `manifest links: ${hrefs.join(', ')}`).toHaveLength(1);

    const res = await request.get(hrefs[0]);
    expect(res.ok()).toBeTruthy();
    const m = (await res.json()) as {
      name?: string;
      short_name?: string;
      start_url?: string;
      display?: string;
      icons?: { src: string; sizes: string; purpose?: string }[];
    };
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBeTruthy();
    expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(m.display);
    const sizes = (m.icons ?? []).map(i => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    for (const icon of m.icons ?? []) {
      const r = await request.get(new URL(icon.src, hrefs[0]).href);
      expect(r.ok(), `icon ${icon.src}`).toBeTruthy();
    }
  });

  test('service worker registers and the app shell loads offline', async ({ page, context }) => {
    await loginAs(page, 'runner');
    const active = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return reg.active?.scriptURL ?? null;
    });
    expect(active).toMatch(/sw\.js$/);

    // Espera a que el precache termine (el SW toma control de la página)
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 })
      .toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page).toHaveURL(/\/runner/);
    await expect(navOrMenu(page)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/You are Offline/i).first()).toBeVisible();
    await context.setOffline(false);
  });
});
