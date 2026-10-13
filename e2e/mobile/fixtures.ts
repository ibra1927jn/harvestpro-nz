/**
 * Fixture base de la suite móvil: si global-setup levantó el shim de funciones,
 * redirige /functions/v1/* al shim (mismo código y BD que el edge runtime).
 */
import { test as base, expect } from '@playwright/test';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';

export const test = base.extend<{ functionsShim: void }>({
  functionsShim: [
    async ({ context }, use) => {
      const shim = process.env.MOBILE_FN_SHIM_URL;
      if (shim) {
        await context.route(`${SUPABASE_URL}/functions/v1/**`, async route => {
          const req = route.request();
          const target = req.url().replace(SUPABASE_URL, shim);
          try {
            const res = await route.fetch({ url: target });
            await route.fulfill({ response: res });
          } catch {
            await route.abort('connectionfailed');
          }
        });
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };
