/**
 * Humo de la CI: cada uno de los 8 roles entra (los privilegiados con 2FA real),
 * llega a su pantalla de inicio con la navegación visible, abre la segunda
 * pestaña y no hay errores de consola.
 *
 * Las acciones clave por rol van en sus specs: cubeta del runner
 * (runner-offline), nota de QC y equipo del TL (field-roles), aprobación de
 * nómina (payroll-review). La CI corre todos en el job `e2e`.
 */
import { test, expect } from './fixtures';
import { ROLES, type RoleKey, loginAs, collectErrors, mainNav, waitForAppIdle } from './helpers';

const ROLE_ORDER: RoleKey[] = ['runner', 'lead', 'qc', 'manager', 'hr', 'payroll', 'logistics', 'admin'];

for (const role of ROLE_ORDER) {
  test(`${role} signs in and reaches the home screen`, async ({ page }) => {
    const errs = collectErrors(page);
    await loginAs(page, role);
    expect(page.url()).toMatch(ROLES[role].home);

    // Barra inferior en el móvil; menú hamburguesa en vistas de escritorio
    const nav = mainNav(page);
    const hamburger = page.getByRole('button', { name: 'Open menu' });
    await expect(nav.or(hamburger).filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });

    // Segunda pestaña: la navegación funciona y la pantalla carga sin errores
    if (await nav.isVisible()) {
      const tabs = nav.locator('button');
      if ((await tabs.count()) > 1) {
        await tabs.nth(1).click();
        await waitForAppIdle(page);
      }
    } else {
      await hamburger.click();
      const items = page.locator('div.fixed.inset-0 nav button');
      await expect(items.first()).toBeVisible();
      if ((await items.count()) > 1) await items.nth(1).click();
      await waitForAppIdle(page);
    }
    await expect(page.locator('#root')).not.toBeEmpty();
    expect(errs.errors, errs.errors.join('\n')).toEqual([]);
  });
}
