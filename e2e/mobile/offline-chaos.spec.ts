/**
 * Caos de red en el móvil del runner (y del team leader).
 *
 * - Cortes de cobertura aleatorios (semilla CHAOS_SEED), peticiones a
 *   record-bucket que no salen o cuya respuesta se pierde (el servidor guardó),
 *   red lenta. Al final: en la BD exactamente N cubetas, contador de pendientes
 *   a 0 y nada "sincronizando" colgado, también tras recargar.
 * - Dos runners escanean a la misma persona a la vez.
 * - Escaneos en cola de una persona que se archiva mientras el runner está sin
 *   red: rechazo VISIBLE (ni perdido en silencio ni reintentado para siempre).
 * - Team leader ficha sin red y luego con red.
 *
 * Solo pixel-7. CHAOS_SCANS=<n> (por defecto 9) para la versión larga.
 * Contra el código de este checkout: MOBILE_FN_SHIM=force (ver global-setup).
 */
import { test, expect, pageIsOnline } from './fixtures';
import type { BrowserContext, Page, Route } from '@playwright/test';
import { loginAs, collectErrors, snap } from './helpers';
import { createCheckedInPicker, bucketCount, removePicker, sql, type TestPicker } from './db';

const SEED = Number(process.env.CHAOS_SEED ?? 20261013);
const SCANS = Number(process.env.CHAOS_SCANS ?? 9);
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';

// eslint-disable-next-line no-empty-pattern -- Playwright exige desestructurar los fixtures
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'pixel-7', 'chaos runs on one profile');
});
test.describe.configure({ mode: 'serial' });

/** PRNG determinista (mulberry32) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Mode = 'pass' | 'abort' | 'lostResponse' | 'slow';

/** Intercepta record-bucket con el modo que diga `mode()` en cada petición */
async function chaosRoute(page: Page, mode: () => Mode, log: Mode[]): Promise<void> {
  await page.route('**/functions/v1/record-bucket', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    if (!(await pageIsOnline(route))) return route.abort('internetdisconnected').catch(() => undefined);
    const m = mode();
    log.push(m);
    if (m === 'abort') return route.abort('connectionfailed');
    if (m === 'pass') return route.fallback();
    const shim = process.env.MOBILE_FN_SHIM_URL;
    const url = shim ? route.request().url().replace(SUPABASE_URL, shim) : undefined;
    if (m === 'slow') {
      await new Promise(r => setTimeout(r, 4_000));
      return route.fallback();
    }
    // La petición llega y el servidor guarda; la respuesta se pierde
    try {
      await route.fetch(url ? { url } : undefined);
    } catch {
      /* da igual */
    }
    return route.abort('connectionreset');
  });
}

/** Abre el escáner, mete los códigos a mano y cierra el lote */
async function scanBatch(page: Page, codes: string[]): Promise<void> {
  await page.getByRole('button', { name: /Scan Sticker/i }).click();
  await page.getByRole('button', { name: /Enter code manually/i }).click();
  const input = page.getByPlaceholder('e.g. BKT-1024');
  for (const c of codes) {
    await input.fill(c);
    await page.getByRole('button', { name: 'Submit Code' }).click();
  }
  const done = page.getByRole('button', { name: new RegExp(`Complete Batch \\(${codes.length}\\)`) });
  await expect(done).toBeVisible();
  await done.click();
  await expect(page.getByText(new RegExp(`Saved ${codes.length} Bucket`, 'i'))).toBeVisible();
}

/** Corta y devuelve la red: dispara el evento online (el bridge sube al momento) */
async function reconnect(context: BrowserContext): Promise<void> {
  await context.setOffline(true);
  await new Promise(r => setTimeout(r, 300));
  await context.setOffline(false);
}

async function expectNothingPending(page: Page): Promise<void> {
  await expect(page.getByTestId('sync-badge')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText(/Syncing \d+ items/)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText(/\d+ queued/)).toHaveCount(0);
}

const total = (ps: TestPicker[]) => ps.reduce((n, p) => n + bucketCount(p.id), 0);

test.describe('offline chaos', () => {
  let pickers: TestPicker[] = [];

  test.afterEach(() => {
    for (const p of pickers) removePicker(p.id);
    pickers = [];
  });

  test(`random flaps while scanning: exactly ${SCANS} buckets reach the server (seed ${SEED})`, async ({ page, context }) => {
    test.setTimeout(240_000 + SCANS * 8_000);
    pickers = [createCheckedInPicker(), createCheckedInPicker(), createCheckedInPicker()];
    const rand = rng(SEED);
    const modes: Mode[] = [];
    let offline = false;
    await loginAs(page, 'runner');
    // Tras el login: justo al entrar PostgREST a veces responde 401 "JWT issued at
    // future" (reloj del contenedor local un segundo por detrás de GoTrue); no es de este test
    const errs = collectErrors(page);
    await chaosRoute(page, () => (['pass', 'pass', 'abort', 'lostResponse', 'slow'] as Mode[])[Math.floor(rand() * 5)], modes);

    let scanned = 0;
    let turn = 0;
    while (scanned < SCANS) {
      // Lote de 1-3 personas distintas (el escáner bloquea el mismo código 3 s)
      const size = Math.min(SCANS - scanned, 1 + Math.floor(rand() * 3));
      const codes = Array.from({ length: size }, (_, i) => pickers[(turn + i) % 3].code);
      turn++;
      await scanBatch(page, codes);
      scanned += size;
      // Cobertura que va y viene
      if (rand() < 0.4) {
        offline = !offline;
        await context.setOffline(offline);
      }
      await page.waitForTimeout(500 + Math.floor(rand() * 2_500));
    }

    // Vuelve la cobertura buena: todo pasa
    await page.unroute('**/functions/v1/record-bucket');
    await context.setOffline(false);
    await reconnect(context);
    await expect.poll(() => total(pickers), { timeout: 90_000, intervals: [1_000] }).toBe(SCANS);
    await expectNothingPending(page);
    await snap(page, test.info(), 'chaos-runner-drained');

    // Margen para reintentos y recarga: ni duplicados ni pendientes que vuelven
    await page.waitForTimeout(8_000);
    await page.reload();
    await page.waitForTimeout(8_000);
    expect(total(pickers)).toBe(SCANS);
    await expectNothingPending(page);
    await expect(page.getByTestId('rejected-scans')).toHaveCount(0);

    test.info().annotations.push({ type: 'chaos', description: `seed=${SEED} requests=${modes.join(',')}` });
    const appErrors = errs.errors.filter(e => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|ERR_CONNECTION|net::|Edge Function|upload failed/i.test(e));
    expect(appErrors, appErrors.join('\n')).toEqual([]);
  });

  test('two runners scan the same person at the same moment: two buckets', async ({ browser, page }) => {
    pickers = [createCheckedInPicker()];
    const phone2 = await browser.newContext({ ...test.info().project.use, baseURL: test.info().project.use.baseURL });
    const page2 = await phone2.newPage();
    const shim = process.env.MOBILE_FN_SHIM_URL;
    if (shim) {
      await phone2.route(`${SUPABASE_URL}/functions/v1/**`, async route => {
        if (!(await pageIsOnline(route))) return route.abort('internetdisconnected').catch(() => undefined);
        const res = await route.fetch({ url: route.request().url().replace(SUPABASE_URL, shim) }).catch(() => null);
        if (!res) return route.abort('connectionfailed').catch(() => undefined);
        await route.fulfill({ response: res }).catch(() => undefined);
      });
    }
    try {
      await loginAs(page, 'runner');
      await loginAs(page2, 'runner');
      // Los dos sin red, escanean la misma tarjeta (mismo segundo) y vuelve la red
      await page.context().setOffline(true);
      await phone2.setOffline(true);
      const open = async (p: Page) => {
        await p.getByRole('button', { name: /Scan Sticker/i }).click();
        await p.getByRole('button', { name: /Enter code manually/i }).click();
        await p.getByPlaceholder('e.g. BKT-1024').fill(pickers[0].code);
        await p.getByRole('button', { name: 'Submit Code' }).click();
      };
      await open(page);
      await open(page2);
      await Promise.all([
        page.getByRole('button', { name: /Complete Batch \(1\)/ }).click(),
        page2.getByRole('button', { name: /Complete Batch \(1\)/ }).click(),
      ]);
      await page.context().setOffline(false);
      await phone2.setOffline(false);
      await expect.poll(() => bucketCount(pickers[0].id), { timeout: 60_000, intervals: [1_000] }).toBe(2);
      await page.waitForTimeout(6_000);
      expect(bucketCount(pickers[0].id)).toBe(2);
      await expectNothingPending(page);
      await expectNothingPending(page2);
    } finally {
      await phone2.close();
    }
  });

  test('queued scans of a person archived meanwhile are shown as not accepted (not lost, not retried forever)', async ({ page, context }) => {
    pickers = [createCheckedInPicker()];
    const p = pickers[0];
    await loginAs(page, 'runner');
    await context.setOffline(true);
    await scanBatch(page, [p.code]);
    await page.waitForTimeout(3_500);
    await scanBatch(page, [p.code]);

    // Mientras tanto, en la oficina, la persona se archiva
    sql(`update public.pickers set status = 'archived' where id = '${p.id}'`);

    let requests = 0;
    page.on('request', r => {
      if (r.url().includes('/functions/v1/record-bucket') && r.method() === 'POST') requests++;
    });
    await context.setOffline(false);
    const notice = page.getByTestId('rejected-scans');
    await expect(notice).toBeVisible({ timeout: 45_000 });
    await expect(notice).toContainText('2 scans not accepted');
    await notice.getByRole('button').click();
    await expect(notice).toContainText(p.code);
    await snap(page, test.info(), 'chaos-runner-rejected');
    await expectNothingPending(page);
    expect(bucketCount(p.id)).toBe(0);
    // Y el servidor lo dejó apuntado para el manager (antes solo estaba en este móvil)
    expect(sql(`select kind from public.rejected_scans where picker_id = '${p.id}'`)).toEqual(['rejected', 'rejected']);

    // No se reintenta en bucle
    const before = requests;
    await page.waitForTimeout(15_000);
    expect(requests - before).toBe(0);

    // Sigue a la vista tras reabrir la app
    await page.reload();
    await expect(page.getByTestId('rejected-scans')).toContainText('2 scans not accepted', { timeout: 30_000 });
  });

  test('team leader checks someone in without signal, then with signal', async ({ page, context }) => {
    test.setTimeout(240_000);
    const [leadId] = sql(`select id from public.users where email = 'lead@harvestpro.nz'`);
    const p = createCheckedInPicker('lead@harvestpro.nz');
    pickers = [p];
    // Sin fichaje de hoy y en el equipo del team leader
    sql(`delete from public.daily_attendance where picker_id = '${p.id}'`);
    sql(`update public.pickers set team_leader_id = '${leadId}' where id = '${p.id}'`);
    const attendance = () => Number(sql(`select count(*) from public.daily_attendance where picker_id = '${p.id}'`)[0]);

    await loginAs(page, 'lead');
    await page.getByRole('button', { name: /Roll Call/i }).first().click();
    const row = page.locator('div.rounded-xl', { hasText: `E2E Mobile ${p.code}` });
    await expect(row).toBeVisible({ timeout: 30_000 });

    await context.setOffline(true);
    await row.getByRole('button', { name: /Check In/i }).click();
    // Sin red: tras los reintentos, aviso de error y la persona NO aparece como presente
    const t0 = Date.now();
    await expect(row.getByRole('button', { name: /Check In/i })).toBeVisible({ timeout: 20_000 });
    test.info().annotations.push({ type: 'offline-check-in-spinner-ms', description: String(Date.now() - t0) });
    await expect(page.getByText(/No signal — check-in not saved/).and(page.locator(':not([aria-live])'))).toBeVisible({ timeout: 5_000 });
    await snap(page, test.info(), 'chaos-lead-checkin-offline');
    expect(attendance()).toBe(0);

    await context.setOffline(false);
    await row.getByRole('button', { name: /Check In/i }).click();
    await expect(row.getByRole('button', { name: /Check Out/i })).toBeVisible({ timeout: 30_000 });
    expect(attendance()).toBe(1);
  });
});
