/**
 * Fixture base de la suite móvil: si global-setup levantó el shim de funciones,
 * redirige /functions/v1/* al shim (mismo código y BD que el edge runtime).
 */
import { test as base, expect, type Route } from '@playwright/test';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';

/** navigator.onLine de la página que hizo la petición (true si no se puede saber) */
export async function pageIsOnline(route: Route): Promise<boolean> {
  try {
    return await route.request().frame().evaluate(() => navigator.onLine);
  } catch {
    return true;
  }
}

export const test = base.extend<{ functionsShim: void }>({
  functionsShim: [
    async ({ context }, use) => {
      const shim = process.env.MOBILE_FN_SHIM_URL;
      if (shim) {
        await context.route(`${SUPABASE_URL}/functions/v1/**`, async route => {
          const req = route.request();
          const target = req.url().replace(SUPABASE_URL, shim);
          // route.fetch sale desde Node: sin esto el "modo sin red" del navegador no
          // afectaba a las funciones redirigidas al shim (llegaban al servidor)
          if (!(await pageIsOnline(route))) {
            await route.abort('internetdisconnected').catch(() => undefined);
            return;
          }
          let res;
          try {
            res = await route.fetch({ url: target });
          } catch {
            await route.abort('connectionfailed').catch(() => undefined);
            return;
          }
          // CORS: el allowlist de las funciones solo tiene localhost:3000; con
          // MOBILE_PORT distinto se refleja el origen de la página
          const headers = { ...res.headers() };
          const origin = req.headers()['origin'];
          if (origin && headers['access-control-allow-origin'] !== origin) {
            headers['access-control-allow-origin'] = origin;
          }
          // La página puede haberse quedado sin red o cerrado mientras tanto
          await route.fulfill({ response: res, headers }).catch(() => undefined);
        });
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };
