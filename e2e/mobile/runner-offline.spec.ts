/**
 * Runner en el huerto: escaneo de cubetas (entrada manual), sin cobertura y
 * vuelta de la red. Cada cubeta debe llegar a bucket_records exactamente una vez.
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { loginAs, collectErrors, snap, layoutReport } from './helpers';
import { createCheckedInPicker, bucketCount, removePicker, type TestPicker } from './db';

let picker: TestPicker;

test.beforeEach(() => {
  picker = createCheckedInPicker();
});

test.afterEach(() => {
  if (picker) removePicker(picker.id);
});

/** Abre el escáner de cubetas, mete el código a mano y cierra el lote. */
async function scanBucketManually(page: Page, code: string, shotName?: string) {
  const info = test.info();
  await page.getByRole('button', { name: /Scan Sticker/i }).click();
  await page.getByRole('button', { name: /Enter code manually/i }).click();
  const input = page.getByPlaceholder('e.g. BKT-1024');
  await input.fill(code);
  await page.getByRole('button', { name: 'Submit Code' }).click();
  const done = page.getByRole('button', { name: /Complete Batch \(1\)/ });
  await expect(done).toBeVisible();
  if (shotName) {
    await snap(page, info, shotName);
    // En el modal, el botón de cerrar lote no puede quedar tapado ni fuera de pantalla
    const box = await done.boundingBox();
    const vp = page.viewportSize();
    expect(box && vp && box.y + box.height <= vp.height).toBeTruthy();
    const layout = await layoutReport(page);
    expect(layout.covered, JSON.stringify(layout.covered)).toEqual([]);
  }
  await done.click();
  await expect(page.getByText(/Saved 1 Bucket/i)).toBeVisible();
}

async function waitForCount(pickerId: string, expected: number, timeoutMs = 45_000) {
  await expect
    .poll(() => bucketCount(pickerId), { timeout: timeoutMs, intervals: [1_000] })
    .toBe(expected);
}

test('runner records buckets online and offline; each syncs exactly once', async ({
  page,
  context,
}) => {
  const errs = collectErrors(page);
  await loginAs(page, 'runner');

  // 1. Con red: se guarda en el servidor
  await scanBucketManually(page, picker.code, 'runner-scanner-manual-entry');
  await waitForCount(picker.id, 1);

  // 2. Sin cobertura: dos cubetas quedan en el móvil
  await context.setOffline(true);
  await expect(page.getByText(/offline/i).first()).toBeVisible({ timeout: 15_000 });
  await snap(page, test.info(), 'runner-offline-banner');
  await scanBucketManually(page, picker.code);
  await page.waitForTimeout(3_500); // el escáner bloquea el mismo código 3 s
  await scanBucketManually(page, picker.code);
  await page.waitForTimeout(6_000);
  expect(bucketCount(picker.id)).toBe(1);
  await snap(page, test.info(), 'runner-offline-pending');

  // 3. Vuelve la red: suben las dos, y solo una vez
  await context.setOffline(false);
  await waitForCount(picker.id, 3);
  // Margen para reintentos / ciclos del bridge: no debe duplicar
  await page.waitForTimeout(12_000);
  expect(bucketCount(picker.id)).toBe(3);

  // 4. Recargar no reenvía nada
  await page.reload();
  await page.waitForTimeout(8_000);
  expect(bucketCount(picker.id)).toBe(3);

  const appErrors = errs.errors.filter(e => !/ERR_INTERNET_DISCONNECTED|Failed to fetch/i.test(e));
  expect(appErrors, appErrors.join('\n')).toEqual([]);
});
