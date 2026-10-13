/**
 * Medición (no aserción) de carga en un Android de gama media: Slow 3G
 * (preset de DevTools: 2000 ms RTT, ~50 KB/s) + CPU 4x. Solo en pixel-7 y con
 * MOBILE_PERF=1. Escribe reports/mobile-perf.json.
 */
import { test } from './fixtures';
import type { CDPSession, Page } from '@playwright/test';
import { writeFileSync } from 'fs';
import { loginAs } from './helpers';

const OUT = process.env.MOBILE_PERF_FILE ?? '/home/claude/reports/mobile-perf.json';
const SLOW_3G = {
  offline: false,
  latency: 2000,
  downloadThroughput: (500 * 1024 * 0.8) / 8,
  uploadThroughput: (500 * 1024 * 0.8) / 8,
};

interface Sample {
  scenario: string;
  interactiveMs: number;
  lcpMs: number | null;
  jsKB: number;
  totalKB: number;
  requests: number;
  largest: string[];
  scripts: string[];
  fonts: string[];
  cpuTop?: string[];
}

async function throttle(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', SLOW_3G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  return cdp;
}

/** Cuenta bytes transferidos (comprimidos) por tipo durante la carga. */
function trackBytes(cdp: CDPSession) {
  const types = new Map<string, string>();
  const urls = new Map<string, string>();
  const sizes: { url: string; kb: number }[] = [];
  let js = 0;
  let total = 0;
  let requests = 0;
  const scripts: { url: string; kb: number }[] = [];
  const fonts: { url: string; kb: number }[] = [];
  const short = (u: string) => u.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  cdp.on('Network.responseReceived', e => {
    types.set(e.requestId, e.type);
    urls.set(e.requestId, e.response.url);
  });
  cdp.on('Network.loadingFinished', e => {
    requests++;
    total += e.encodedDataLength;
    const entry = { url: urls.get(e.requestId) ?? '?', kb: Math.round(e.encodedDataLength / 1024) };
    sizes.push(entry);
    if (types.get(e.requestId) === 'Script') {
      js += e.encodedDataLength;
      scripts.push(entry);
    }
    if (types.get(e.requestId) === 'Font') fonts.push(entry);
  });
  return () => ({
    jsKB: Math.round(js / 1024),
    totalKB: Math.round(total / 1024),
    requests,
    largest: [...sizes]
      .sort((a, b) => b.kb - a.kb)
      .slice(0, 6)
      .map(x => `${x.kb}KB ${short(x.url)}`),
    scripts: scripts.map(x => `${x.kb}KB ${short(x.url)}`),
    fonts: fonts.map(x => `${x.kb}KB ${short(x.url)}`),
  });
}

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
}
interface Profile {
  nodes: ProfileNode[];
  samples: number[];
  timeDeltas: number[];
}

/** Resumen del perfil de CPU: tiempo propio (ms) por función y por fichero. */
function summarizeProfile(profile: Profile): string[] {
  const byId = new Map(profile.nodes.map(n => [n.id, n]));
  const self = new Map<string, number>();
  const perFile = new Map<string, number>();
  profile.samples.forEach((id, i) => {
    const n = byId.get(id);
    if (!n) return;
    const dt = (profile.timeDeltas[i] ?? 0) / 1000;
    const file = n.callFrame.url.replace(/^https?:\/\/[^/]+/, '') || `(${n.callFrame.functionName || 'native'})`;
    const fn = `${n.callFrame.functionName || '(anon)'} ${file}:${n.callFrame.lineNumber}`;
    self.set(fn, (self.get(fn) ?? 0) + dt);
    perFile.set(file, (perFile.get(file) ?? 0) + dt);
  });
  const top = (m: Map<string, number>, k: number, tag: string) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([name, ms]) => `${tag} ${Math.round(ms)}ms ${name}`);
  return [...top(perFile, 10, 'file'), ...top(self, 15, 'fn')];
}

async function lcp(page: Page): Promise<number | null> {
  return page.evaluate(
    () =>
      new Promise<number | null>(resolve => {
        let last: number | null = null;
        new PerformanceObserver(list => {
          for (const e of list.getEntries()) last = e.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        setTimeout(() => resolve(last === null ? null : Math.round(last)), 1_000);
      })
  );
}

test.describe('performance (Slow 3G + 4x CPU)', () => {
  test.setTimeout(600_000);

  test('login and runner screen load times', async ({ browser }) => {
    test.skip(
      test.info().project.name !== 'pixel-7' || process.env.MOBILE_PERF !== '1',
      'set MOBILE_PERF=1; runs on pixel-7 only'
    );
    const samples: Sample[] = [];
    const device = test.info().project.use;

    // 1. Login en frío: sin caché ni service worker
    {
      const ctx = await browser.newContext({ ...device, serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const cdp = await throttle(page);
      const bytes = trackBytes(cdp);
      const t0 = Date.now();
      await page.goto('/login', { waitUntil: 'commit' });
      await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 300_000 });
      const interactiveMs = Date.now() - t0;
      await page.waitForLoadState('networkidle', { timeout: 300_000 }).catch(() => undefined);
      samples.push({ scenario: 'login cold', interactiveMs, lcpMs: await lcp(page), ...bytes() });
      await ctx.close();
    }

    // 1b. Login en caliente: segunda visita con el service worker instalado
    {
      const ctx = await browser.newContext({ ...device, serviceWorkers: 'allow' });
      const page = await ctx.newPage();
      await page.goto('/login');
      await page.evaluate(() => navigator.serviceWorker?.ready).catch(() => undefined);
      await page.reload();
      await page.waitForTimeout(3_000);
      const cdp = await throttle(page);
      const bytes = trackBytes(cdp);
      const t0 = Date.now();
      await page.reload({ waitUntil: 'commit' });
      await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 300_000 });
      const interactiveMs = Date.now() - t0;
      samples.push({ scenario: 'login warm (SW)', interactiveMs, lcpMs: await lcp(page), ...bytes() });
      await ctx.close();
    }

    // 2. Pantalla del runner en frío (sesión iniciada sin throttling, luego recarga lenta)
    {
      const ctx = await browser.newContext({ ...device, serviceWorkers: 'block' });
      const page = await ctx.newPage();
      await loginAs(page, 'runner');
      const cdp = await throttle(page);
      await cdp.send('Network.clearBrowserCache');
      const bytes = trackBytes(cdp);
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
      await cdp.send('Profiler.start');
      const t0 = Date.now();
      await page.reload({ waitUntil: 'commit' });
      await page
        .getByRole('button', { name: /Scan Sticker/i })
        .waitFor({ state: 'visible', timeout: 300_000 });
      const interactiveMs = Date.now() - t0;
      const { profile } = (await cdp.send('Profiler.stop')) as unknown as { profile: Profile };
      if (process.env.MOBILE_PERF_PROFILE) {
        writeFileSync(process.env.MOBILE_PERF_PROFILE, JSON.stringify(profile));
      }
      samples.push({
        scenario: 'runner cold',
        interactiveMs,
        lcpMs: await lcp(page),
        ...bytes(),
        cpuTop: summarizeProfile(profile),
      });
      await ctx.close();
    }

    // 3. Runner en caliente: service worker con el shell precacheado
    {
      const ctx = await browser.newContext({ ...device, serviceWorkers: 'allow' });
      const page = await ctx.newPage();
      await loginAs(page, 'runner');
      await page.evaluate(() => navigator.serviceWorker?.ready).catch(() => undefined);
      await page.reload();
      await page.waitForTimeout(3_000);
      const cdp = await throttle(page);
      const bytes = trackBytes(cdp);
      const t0 = Date.now();
      await page.reload({ waitUntil: 'commit' });
      await page
        .getByRole('button', { name: /Scan Sticker/i })
        .waitFor({ state: 'visible', timeout: 300_000 });
      const interactiveMs = Date.now() - t0;
      samples.push({ scenario: 'runner warm (SW)', interactiveMs, lcpMs: await lcp(page), ...bytes() });
      await ctx.close();
    }

    writeFileSync(OUT, JSON.stringify({ network: 'Slow 3G', cpu: '4x', samples }, null, 2));
    test.info().annotations.push({ type: 'perf', description: JSON.stringify(samples) });
  });
});
