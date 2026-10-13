/**
 * Helpers de accesibilidad (no visual) para la suite móvil.
 *
 * - axe con WCAG 2.x A/AA + best-practice; el gate solo cuenta serious/critical
 * - contraste en allowlist explícita mientras el rediseño esté aplazado
 * - chequeos propios que axe no ve: iconos de ligadura expuestos al lector de
 *   pantalla ("qr_code_scanner"), <html lang> según el idioma elegido,
 *   estructura (un <main>, algún encabezado)
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

/**
 * Reglas fuera del gate mientras el rediseño / modo oscuro estén aplazados.
 * Quitar de aquí cuando se haga el rediseño.
 */
export const CONTRAST_ALLOWLIST = new Set(['color-contrast', 'color-contrast-enhanced']);

export interface A11yIssue {
  id: string;
  impact: string;
  help: string;
  nodes: number;
  targets: string[];
}

export interface A11yReport {
  /** serious/critical fuera de la allowlist: el gate falla con cualquiera */
  blocking: A11yIssue[];
  /** reglas en allowlist (contraste), solo informativo */
  allowlisted: A11yIssue[];
  /** moderate/minor, informativo */
  minor: A11yIssue[];
}

const TARGET_SAMPLE = 6;

export async function axeAudit(page: Page, include?: string): Promise<A11yReport> {
  let builder = new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .exclude('#splash-screen');
  if (include) builder = builder.include(include);
  const res = await builder.analyze();
  const report: A11yReport = { blocking: [], allowlisted: [], minor: [] };
  for (const v of res.violations) {
    const issue: A11yIssue = {
      id: v.id,
      impact: v.impact ?? '',
      help: v.help,
      nodes: v.nodes.length,
      targets: v.nodes.slice(0, TARGET_SAMPLE).map(n => n.target.join(' ')),
    };
    if (CONTRAST_ALLOWLIST.has(v.id)) report.allowlisted.push(issue);
    else if (v.impact === 'serious' || v.impact === 'critical') report.blocking.push(issue);
    else report.minor.push(issue);
  }
  return report;
}

/**
 * Chequeos propios (impacto "serious" a efectos del gate):
 * - icon-ligature-exposed: el texto de ligadura de Material Symbols llega al
 *   lector de pantalla ("check_circle", "done_all"...)
 * - html-lang-mismatch: <html lang> distinto del idioma seleccionado
 * - landmark-main-count: no hay exactamente un <main> visible
 */
export async function customAudit(page: Page): Promise<A11yIssue[]> {
  const found = await page.evaluate(() => {
    const out: { id: string; help: string; targets: string[] }[] = [];
    const describe = (el: Element): string => {
      const h = el as HTMLElement;
      const p = h.closest('button, a, [role="button"]') as HTMLElement | null;
      const ctx = p ? ` in ${p.tagName.toLowerCase()}[${(p.innerText || '').trim().slice(0, 30)}]` : '';
      return `${h.tagName.toLowerCase()}("${(h.textContent || '').trim()}")${ctx}`;
    };
    const visible = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    // Un control con aria-label propio no lee sus hijos
    const namedAncestor = (el: Element): boolean => {
      const c = el.parentElement?.closest(
        'button, a, [role="button"], [role="tab"], [role="link"], [role="img"], [role="switch"], [role="checkbox"]'
      );
      return !!c && (c.hasAttribute('aria-label') || c.hasAttribute('aria-labelledby'));
    };
    const icons = Array.from(
      document.querySelectorAll('.material-symbols-outlined, .material-symbols-rounded, .material-icons')
    ).filter(
      el =>
        visible(el) &&
        !el.closest('[aria-hidden="true"]') &&
        el.getAttribute('role') !== 'img' &&
        !el.hasAttribute('aria-label') &&
        !namedAncestor(el) &&
        !el.closest('#splash-screen')
    );
    if (icons.length) {
      out.push({
        id: 'icon-ligature-exposed',
        help: 'Icon font ligature text is read by screen readers (add aria-hidden="true")',
        targets: icons.map(describe),
      });
    }

    let selected = 'en';
    try {
      selected = localStorage.getItem('harvestpro_locale') || 'en';
    } catch {
      /* sin storage */
    }
    const lang = document.documentElement.lang;
    if (!lang || lang.split('-')[0] !== selected.split('-')[0]) {
      out.push({
        id: 'html-lang-mismatch',
        help: '<html lang> must follow the selected app language',
        targets: [`lang="${lang}" selected="${selected}"`],
      });
    }

    const dialogOpen = document.querySelector('[role="dialog"][aria-modal="true"]');
    const mains = Array.from(document.querySelectorAll('main, [role="main"]')).filter(visible);
    if (!dialogOpen && mains.length !== 1) {
      out.push({
        id: 'landmark-main-count',
        help: 'Each screen needs exactly one visible <main> landmark',
        targets: [`${mains.length} main landmarks`],
      });
    }
    return out;
  });
  return found.map(f => ({ ...f, impact: 'serious', nodes: f.targets.length, targets: f.targets.slice(0, 8) }));
}

/** Auditoría completa de la pantalla actual: axe + chequeos propios. */
export async function auditScreen(page: Page, include?: string): Promise<A11yReport> {
  const axe = await axeAudit(page, include);
  const custom = include ? [] : await customAudit(page);
  return { ...axe, blocking: [...axe.blocking, ...custom] };
}

export const A11Y_FINDINGS_FILE = resolve(
  process.env.A11Y_FINDINGS_FILE ?? '/home/claude/reports/a11y-findings.jsonl'
);

export function recordA11y(info: TestInfo, screen: string, data: Record<string, unknown>): void {
  mkdirSync(resolve(A11Y_FINDINGS_FILE, '..'), { recursive: true });
  appendFileSync(
    A11Y_FINDINGS_FILE,
    JSON.stringify({ phase: process.env.A11Y_PHASE ?? 'run', device: info.project.name, screen, ...data }) +
      '\n'
  );
}

export function formatIssues(screen: string, issues: A11yIssue[]): string[] {
  return issues.map(i => `${screen}: [${i.impact}] ${i.id} x${i.nodes} — ${i.help} — ${i.targets.join(' | ')}`);
}

/** Recorre el foco con Tab y devuelve los elementos sin indicador de foco visible. */
export async function tabWalk(
  page: Page,
  steps: number
): Promise<{ order: string[]; noVisibleFocus: string[]; stuck: boolean }> {
  const order: string[] = [];
  const noVisibleFocus: string[] = [];
  let repeats = 0;
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
      const ring = cs.boxShadow && cs.boxShadow !== 'none';
      const name =
        el.getAttribute('aria-label') || (el.innerText || '').trim().slice(0, 30) || el.getAttribute('placeholder') || '';
      return { desc: `${el.tagName.toLowerCase()}[${name}]`, visible: outline || !!ring };
    });
    if (!info) continue;
    if (order.length && order[order.length - 1] === info.desc) repeats++;
    order.push(info.desc);
    if (!info.visible) noVisibleFocus.push(info.desc);
  }
  return { order, noVisibleFocus: [...new Set(noVisibleFocus)], stuck: repeats > steps / 2 };
}
