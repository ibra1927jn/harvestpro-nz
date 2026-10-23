/**
 * PWA en el móvil: manifest válido, service worker activo y el shell de la
 * app carga sin conexión tras la primera visita. Requiere el build
 * (vite preview); con el dev server no hay service worker y se omite.
 */
import { test, expect } from './fixtures';
import { loginAs, navOrMenu, collectErrors } from './helpers';
import { translations } from '../../src/i18n/locales/all';

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

  // Los idiomas son chunks aparte (carga bajo demanda): el SW los precachea todos,
  // así que offline se puede arrancar en un idioma que este móvil nunca había usado
  test('offline: starts in a language never used before on this phone (precached chunk)', async ({ page, context }) => {
    await loginAs(page, 'runner');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 })
      .toBe(true);
    // Espera a que el precache termine de verdad (el chunk de francés está en la caché del SW)
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            for (const name of await caches.keys()) {
              const keys = await (await caches.open(name)).keys();
              if (keys.some(r => /\/assets\/locale-fr-[\w-]+\.js/.test(r.url))) return true;
            }
            return false;
          }),
        { timeout: 60_000 }
      )
      .toBe(true);

    await context.setOffline(true);
    try {
      await page.evaluate(() => localStorage.setItem('harvestpro_locale', 'fr'));
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('lang', 'fr', { timeout: 30_000 });
      await expect(page.getByText(translations.fr['sync.offline']).first()).toBeVisible();
      await expect(page.getByText(translations.en['sync.offline'], { exact: true })).toHaveCount(0);
    } finally {
      await page.evaluate(() => localStorage.removeItem('harvestpro_locale')).catch(() => undefined);
      await context.setOffline(false);
    }
  });

  test('language chunk that cannot be downloaded: the app starts in English, no crash', async ({ page, context }) => {
    const errs = collectErrors(page);
    await context.addInitScript(() => localStorage.setItem('harvestpro_locale', 'fr'));
    // Primera visita (sin SW todavía) y el chunk de francés no llega
    await page.route(/\/assets\/locale-fr-[\w-]+\.js$/, r => r.abort('internetdisconnected'));
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(errs.errors.filter(e => e.startsWith('pageerror')), errs.errors.join('\n')).toEqual([]);
  });
});
