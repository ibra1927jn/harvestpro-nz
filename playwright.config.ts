import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local for local Playwright tests (Supabase credentials)
try {
  const envPath = resolve(process.cwd(), '.env.local');
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && !key.startsWith('#') && key.trim()) {
      process.env[key.trim()] = vals.join('=').trim();
    }
  });
} catch {
  /* .env.local not found — expected in CI */
}

import { defineConfig, devices } from '@playwright/test';

const ENV = process.env.PLAYWRIGHT_ENV ?? 'local';
const SMOKE_ONLY = process.env.PLAYWRIGHT_MATCH === 'smoke';

const BASE_URLS: Record<string, string> = {
  local: 'http://localhost:3000',
  ci: 'http://localhost:4173',
  staging: 'https://harvestpro-staging.vercel.app',
  production: 'https://harvestpro.vercel.app',
};

const WEB_SERVERS: Record<string, object> = {
  local: {
    command: 'npm run dev',
    url: BASE_URLS.local,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  ci: {
    command: 'npx serve dist -l 4173 -s',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
};

const isRemote = ENV === 'staging' || ENV === 'production';

export default defineConfig({
  testDir: './e2e',
  // «Empresa desde cero» va aparte (npm run test:e2e:fresh): crea y borra su propio huerto
  testIgnore: ['**/fresh-company.spec.ts'],
  ...(SMOKE_ONLY ? { testMatch: '**/smoke.spec.ts' } : {}),

  fullyParallel: !isRemote,
  forbidOnly: !!process.env.CI || isRemote,
  retries: isRemote || process.env.CI ? 2 : 0,
  // 2 workers localmente — equilibrio entre velocidad y rate-limit de Supabase
  workers: isRemote || process.env.CI ? 1 : 2,

  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['html']],

  timeout: 30_000,

  use: {
    baseURL: BASE_URLS[ENV],
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
  },

  projects: [
    // Paso 0: pre-autenticar todos los roles (corre serial, una sola vez)
    {
      name: 'auth-setup',
      testMatch: /global\.setup\.ts/,
    },

    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['auth-setup'],
    },

    // Mobile only for local dev
    ...(ENV === 'local'
      ? [
          {
            name: 'Mobile Chrome',
            use: { ...devices['Pixel 5'] },
            dependencies: ['auth-setup'],
          },
        ]
      : []),
  ],

  ...(WEB_SERVERS[ENV] ? { webServer: WEB_SERVERS[ENV] } : {}),
});
