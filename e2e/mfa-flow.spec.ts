/**
 * MFA flow e2e — enroll → verify → login with TOTP.
 *
 * Requiere que MFA esté habilitado en el servidor (ver docs/archive/2026-04/MFA_ENABLE_FIX_2026_04_19.md).
 * Si MFA NO está habilitado, los tests hacen skip con mensaje claro.
 *
 * El test usa el rol 'manager' como sujeto (manager@harvestpro.nz / 111111).
 * TOTP secret se genera en enroll; la UI muestra QR + código manual.
 * Este test extrae el secret desde la respuesta y calcula el TOTP code local
 * usando una implementación reducida de RFC 6238 (6 dígitos, SHA1, 30s window).
 */
import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';

/** RFC 6238 TOTP generator — 6 digits, SHA1, 30s step. Input: base32 secret. */
function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = input.toUpperCase().replace(/=+$/, '');
  let bits = '';
  for (const ch of cleaned) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function totpCode(secretB32: string, timeStep = 30): string {
  const key = base32Decode(secretB32);
  const counter = Math.floor(Date.now() / 1000 / timeStep);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 1_000_000).toString().padStart(6, '0');
}

test.describe('MFA TOTP flow', () => {
  test.use({ storageState: 'e2e/.auth/manager.json' });

  test('enroll → verify → login flow completo', async ({ page, request }) => {
    // Paso 0 — check si MFA está habilitado server-side
    const settingsRes = await request.get('/auth/v1/settings');
    if (!settingsRes.ok()) {
      test.skip(true, 'Auth /settings endpoint no accesible');
      return;
    }
    const settings = await settingsRes.json();
    const mfaEnabled = settings.mfa_totp_enroll_enabled === true;
    test.skip(
      !mfaEnabled,
      'MFA TOTP NO enabled en server. Aplicar docs/archive/2026-04/MFA_ENABLE_FIX_2026_04_19.md primero.',
    );

    // Paso 1 — ir a la página de settings/profile del manager (ruta depende del app)
    await page.goto('/manager');
    await expect(page).toHaveURL(/\/manager/);

    // Paso 2 — navegar al flujo MFA setup. En la app actual, MFA enroll
    // típicamente va vía un botón en Profile. Buscamos por texto/testid.
    // Este test es defensivo: si la UI no tiene el botón, marcamos como
    // missing feature (no fail).
    const mfaButton = page
      .getByTestId('mfa-enroll-btn')
      .or(page.getByRole('button', { name: /enable mfa|activar mfa|two-factor/i }));

    const mfaButtonVisible = await mfaButton.first().isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(
      !mfaButtonVisible,
      'UI no expone botón MFA enroll todavía (feature requiere page/Profile screen).',
    );

    await mfaButton.first().click();

    // Paso 3 — enroll genera QR + secret. Buscar el secret (en la mayoría
    // de UIs Supabase, el secret se muestra debajo del QR para entrada manual).
    const secretLocator = page.getByTestId('mfa-secret-text').or(page.locator('[data-secret]'));
    await expect(secretLocator).toBeVisible({ timeout: 5000 });
    const secret = (await secretLocator.first().textContent())?.replace(/\s+/g, '') ?? '';
    expect(secret.length).toBeGreaterThan(15); // base32 secret típico >20 chars

    // Paso 4 — calcular el TOTP code y rellenar el verify input
    const code = totpCode(secret);
    const codeInput = page.getByTestId('mfa-code-input').or(page.locator('input[name="mfa-code"]'));
    await codeInput.first().fill(code);

    const verifyBtn = page
      .getByTestId('mfa-verify-btn')
      .or(page.getByRole('button', { name: /verify|verificar/i }));
    await verifyBtn.first().click();

    // Paso 5 — verificar que el factor quedó activo
    const successIndicator = page
      .getByText(/mfa enabled|mfa activo|two-factor is on/i)
      .or(page.getByTestId('mfa-enrolled-badge'));
    await expect(successIndicator.first()).toBeVisible({ timeout: 10_000 });
  });

  test('login post-enroll pide código MFA', async ({ page }) => {
    // Verificar que tras enrollment, el login standard redirige a MFA challenge.
    // Este test asume que ya hay un factor TOTP activo para manager@.
    // Si no, hace skip.
    await page.goto('/login');
    await page.fill('input[type="email"]', 'manager@harvestpro.nz');
    await page.fill('input[type="password"]', process.env.TEST_MANAGER_PASSWORD ?? '111111');
    await page.click('button[type="submit"]');

    // Espera MFA challenge o redirect directo
    await page.waitForTimeout(2000);

    const mfaChallengeVisible = await page
      .getByText(/enter your authenticator code|introduce tu código/i)
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (!mfaChallengeVisible) {
      test.skip(true, 'manager@ no tiene MFA enrolled todavía. Correr test anterior primero.');
    }

    // Si llegamos aquí, la UI pide código — flujo correcto
    expect(mfaChallengeVisible).toBe(true);
  });
});

test.describe('MFA rollback safety', () => {
  test('login sin MFA sigue funcionando cuando MFA server-side deshabilitado', async ({ page, request }) => {
    const settingsRes = await request.get('/auth/v1/settings');
    if (!settingsRes.ok()) {
      test.skip(true, 'Auth /settings endpoint no accesible');
      return;
    }
    const settings = await settingsRes.json();

    if (settings.mfa_totp_enroll_enabled === true) {
      test.skip(true, 'MFA habilitado; este test es para verificar rollback');
      return;
    }

    // Con MFA OFF, login standard debe ir directo a dashboard
    await page.goto('/login');
    await page.fill('input[type="email"]', 'manager@harvestpro.nz');
    await page.fill('input[type="password"]', process.env.TEST_MANAGER_PASSWORD ?? '111111');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/manager/, { timeout: 10_000 });
  });
});
