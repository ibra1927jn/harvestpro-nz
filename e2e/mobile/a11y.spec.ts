/**
 * Gate de accesibilidad no visual (lectores de pantalla, teclado, zoom).
 *
 * Falla con cualquier violación axe serious/critical que NO sea de contraste
 * (contraste en allowlist mientras el rediseño esté aplazado) y con los
 * chequeos propios de a11y-helpers (iconos de ligadura expuestos, lang, <main>).
 *
 * Solo corre en pixel-7 salvo A11Y_ALL_DEVICES=1.
 * A11Y_REPORT_ONLY=1: registra hallazgos sin fallar (para medir el "antes").
 */
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { ROLES, type RoleKey, loginAs, mainNav, waitForAppIdle } from './helpers';
import { auditScreen, formatIssues, recordA11y, tabWalk } from './a11y-helpers';
import { bucketCount, createCheckedInPicker, removePicker, type TestPicker } from './db';

const REPORT_ONLY = process.env.A11Y_REPORT_ONLY === '1';
const ROLE_ORDER: RoleKey[] = ['runner', 'lead', 'qc', 'manager', 'hr', 'payroll', 'logistics', 'admin'];

test.beforeEach(async ({ page: _page }, info) => {
  test.skip(
    info.project.name !== 'pixel-7' && process.env.A11Y_ALL_DEVICES !== '1',
    'a11y gate runs on pixel-7'
  );
});

function gate(failures: string[]): void {
  if (REPORT_ONLY) return;
  expect(failures, failures.join('\n')).toEqual([]);
}

/** Pestañas de la navegación principal (barra inferior o drawer). */
async function navTabs(page: Page): Promise<{ labels: string[]; open: (i: number) => Promise<void> }> {
  const nav = mainNav(page);
  const hamburger = page.getByRole('button', { name: 'Open menu' });
  await expect(nav.or(hamburger).filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
  if (await nav.isVisible()) {
    const labels = await nav
      .locator('button')
      .evaluateAll(bs => bs.map((b, i) => b.getAttribute('aria-label') ?? `tab-${i}`));
    return {
      labels,
      open: async i => {
        const tab = nav.locator('button').nth(i);
        await tab.scrollIntoViewIfNeeded();
        await tab.click();
      },
    };
  }
  const drawerNav = page.locator('div.fixed.inset-0 nav');
  await hamburger.click();
  const labels = await drawerNav
    .locator('button')
    .evaluateAll(bs => bs.map((b, i) => b.getAttribute('aria-label') ?? `tab-${i}`));
  await page.locator('div.fixed.inset-0').getByRole('button', { name: 'Close menu' }).click();
  return {
    labels,
    open: async i => {
      await hamburger.click();
      await drawerNav.locator('button').nth(i).click();
    },
  };
}

for (const role of ROLE_ORDER) {
  test(`${role}: main screens have no serious/critical non-contrast a11y issues`, async ({ page }, info) => {
    await loginAs(page, role);
    expect(page.url()).toMatch(ROLES[role].home);
    const { labels, open } = await navTabs(page);
    expect(labels.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (let i = 0; i < labels.length; i++) {
      const screen = `${role}-${labels[i]}`;
      await open(i);
      await waitForAppIdle(page);
      await page.waitForTimeout(1_000);
      const report = await auditScreen(page);
      recordA11y(info, screen, { ...report });
      failures.push(...formatIssues(screen, report.blocking));
    }
    gate(failures);
  });
}

/** Comprueba la semántica de un diálogo abierto desde `trigger`. */
async function checkDialog(page: Page, trigger: Locator, name: RegExp, failures: string[], screen: string) {
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(400);

  if ((await dialog.getAttribute('aria-modal')) !== 'true') failures.push(`${screen}: dialog without aria-modal`);
  const focusInside = await dialog.evaluate(d => d.contains(document.activeElement));
  if (!focusInside) failures.push(`${screen}: focus did not move into the dialog`);

  // Tab no se escapa del diálogo
  let escaped = false;
  for (let k = 0; k < 15; k++) {
    await page.keyboard.press('Tab');
    if (!(await dialog.evaluate(d => d.contains(document.activeElement)))) escaped = true;
  }
  if (escaped) failures.push(`${screen}: Tab moves focus out of the modal dialog`);

  const report = await auditScreen(page, '[role="dialog"]');
  recordA11y(test.info(), screen, { ...report });
  failures.push(...formatIssues(screen, report.blocking));

  await page.keyboard.press('Escape');
  const closed = await dialog
    .waitFor({ state: 'hidden', timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (!closed) {
    failures.push(`${screen}: Escape does not close the dialog`);
    await dialog.getByRole('button', { name: /close|cancel/i }).first().click();
    await dialog.waitFor({ state: 'hidden' });
    return;
  }
  const back = await trigger.evaluate(t => t === document.activeElement);
  if (!back) failures.push(`${screen}: focus is not returned to the trigger after closing`);
}

test.describe('field flows', () => {
  let picker: TestPicker | null = null;
  test.afterEach(() => {
    if (picker) removePicker(picker.id);
    picker = null;
  });

  test('runner: scanner dialog, labelled manual entry and spoken result', async ({ page }) => {
    picker = createCheckedInPicker();
    await loginAs(page, 'runner');
    const failures: string[] = [];

    const scan = page.getByRole('button', { name: /Scan Sticker/i });
    await checkDialog(page, scan, /Scan BUCKET/i, failures, 'runner-scanner');

    // Entrada manual: el campo tiene etiqueta y el resultado se anuncia
    await scan.click();
    await page.getByRole('button', { name: /Enter code manually/i }).click();
    const input = page.getByRole('textbox', { name: /Enter BUCKET Code/i });
    if ((await input.count()) === 0) failures.push('runner-scanner: manual code input has no label');
    await page.getByPlaceholder('e.g. BKT-1024').fill(picker.code);
    await page.getByRole('button', { name: 'Submit Code' }).click();
    const live = page.locator('[aria-live="polite"], [aria-live="assertive"], [role="status"], [role="alert"]');
    await expect
      .poll(async () => (await live.allTextContents()).join(' '), { timeout: 5_000 })
      .toMatch(new RegExp(picker.code))
      .catch(() => failures.push('runner-scanner: scanned code is not announced'));
    await page.getByRole('button', { name: /Complete Batch \(1\)/ }).click();
    await expect
      .poll(async () => (await live.allTextContents()).join(' '), { timeout: 5_000 })
      .toMatch(new RegExp(`Bucket saved for E2E Mobile ${picker.code}`, 'i'))
      .catch(() => failures.push('runner: "Bucket saved for <name>" is not announced'));

    // Sin cobertura: el aviso debe decir que se guardó en el móvil
    await page.context().setOffline(true);
    await page.waitForTimeout(1_000);
    await page.waitForTimeout(3_500); // bloqueo del mismo código 3 s
    await scan.click();
    await page.getByRole('button', { name: /Enter code manually/i }).click();
    await page.getByPlaceholder('e.g. BKT-1024').fill(picker.code);
    await page.getByRole('button', { name: 'Submit Code' }).click();
    await page.getByRole('button', { name: /Complete Batch \(1\)/ }).click();
    await expect
      .poll(async () => (await live.allTextContents()).join(' '), { timeout: 5_000 })
      .toMatch(/No signal, saved offline/i)
      .catch(() => failures.push('runner: offline save is not announced as "No signal, saved offline"'));
    await page.context().setOffline(false);
    // Esperar a que suba la cubeta offline: si no, llega después de borrar el picker de prueba
    await expect.poll(() => bucketCount(picker!.id), { timeout: 60_000, intervals: [1_000] }).toBe(2);
    gate(failures);
  });

  test('admin: the menu drawer is a modal dialog', async ({ page }) => {
    await loginAs(page, 'admin');
    const failures: string[] = [];
    const menu = page.getByRole('button', { name: 'Open menu' });
    test.skip(!(await menu.isVisible()), 'sidebar layout, no drawer');
    await checkDialog(page, menu, /Menu/, failures, 'admin-menu');
    gate(failures);
  });

  test('runner: keyboard reaches the scan action with a visible focus ring', async ({ page }) => {
    await loginAs(page, 'runner');
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    const walk = await tabWalk(page, 40);
    recordA11y(test.info(), 'runner-keyboard', walk);
    const failures: string[] = [];
    if (!walk.order.some(o => /Scan Sticker/i.test(o))) failures.push(`Scan Sticker not reachable by Tab: ${walk.order.join(' > ')}`);
    if (walk.stuck) failures.push(`keyboard trap: ${walk.order.join(' > ')}`);
    if (walk.noVisibleFocus.length) failures.push(`no visible focus on: ${walk.noVisibleFocus.join(', ')}`);
    gate(failures);
  });

  test('team leader: check-in/out buttons name the picker', async ({ page }) => {
    await loginAs(page, 'lead');
    await mainNav(page).locator('button[aria-label="Roll Call"]').click();
    await waitForAppIdle(page);
    const actions = page.getByRole('button', { name: /^Check (in|out)\b/i });
    const n = await actions.count();
    const failures: string[] = [];
    for (let i = 0; i < Math.min(n, 10); i++) {
      const name = (await actions.nth(i).getAttribute('aria-label')) ?? (await actions.nth(i).innerText());
      if (/^\s*(login|logout)?\s*Check (in|out)\s*$/i.test(name.replace(/\n/g, ' ')))
        failures.push(`roll call: "${name.trim()}" does not say which picker`);
    }
    gate(failures);
  });

  test('QC: grade buttons are >= 44px and announce the logged grade', async ({ page }) => {
    picker = createCheckedInPicker('qc@harvestpro.nz');
    await loginAs(page, 'qc');
    await page.getByLabel('Search pickers').fill(picker.code);
    await page.getByRole('button', { name: new RegExp(picker.code) }).click();
    const failures: string[] = [];
    for (const g of ['A', 'B', 'C']) {
      const b = page.getByRole('button', { name: new RegExp(`Grade ${g}`) });
      const box = await b.boundingBox();
      if (!box || box.height < 44 || box.width < 44) failures.push(`Grade ${g} button smaller than 44px`);
    }
    await page.getByRole('button', { name: /Grade A/ }).click();
    const live = page.locator('[aria-live="polite"], [aria-live="assertive"], [role="status"], [role="alert"]');
    await expect
      .poll(async () => (await live.allTextContents()).join(' '), { timeout: 10_000 })
      .toMatch(/Logged.*Grade A/i)
      .catch(() => failures.push('QC: logged grade is not announced'));
    gate(failures);
  });
});

test.describe('text scaling (200% zoom)', () => {
  // 200% de zoom en un Pixel 7 = viewport CSS de 206px
  test.use({ viewport: { width: 206, height: 457 } });

  const critical: { role: RoleKey; tab?: string; button: RegExp }[] = [
    { role: 'runner', button: /Scan Sticker/i },
    { role: 'lead', tab: 'Roll Call', button: /^Check (in|out)/i },
    { role: 'qc', button: /Search pickers|Grade A/i },
  ];
  for (const c of critical) {
    test(`${c.role}: critical action usable at 200% zoom`, async ({ page }) => {
      await loginAs(page, c.role);
      if (c.tab) {
        await mainNav(page).locator(`button[aria-label="${c.tab}"]`).click();
        await waitForAppIdle(page);
      }
      const target = page.getByRole('button', { name: c.button }).or(page.getByLabel(c.button)).first();
      await target.scrollIntoViewIfNeeded();
      const failures: string[] = [];
      const box = await target.boundingBox();
      const vw = page.viewportSize()!.width;
      if (!box) failures.push(`${c.role}: critical control not rendered`);
      else if (box.x < 0 || box.x + box.width > vw + 1) failures.push(`${c.role}: critical control cut off horizontally (${Math.round(box.x)}..${Math.round(box.x + box.width)} of ${vw})`);
      const clipped = await target.evaluate(el => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow === 'hidden');
      if (clipped) failures.push(`${c.role}: critical control text is clipped`);
      // La página no se ensancha (si no, el móvil la desplaza de lado y corta los botones)
      const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      if (pageWidth > vw + 1) failures.push(`${c.role}: page is ${pageWidth}px wide at a ${vw}px viewport`);
      // Debe poder pulsarse (no tapado por header/nav)
      await target.click({ trial: true }).catch(e => failures.push(`${c.role}: not clickable: ${String(e).slice(0, 120)}`));
      recordA11y(test.info(), `${c.role}-zoom200`, { failures });
      gate(failures);
    });
  }
});
