/**
 * Flujos de campo en el móvil: QC califica una inspección y el team leader
 * consulta su equipo y el historial de filas.
 */
import { test, expect } from './fixtures';
import { loginAs, collectErrors, snap, layoutReport } from './helpers';
import { createCheckedInPicker, qcInspectionCount, removePicker, type TestPicker } from './db';

let picker: TestPicker | null = null;

test.afterEach(() => {
  if (picker) removePicker(picker.id);
  picker = null;
});

test('QC grades a picker from the phone', async ({ page }) => {
  picker = createCheckedInPicker('qc@harvestpro.nz');
  const errs = collectErrors(page);
  await loginAs(page, 'qc');

  await page.getByLabel('Search pickers').fill(picker.code);
  const row = page.getByRole('button', { name: new RegExp(picker.code) });
  await expect(row).toBeVisible();
  await row.click();

  const gradeA = page.getByRole('button', { name: /Grade A/ });
  await gradeA.scrollIntoViewIfNeeded();
  await expect(gradeA).toBeEnabled();
  const box = await gradeA.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await snap(page, test.info(), 'qc-grade-selected');
  await gradeA.click();

  await expect(page.getByText(/Logged/)).toBeVisible();
  await expect.poll(() => qcInspectionCount(picker!.id), { timeout: 20_000 }).toBe(1);

  const layout = await layoutReport(page);
  expect(layout.overflowX).toBeNull();
  expect(errs.errors, errs.errors.join('\n')).toEqual([]);
});

test('team leader sees the team and the row history', async ({ page }) => {
  const errs = collectErrors(page);
  await loginAs(page, 'lead');
  await snap(page, test.info(), 'lead-home-team');

  await page.locator('nav[aria-label="Main navigation"]').or(page.getByRole('button', { name: 'Open menu' })).first().waitFor();
  const bottom = page.locator('nav[aria-label="Main navigation"] button[aria-label="Map"]');
  if (await bottom.isVisible()) {
    await bottom.click();
  } else {
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.locator('div.fixed.inset-0 nav button[aria-label="Map"]').click();
  }
  const history = page.getByText("My team's rows");
  await history.scrollIntoViewIfNeeded();
  await expect(history).toBeVisible();
  await snap(page, test.info(), 'lead-row-history');

  const layout = await layoutReport(page);
  expect(layout.overflowX, JSON.stringify(layout.overflowX)).toBeNull();
  expect(layout.covered, JSON.stringify(layout.covered)).toEqual([]);
  expect(errs.errors, errs.errors.join('\n')).toEqual([]);
});
