/**
 * Flujos de campo en el móvil: QC califica una inspección y el team leader
 * consulta su equipo y el historial de filas.
 */
import { test, expect } from './fixtures';
import { loginAs, collectErrors, snap, layoutReport, mainNav } from './helpers';
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

  await mainNav(page)
    .or(page.getByRole('button', { name: 'Open menu' }))
    .filter({ visible: true })
    .first()
    .waitFor();
  const bottom = mainNav(page).locator('button[aria-label="Map"]');
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

test('chat shows the conversation list full width on a phone', async ({ page }) => {
  await loginAs(page, 'runner');
  const vw = page.viewportSize()!.width;
  test.skip(vw >= 768, 'split view is intended on tablets / landscape');
  await mainNav(page).locator('button[aria-label="Chat"]').click();
  const list = page.locator('aside').filter({ hasText: 'Chats' }).first();
  await expect(list).toBeVisible();
  const box = await list.boundingBox();
  // Antes: lista y panel vacío lado a lado, la lista con ~180px en un móvil
  expect(box!.width).toBeGreaterThanOrEqual(vw - 2);
  await snap(page, test.info(), 'runner-chat-list');
});
