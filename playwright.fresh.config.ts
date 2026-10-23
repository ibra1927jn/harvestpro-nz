/**
 * Playwright — «empresa desde cero» (e2e/fresh-company.spec.ts)
 *
 *   npm run test:e2e:fresh
 *
 * Un solo navegador, en serie (cada paso usa lo que deja el anterior).
 * Variables: E2E_BASE_URL (por defecto el `npm run dev` de :3000, que se reutiliza
 * si ya está levantado), DB_URL (psql; por defecto el Supabase local),
 * SUPABASE_SERVICE_ROLE_KEY (solo con una base que ya tiene huertos),
 * PW_CHROMIUM_PATH (Chromium propio), E2E_FRESH_KEEP=1 (no borrar al terminar).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { defineConfig, devices } from '@playwright/test';

try {
    const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
    envContent.split('\n').forEach(line => {
        const [key, ...vals] = line.split('=');
        if (key && !key.startsWith('#') && key.trim() && process.env[key.trim()] === undefined) {
            process.env[key.trim()] = vals.join('=').trim();
        }
    });
} catch {
    /* sin .env.local (CI): variables de entorno */
}

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
    testDir: './e2e',
    testMatch: 'fresh-company.spec.ts',
    fullyParallel: false,
    workers: 1,
    retries: 0,
    forbidOnly: !!process.env.CI,
    timeout: 120_000,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-fresh' }]] : [['list']],
    use: {
        ...devices['Desktop Chrome'],
        baseURL: BASE_URL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        actionTimeout: 15_000,
        launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
    },
    ...(process.env.E2E_BASE_URL
        ? {}
        : { webServer: { command: 'npm run dev', url: BASE_URL, reuseExistingServer: true, timeout: 60_000 } }),
});
