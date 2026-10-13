/**
 * Playwright — suite móvil (Android / iPhone emulados en Chromium).
 *
 * WebKit no está instalado en este entorno: los perfiles iPhone usan el
 * viewport, DPR, touch y user-agent de iPhone sobre Chromium.
 *
 * Por defecto construye la app y la sirve con `vite preview` (build real con
 * service worker). MOBILE_SERVER=dev usa el dev server de Vite.
 *
 * Uso: npm run test:e2e:mobile
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { defineConfig, devices } from '@playwright/test';

// Cargar .env.local (credenciales Supabase local)
try {
  const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && !key.startsWith('#') && key.trim() && !process.env[key.trim()]) {
      process.env[key.trim()] = vals.join('=').trim();
    }
  });
} catch {
  /* sin .env.local */
}

// Puerto 3000: el allowlist CORS de las edge functions incluye localhost:3000
const PORT = Number(process.env.MOBILE_PORT ?? 3000);
const BASE_URL = `http://localhost:${PORT}`;
const USE_DEV = process.env.MOBILE_SERVER === 'dev';

const chromiumArgs = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];

// Chromium preinstalado (puede no coincidir con la versión que espera Playwright)
const PREINSTALLED = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.MOBILE_CHROMIUM_PATH ?? (existsSync(PREINSTALLED) ? PREINSTALLED : undefined);

/** Perfil iPhone sobre Chromium (sin WebKit disponible). */
function iphoneOnChromium(name: keyof typeof devices) {
  const d = devices[name];
  return {
    viewport: d.viewport,
    deviceScaleFactor: d.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    userAgent: d.userAgent,
    browserName: 'chromium' as const,
  };
}

export default defineConfig({
  testDir: './e2e/mobile',
  globalSetup: './e2e/mobile/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-mobile' }]],
  outputDir: 'test-results-mobile',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    serviceWorkers: 'allow',
    launchOptions: { args: chromiumArgs, executablePath },
    permissions: ['camera'],
    locale: 'en-NZ',
    timezoneId: 'Pacific/Auckland',
  },
  projects: [
    {
      name: 'pixel-7',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'android-small-360',
      use: {
        ...devices['Galaxy S9+'],
        viewport: { width: 360, height: 740 },
        deviceScaleFactor: 3,
      },
    },
    {
      name: 'iphone-se',
      use: iphoneOnChromium('iPhone SE'),
    },
    {
      name: 'iphone-14-pro',
      use: iphoneOnChromium('iPhone 14 Pro'),
    },
    {
      name: 'pixel-7-landscape',
      use: { ...devices['Pixel 7 landscape'] },
    },
  ],
  webServer: {
    command: USE_DEV
      ? `npx vite --port ${PORT} --host localhost --strictPort`
      : `npx vite build && npx vite preview --port ${PORT} --host localhost --strictPort`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
