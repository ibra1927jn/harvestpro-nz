/**
 * Auditoría de pantallas por rol y dispositivo.
 *
 * Para cada rol: login → recorre cada pestaña de la navegación principal →
 * captura, chequeos de layout, axe y errores de consola.
 *
 * Aserciones duras: sin overflow horizontal, sin errores de consola, sin
 * botones de la navegación tapados, inputs >= 16px (zoom iOS).
 * Lo demás (tap targets pequeños, axe) se registra como hallazgo.
 */
import { test, expect } from './fixtures';
import {
  ROLES,
  type RoleKey,
  loginAs,
  collectErrors,
  layoutReport,
  axeSerious,
  snap,
  recordFinding,
  mainNav,
  waitForAppIdle,
} from './helpers';

const ROLE_ORDER: RoleKey[] = ['runner', 'lead', 'qc', 'manager', 'hr', 'payroll', 'logistics', 'admin'];

for (const role of ROLE_ORDER) {
  test(`${role}: every main screen is usable`, async ({ page }, info) => {
    const errs = collectErrors(page);
    await loginAs(page, role);
    expect(page.url()).toMatch(ROLES[role].home);

    // Móvil: barra inferior. Pantallas >= 768px (landscape) o vistas solo
    // escritorio: menú hamburguesa con drawer.
    const nav = mainNav(page);
    const hamburger = page.getByRole('button', { name: 'Open menu' });
    const drawerNav = page.locator('div.fixed.inset-0 nav');
    await expect(nav.or(hamburger).first()).toBeVisible({ timeout: 30_000 });
    const useBottomNav = await nav.isVisible();
    if (!useBottomNav) await expect(hamburger, 'no bottom nav and no menu button').toBeVisible();

    let labels: string[];
    if (useBottomNav) {
      labels = await nav.locator('button').evaluateAll(bs =>
        bs.map((b, i) => b.getAttribute('aria-label') ?? `tab-${i}`)
      );
    } else {
      await hamburger.click();
      labels = await drawerNav.locator('button').evaluateAll(bs =>
        bs.map((b, i) => b.getAttribute('aria-label') ?? `tab-${i}`)
      );
      await page.locator('div.fixed.inset-0 button[aria-label="Close menu"]').click();
    }
    expect(labels.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      const screen = `${role}-${label}`;
      errs.reset();
      if (useBottomNav) {
        const tab = nav.locator('button').nth(i);
        await tab.scrollIntoViewIfNeeded();
        await tab.click();
      } else {
        await hamburger.click();
        await drawerNav.locator('button').nth(i).click();
      }
      await waitForAppIdle(page);
      await page.waitForTimeout(1_200);

      const shot = await snap(page, info, screen);
      const layout = await layoutReport(page);
      const axe = await axeSerious(page);

      recordFinding(info, screen, {
        shot,
        overflowX: layout.overflowX,
        smallTargets: layout.smallTargets,
        smallInputs: layout.smallInputs,
        hiddenBehindChrome: layout.hiddenBehindChrome,
        covered: layout.covered,
        axe,
        errors: [...errs.errors],
      });

      if (layout.overflowX)
        failures.push(`${screen}: horizontal overflow ${JSON.stringify(layout.overflowX)}`);
      if (errs.errors.length) failures.push(`${screen}: console errors ${errs.errors.join(' | ')}`);
      if (layout.smallInputs.length)
        failures.push(`${screen}: inputs < 16px ${JSON.stringify(layout.smallInputs)}`);
      if (layout.covered.length)
        failures.push(`${screen}: controls covered by other elements ${JSON.stringify(layout.covered)}`);
      if (layout.hiddenBehindChrome.length)
        failures.push(`${screen}: hidden behind bottom bar ${JSON.stringify(layout.hiddenBehindChrome)}`);
    }

    // El listado completo queda en mobile-findings.jsonl
    expect.soft(failures, failures.join('\n')).toEqual([]);
  });
}
