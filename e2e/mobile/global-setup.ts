/**
 * Global setup de la suite móvil.
 *
 * Comprueba si el edge_runtime local arranca las funciones. Si no (BOOT_ERROR),
 * levanta functions-shim con Deno (mismo código, misma BD) y deja su URL en
 * MOBILE_FN_SHIM_URL para que los tests redirijan /functions/v1/* allí.
 */
import { spawn, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { resolve } from 'path';
import { removeLeftoverPickers } from './db';

const SHIM_PORT = Number(process.env.MOBILE_FN_SHIM_PORT ?? 54399);
const FUNCTIONS = [
  'record-bucket',
  'manage-attendance',
  'check-compliance',
  'calculate-payroll',
  'detect-anomalies',
  'submit-audit-log',
  'approve-timesheet',
  'close-pay-week',
  'manage-admin',
  'send-push',
];

async function edgeRuntimeWorks(supabaseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/record-bucket`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:3000' },
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function waitFor(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'http://localhost:3000' } });
      if (r.status === 200) return true;
    } catch {
      /* aún arrancando */
    }
    await new Promise(r => setTimeout(r, 1_000));
  }
  return false;
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  // Capturas e informe limpios en cada ejecución
  const screens = process.env.MOBILE_SCREENS_DIR ?? '/home/claude/reports/mobile-screens';
  const findings = process.env.MOBILE_FINDINGS_FILE ?? '/home/claude/reports/mobile-findings.jsonl';
  mkdirSync(screens, { recursive: true });
  if (existsSync(findings)) rmSync(findings);
  removeLeftoverPickers();

  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  // MOBILE_FN_SHIM=force: usar el shim aunque el edge runtime funcione (el
  // runtime compartido sirve las funciones de otro checkout, no las de este)
  const force = process.env.MOBILE_FN_SHIM === 'force';
  if (!force && (process.env.MOBILE_FN_SHIM === '0' || (await edgeRuntimeWorks(supabaseUrl)))) {
    return async () => removeLeftoverPickers();
  }

  const support = resolve(process.cwd(), 'e2e/mobile/support');
  const caBundle = '/root/.ccr/ca-bundle.crt';
  const child: ChildProcess = spawn(
    'deno',
    [
      'run',
      '--allow-all',
      '--no-lock',
      `--import-map=${resolve(support, 'shim-import-map.json')}`,
      resolve(support, 'functions-shim.ts'),
      String(SHIM_PORT),
      ...FUNCTIONS,
    ],
    {
      env: {
        ...process.env,
        SUPABASE_URL: supabaseUrl,
        SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? '',
        ...(existsSync(caBundle) && !process.env.DENO_CERT ? { DENO_CERT: caBundle } : {}),
      },
      stdio: ['ignore', 'inherit', 'inherit'],
      detached: false,
    }
  );

  const url = `http://127.0.0.1:${SHIM_PORT}`;
  const ok = await waitFor(`${url}/functions/v1/record-bucket`, 120_000);
  if (!ok) {
    child.kill('SIGTERM');
    throw new Error('Edge runtime is broken and the Deno functions shim did not start');
  }
  process.env.MOBILE_FN_SHIM_URL = url;
  process.stdout.write(`[mobile] edge_runtime unavailable → using Deno functions shim at ${url}\n`);

  return async () => {
    child.kill('SIGTERM');
    removeLeftoverPickers();
  };
}
