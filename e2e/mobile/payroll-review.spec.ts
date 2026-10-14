/**
 * Nómina (payroll_admin) aprueba y rechaza hojas de horas desde el móvil
 * (decisión del dueño 2026-10-14). Entra con 2FA real (TOTP): el servidor
 * exige aal2 a payroll_admin.
 */
import { test, expect } from './fixtures';
import { loginAs, collectErrors, snap, mainNav } from './helpers';
import { sql } from './db';

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const created: string[] = [];
const createdShifts: string[] = [];

/** Persona con un tramo de hoy ya cerrado (pendiente de aprobar) en el huerto de nómina */
function closedShiftToday(label: string): { pickerId: string; attendanceId: string; name: string } {
  const [orchardId] = sql(`select orchard_id from public.users where email = 'payroll@harvestpro.nz'`);
  const code = `E2EP${label}${Date.now().toString(36).toUpperCase()}`;
  const name = `E2E Payroll ${code}`;
  const [pickerId] = sql(
    `insert into public.pickers (picker_id, name, orchard_id, status, safety_verified)
     values (${lit(code)}, ${lit(name)}, ${lit(orchardId)}, 'active', true) returning id`
  );
  created.push(pickerId);
  const [attendanceId] = sql(
    `insert into public.daily_attendance (picker_id, orchard_id, date, check_in, check_out, status)
     values (${lit(pickerId)}, ${lit(orchardId)}, (now() at time zone 'Pacific/Auckland')::date,
             now() - interval '2 hours', now() - interval '1 hour', 'present') returning id`
  );
  createdShifts.push(attendanceId);
  return { pickerId, attendanceId, name };
}

test.afterEach(() => {
  for (const id of created.splice(0)) {
    sql(`delete from public.daily_attendance where picker_id = ${lit(id)}`);
    sql(`delete from public.pickers where id = ${lit(id)}`);
    sql(`delete from public.audit_logs where record_id = ${lit(id)}`);
  }
  // Auditoría de los fichajes (aprobar / rechazar / borrar)
  for (const id of createdShifts.splice(0)) sql(`delete from public.audit_logs where record_id = ${lit(id)}`);
});

test('payroll approves one timesheet and rejects another', async ({ page }) => {
  const toApprove = closedShiftToday('A');
  const toReject = closedShiftToday('R');
  const [payrollId] = sql(`select id from public.users where email = 'payroll@harvestpro.nz'`);
  const errs = collectErrors(page);
  await loginAs(page, 'payroll');

  const tab = mainNav(page).locator('button[aria-label="Timesheets"]');
  if (await tab.isVisible()) {
    await tab.click();
  } else {
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.locator('div.fixed.inset-0 nav button[aria-label="Timesheets"]').click();
  }

  const card = (name: string) => page.locator('div.group', { hasText: name });
  await expect(card(toReject.name)).toBeVisible({ timeout: 20_000 });
  await snap(page, test.info(), 'payroll-timesheets-pending');

  await card(toReject.name).getByRole('button', { name: /Reject/ }).click();
  await expect(page.getByText(`Timesheet rejected for ${toReject.name}`)).toBeVisible();
  await expect
    .poll(() => sql(`select coalesce(rejected_by::text, '') || '|' || coalesce(verified_by::text, '') from public.daily_attendance where id = ${lit(toReject.attendanceId)}`)[0])
    .toBe(`${payrollId}|`);

  await card(toApprove.name).getByRole('button', { name: /Approve/ }).click();
  await expect(page.getByText(`Timesheet approved for ${toApprove.name}`)).toBeVisible();
  await expect
    .poll(() => sql(`select coalesce(verified_by::text, '') from public.daily_attendance where id = ${lit(toApprove.attendanceId)}`)[0])
    .toBe(payrollId);

  // Ninguna de las dos sigue pendiente
  await expect(card(toReject.name)).toHaveCount(0);
  await expect(card(toApprove.name)).toHaveCount(0);
  await snap(page, test.info(), 'payroll-timesheets-reviewed');
  expect(errs.errors, errs.errors.join('\n')).toEqual([]);
});
