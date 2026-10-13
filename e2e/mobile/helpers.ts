/**
 * Helpers compartidos de la suite móvil (Playwright).
 *
 * - login por rol vía UI (credenciales sembradas en la BD local)
 * - captura de errores de consola / promesas no gestionadas
 * - chequeos de layout móvil (overflow, tap targets, zoom iOS, solapes con header/nav)
 * - escaneo axe (serious/critical)
 */
import { expect, type Page, type TestInfo, type ConsoleMessage } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, appendFileSync } from 'fs';
import { resolve } from 'path';
import { ensureTotp, nextCode } from './support/totp';

export const PASSWORD = process.env.TEST_DEMO_PASSWORD ?? '111111';

export const ROLES = {
  runner: { email: 'runner@harvestpro.nz', home: /\/runner/ },
  lead: { email: 'lead@harvestpro.nz', home: /\/team-leader/ },
  qc: { email: 'qc@harvestpro.nz', home: /\/qc/ },
  manager: { email: 'manager@harvestpro.nz', home: /\/manager/ },
  hr: { email: 'hr@harvestpro.nz', home: /\/hhrr/ },
  payroll: { email: 'payroll@harvestpro.nz', home: /\/payroll/ },
  logistics: { email: 'logistics@harvestpro.nz', home: /\/logistics-dept/ },
  admin: { email: 'admin@harvestpro.nz', home: /\/admin/ },
} as const;

export type RoleKey = keyof typeof ROLES;

export const SCREENS_DIR = resolve(
  process.env.MOBILE_SCREENS_DIR ?? '/home/claude/reports/mobile-screens'
);
export const FINDINGS_FILE = resolve(
  process.env.MOBILE_FINDINGS_FILE ?? '/home/claude/reports/mobile-findings.jsonl'
);

/** Login por UI y espera a la ruta de inicio del rol. Los roles con 2FA
 * obligatorio pasan por la pantalla de código con un TOTP real. */
export async function loginAs(page: Page, role: RoleKey): Promise<void> {
  const r = ROLES[role];
  const mfa = MFA_ROLES.has(role);
  if (mfa) await ensureTotp(r.email, PASSWORD);
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(r.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  if (mfa) {
    const first = page.getByLabel('OTP digit 1');
    await first.waitFor({ timeout: 45_000 });
    await first.click();
    await page.keyboard.type(await nextCode(r.email));
    await expect(first).toHaveCount(0, { timeout: 20_000 });
  }
  await page.waitForURL(r.home, { timeout: 45_000 });
  await waitForAppIdle(page);
}

const MFA_ROLES = new Set<RoleKey>(['manager', 'hr', 'payroll', 'admin']);

/** Espera a que desaparezcan splash y loaders de página. */
export async function waitForAppIdle(page: Page, timeout = 20_000): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#splash-screen')).toHaveCount(0, { timeout });
  await expect(page.getByRole('status', { name: 'Loading application' })).toHaveCount(0, {
    timeout,
  });
  // Deja asentar animaciones / lazy chunks
  await page.waitForTimeout(800);
}

/** Errores de consola que no son del código de la app (ruido del entorno). */
const IGNORED_CONSOLE = [
  /fonts\.(googleapis|gstatic)\.com/i, // sin internet en el contenedor
  /Failed to load resource: net::ERR_INTERNET_DISCONNECTED/i, // esperado en modo offline
  /net::ERR_NAME_NOT_RESOLVED/i,
  /Download the React DevTools/i,
];

export interface ErrorCollector {
  errors: string[];
  reset(): void;
}

/** Recoge console.error y pageerror (excepciones / promesas rechazadas sin handler). */
export function collectErrors(page: Page): ErrorCollector {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some(re => re.test(text))) return;
    const loc = msg.location();
    errors.push(`console.error: ${text.slice(0, 300)} @ ${loc.url?.split('?')[0] ?? ''}`);
  });
  page.on('pageerror', err => {
    errors.push(`pageerror: ${err.message.slice(0, 300)}`);
  });
  return {
    errors,
    reset() {
      errors.length = 0;
    },
  };
}

export interface LayoutReport {
  overflowX: { scrollWidth: number; innerWidth: number; culprits: string[] } | null;
  smallTargets: { el: string; w: number; h: number }[];
  smallInputs: { el: string; fontSize: number }[];
  hiddenBehindChrome: { el: string; by: string }[];
  /** Interactivos dentro del viewport tapados por otro elemento (no tocables) */
  covered: { el: string; by: string }[];
  /** Interactivos bajo un botón flotante (FAB); informativo */
  floating: { el: string; by: string }[];
}

/**
 * Chequeos de layout en el DOM actual.
 * - overflow horizontal del documento
 * - tap targets < 44x44 (elementos interactivos visibles)
 * - inputs con font-size < 16px (iOS hace zoom al enfocar)
 * - elementos interactivos tapados por header/bottom-nav fijos sin poder scrollear
 */
export async function layoutReport(page: Page): Promise<LayoutReport> {
  return page.evaluate(() => {
    const describe = (el: Element): string => {
      const h = el as HTMLElement;
      const label =
        h.getAttribute('aria-label') ||
        h.getAttribute('title') ||
        h.getAttribute('placeholder') ||
        (h.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40) ||
        h.getAttribute('name') ||
        '';
      const id = h.id ? `#${h.id}` : '';
      return `${h.tagName.toLowerCase()}${id}[${label}]`;
    };
    const visible = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0)
        return false;
      return !(el as HTMLElement).closest('[aria-hidden="true"], .sr-only');
    };

    const vw = window.innerWidth;
    const sw = document.scrollingElement?.scrollWidth ?? document.body.scrollWidth;
    let overflowX: LayoutReport['overflowX'] = null;
    if (sw > vw) {
      const culprits: string[] = [];
      document.querySelectorAll('body *').forEach(el => {
        if (culprits.length >= 8) return;
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 && r.width > 0 && visible(el)) {
          // solo el elemento más externo que se sale
          const parent = el.parentElement;
          if (parent && parent.getBoundingClientRect().right > vw + 1) return;
          culprits.push(`${describe(el)} right=${Math.round(r.right)}`);
        }
      });
      overflowX = { scrollWidth: sw, innerWidth: vw, culprits };
    }

    const interactiveSel =
      'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="link"], [role="checkbox"], [role="switch"]';
    const smallTargets: LayoutReport['smallTargets'] = [];
    const smallInputs: LayoutReport['smallInputs'] = [];
    document.querySelectorAll(interactiveSel).forEach(el => {
      if (!visible(el)) return;
      const h = el as HTMLElement;
      if (h.closest('#splash-screen')) return;
      const r = h.getBoundingClientRect();
      // inputs de texto dentro de un label con área mayor cuentan por el label
      const isCheck = h instanceof HTMLInputElement && ['checkbox', 'radio'].includes(h.type);
      let box = r;
      if (isCheck && h.closest('label')) box = h.closest('label')!.getBoundingClientRect();
      // enlaces inline dentro de texto: WCAG 2.5.8 los exime
      const inlineLink = h.tagName === 'A' && getComputedStyle(h).display === 'inline';
      if (!inlineLink && (box.width < 44 - 0.5 || box.height < 44 - 0.5)) {
        smallTargets.push({ el: describe(h), w: Math.round(box.width), h: Math.round(box.height) });
      }
      if (
        (h instanceof HTMLInputElement &&
          !['checkbox', 'radio', 'range', 'color', 'file', 'submit', 'button'].includes(h.type)) ||
        h instanceof HTMLTextAreaElement ||
        h instanceof HTMLSelectElement
      ) {
        const fs = parseFloat(getComputedStyle(h).fontSize);
        if (fs < 16) smallInputs.push({ el: describe(h), fontSize: fs });
      }
    });

    // Elementos fijos (header / bottom nav) que pueden tapar contenido
    const fixed = Array.from(document.querySelectorAll('header, nav, [class*="fixed"]')).filter(
      el => {
        const cs = getComputedStyle(el);
        return (cs.position === 'fixed' || cs.position === 'sticky') && visible(el);
      }
    );
    const hiddenBehindChrome: LayoutReport['hiddenBehindChrome'] = [];
    const docH = document.scrollingElement?.scrollHeight ?? 0;
    const vh = window.innerHeight;
    const maxScroll = Math.max(0, docH - vh);
    document.querySelectorAll(interactiveSel).forEach(el => {
      if (!visible(el) || hiddenBehindChrome.length >= 10) return;
      const r = el.getBoundingClientRect();
      for (const f of fixed) {
        if (f.contains(el) || el.contains(f)) continue;
        // un modal fijo que contiene el elemento ya está descartado arriba
        if ((el as HTMLElement).closest('[role="dialog"], [aria-modal="true"]')) continue;
        const fr = f.getBoundingClientRect();
        if (fr.height > vh * 0.5) continue; // overlays/modales, no chrome
        const isBottomBar = fr.bottom >= vh - 1 && fr.top > vh / 2;
        if (!isBottomBar) continue;
        // posición absoluta del elemento en el documento
        const absTop = r.top + window.scrollY;
        const absBottom = r.bottom + window.scrollY;
        // ¿se puede scrollear de forma que quede por encima de la barra inferior?
        const visibleAtMaxScroll = absBottom - maxScroll <= fr.top;
        const horizontallyOverlaps = r.left < fr.right && r.right > fr.left;
        if (horizontallyOverlaps && !visibleAtMaxScroll && absTop - maxScroll < vh) {
          hiddenBehindChrome.push({ el: describe(el), by: describe(f) });
          break;
        }
      }
    });

    // Interactivos visibles en pantalla cuyo centro queda bajo otro elemento
    const covered: LayoutReport['covered'] = [];
    const floating: LayoutReport['floating'] = [];
    const dialogOpen = !!document.querySelector('[role="dialog"], [aria-modal="true"]');
    document.querySelectorAll(interactiveSel).forEach(el => {
      if (!visible(el) || covered.length >= 10) return;
      if (dialogOpen && !(el as HTMLElement).closest('[role="dialog"], [aria-modal="true"]')) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx > vw || cy > vh) return;
      // fuera del área visible de un contenedor con scroll propio: no está "tapado"
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ov = getComputedStyle(p);
        if (/(auto|scroll|hidden)/.test(ov.overflowY + ov.overflowX)) {
          const pr = p.getBoundingClientRect();
          if (cy < pr.top || cy > pr.bottom || cx < pr.left || cx > pr.right) return;
        }
      }
      const top = document.elementFromPoint(cx, cy);
      if (!top || el.contains(top) || top.contains(el)) return;
      // label que envuelve el input, o elementos decorativos sin eventos
      if ((el as HTMLElement).closest('label')?.contains(top)) return;
      // contenido que pasa por debajo del header/bottom-nav al hacer scroll: normal
      const chrome = top.closest('header, nav');
      if (chrome && !chrome.contains(el)) {
        const pos = getComputedStyle(chrome).position;
        if (pos === 'fixed' || pos === 'sticky') return;
      }
      // Botón flotante (FAB): tapa contenido que se puede desplazar por debajo.
      // Se registra aparte; una barra fija a todo el ancho sí cuenta como tapado.
      let fixedAncestor: Element | null = top;
      while (fixedAncestor && getComputedStyle(fixedAncestor).position !== 'fixed')
        fixedAncestor = fixedAncestor.parentElement;
      if (fixedAncestor) {
        const fr = fixedAncestor.getBoundingClientRect();
        if (fr.width < vw * 0.7 && fr.width * fr.height < vw * vh * 0.15) {
          floating.push({ el: describe(el), by: describe(fixedAncestor) });
          return;
        }
      }
      covered.push({ el: describe(el), by: describe(top) });
    });

    return { overflowX, smallTargets, smallInputs, hiddenBehindChrome, covered, floating };
  });
}

export interface AxeIssue {
  id: string;
  impact: string;
  help: string;
  nodes: number;
  sample: string;
}

export async function axeSerious(page: Page): Promise<AxeIssue[]> {
  const res = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('#splash-screen')
    .analyze();
  return res.violations
    .filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => ({
      id: v.id,
      impact: v.impact ?? '',
      help: v.help,
      nodes: v.nodes.length,
      sample: v.nodes[0]?.target.join(' ') ?? '',
    }));
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Captura de pantalla completa (viewport) en el directorio de informes. */
export async function snap(page: Page, info: TestInfo, name: string): Promise<string> {
  const dir = resolve(SCREENS_DIR, info.project.name);
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `${slug(name)}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

/** Guarda un hallazgo (una línea JSON) para el informe final. */
export function recordFinding(info: TestInfo, screen: string, data: Record<string, unknown>): void {
  mkdirSync(resolve(FINDINGS_FILE, '..'), { recursive: true });
  appendFileSync(
    FINDINGS_FILE,
    JSON.stringify({ device: info.project.name, screen, ...data }) + '\n'
  );
}

/** Pestañas de la barra inferior (o sidebar en escritorio). */
export function mainNav(page: Page) {
  // :visible — en escritorio/landscape hay un nav oculto en el sidebar
  return page.locator('nav[aria-label="Main navigation"]:visible');
}

/** Navegación principal visible: barra inferior o botón de menú (>= 768px). */
export function navOrMenu(page: Page) {
  return mainNav(page)
    .or(page.getByRole('button', { name: 'Open menu' }))
    .filter({ visible: true })
    .first();
}
