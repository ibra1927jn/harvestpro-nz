/**
 * Pantallas de campo (y nómina/RR. HH.) en otro idioma (por defecto el más largo, español):
 * que el texto traducido sale, que no queda texto inglés a la vista y que
 * nada se sale ni se corta en un móvil de 360px.
 *
 * Idiomas: I18N_LOCALES=es,to,sm (por defecto es).
 */
import type { Page, TestInfo } from '@playwright/test';
import { test, expect } from './fixtures';
import { loginAs, collectErrors, snap, layoutReport, waitForAppIdle, recordFinding } from './helpers';
import { translations } from '../../src/i18n/locales/all';
import type { Locale } from '../../src/i18n/types';

const LOCALES = (process.env.I18N_LOCALES ?? 'es').split(',').map(s => s.trim()) as Locale[];
const en = translations.en;

async function switchLanguage(page: Page, locale: Locale): Promise<void> {
  await page.evaluate(l => localStorage.setItem('harvestpro_locale', l), locale);
  await page.reload();
  await waitForAppIdle(page);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
}

/**
 * Textos de la app (traducciones) recortados: overflow oculto, con … o cortados.
 * Solo cuenta el texto visible (no iconos ocultos) y solo si es una traducción:
 * un nombre de persona largo que se corta con … es diseño, no un problema de idioma.
 */
async function clippedTexts(page: Page, locale: Locale): Promise<string[]> {
  const values = Object.values(translations[locale]).filter(v => v.length >= 3 && !v.includes('{'));
  return page.evaluate((texts) => {
    // Igual a una traducción, o la contiene como palabras completas ("bin" no cuenta dentro de "Robinson")
    const isTranslation = (s: string) => texts.some(v => s === v || (` ${s} `).includes(` ${v} `));
    const out: string[] = [];
    document.querySelectorAll('body *').forEach(el => {
      const h = el as HTMLElement;
      if (!h.childNodes.length || out.length > 10) return;
      const hasText = [...h.childNodes].some(n => n.nodeType === 3 && (n.textContent ?? '').trim().length > 1);
      if (!hasText) return;
      const r = h.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight) return;
      if (h.closest('[aria-hidden="true"], .sr-only, .material-symbols-outlined')) return;
      const cs = getComputedStyle(h);
      if (!/(hidden|clip)/.test(cs.overflowX + cs.textOverflow)) return;
      // Medir sin los iconos ocultos (no son texto que se lea)
      const hidden = [...h.querySelectorAll<HTMLElement>('[aria-hidden="true"], .material-symbols-outlined')];
      const prev = hidden.map(x => x.style.display);
      hidden.forEach(x => { x.style.display = 'none'; });
      const clipsX = h.scrollWidth > h.clientWidth + 1;
      hidden.forEach((x, i) => { x.style.display = prev[i]; });
      const text = (h.innerText || '').replace(/\s+/g, ' ').trim();
      if (clipsX && isTranslation(text)) out.push(`${h.tagName.toLowerCase()}[${text.slice(0, 50)}] ${h.scrollWidth}>${h.clientWidth}`);
    });
    return out;
  }, values);
}

/** Nombres de la barra inferior que no caben en su botón (se montan sobre el de al lado; 2px de margen) */
async function navLabelOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('nav[aria-label] button').forEach(b => {
      const btn = b as HTMLElement;
      if (!btn.offsetParent) return;
      const br = btn.getBoundingClientRect();
      btn.querySelectorAll('span').forEach(sp => {
        const el = sp as HTMLElement;
        if (el.closest('[aria-hidden="true"], .material-symbols-outlined') || !(el.textContent ?? '').trim()) return;
        const r = el.getBoundingClientRect();
        if (r.left < br.left - 2 || r.right > br.right + 2) out.push(`nav[${(el.textContent ?? '').trim()}] ${Math.round(r.width)}>${Math.round(br.width)}`);
      });
    });
    return out;
  });
}

async function checkScreen(page: Page, info: TestInfo, locale: Locale, name: string, mustShow: string[]): Promise<void> {
  const dict = translations[locale];
  for (const key of mustShow) {
    const text = dict[key];
    expect(text, `missing ${locale} translation for ${key}`).toBeTruthy();
    await expect(page.getByText(text, { exact: false }).and(page.locator(':not([aria-live])')).first(), `${key} → "${text}"`).toBeVisible();
    // La versión inglesa no debe verse (si es distinta)
    if (en[key] !== text) {
      await expect(page.getByText(en[key], { exact: true }).and(page.locator(':visible'))).toHaveCount(0);
    }
  }
  const layout = await layoutReport(page);
  const clipped = [...await clippedTexts(page, locale), ...await navLabelOverflow(page)];
  await snap(page, info, `i18n-${locale}-${name}`);
  recordFinding(info, `i18n-${locale}-${name}`, { overflowX: layout.overflowX, clipped });
  expect(layout.overflowX, JSON.stringify(layout.overflowX)).toBeNull();
  expect(clipped, clipped.join('\n')).toEqual([]);
}

/** Barra inferior (su nombre accesible también va traducido) */
async function nav(page: Page) {
  const lang = (await page.locator('html').getAttribute('lang')) as Locale;
  return page.locator(`nav[aria-label="${translations[lang]['shell.main_nav']}"]:visible`);
}

async function openTab(page: Page, label: string): Promise<void> {
  // Nombre exacto (o con contador: "Chat (2)")
  const sel = `button[aria-label="${label}"], button[aria-label^="${label} ("]`;
  const tab = (await nav(page)).locator(sel);
  if (await tab.isVisible()) {
    await tab.click();
  } else {
    // >= 768px: menú lateral
    const dict = translations[(await page.locator('html').getAttribute('lang')) as Locale];
    await page.getByRole('button', { name: dict['shell.open_menu'] }).click();
    await page.locator('div.fixed.inset-0 nav').locator(sel).click();
  }
  await page.waitForTimeout(600);
}

for (const locale of LOCALES) {
  const t = translations[locale];

  test(`runner screens in ${locale}`, async ({ page }) => {
    const errs = collectErrors(page);
    await loginAs(page, 'runner');
    await switchLanguage(page, locale);

    await checkScreen(page, test.info(), locale, 'runner-hub', ['runner.hub.title', 'runner.scan_sticker', 'runner.scan_bin', 'runner.request_refill']);
    // Barra inferior traducida y sin cortar
    await expect((await nav(page)).locator(`button[aria-label^="${t['nav.warehouse']}"]`)).toBeVisible();

    await openTab(page, t['nav.runners']);
    await checkScreen(page, test.info(), locale, 'runner-crew', ['runner.crew.title']);

    await openTab(page, t['nav.warehouse']);
    await checkScreen(page, test.info(), locale, 'runner-warehouse', ['runner.warehouse.subtitle']);

    await openTab(page, t['nav.logistics']);
    await page.getByRole('button', { name: t['runner.scan_sticker'] }).click();
    const dialog = page.getByRole('dialog', { name: t['runner.scanner.title_bucket'] });
    await expect(dialog).toBeVisible();
    await page.getByRole('button', { name: t['scanner.problem_scanning'] }).click();
    await expect(page.getByLabel(t['runner.scanner.enter_code_bucket'])).toBeVisible();
    await checkScreen(page, test.info(), locale, 'runner-scanner', ['scanner.switch_camera', 'scanner.submit_code']);

    // Errores de consola: solo se apuntan (el cambio de idioma recarga y corta peticiones en vuelo)
    recordFinding(test.info(), `i18n-${locale}-console`, { errors: errs.errors });
  });

  test(`team leader screens in ${locale}`, async ({ page }) => {
    const errs = collectErrors(page);
    await loginAs(page, 'lead');
    await switchLanguage(page, locale);

    await checkScreen(page, test.info(), locale, 'lead-home', ['tl.home.crew_performance', 'tl.home.daily_progress']);

    await openTab(page, t['nav.roll_call']);
    await checkScreen(page, test.info(), locale, 'lead-roll-call', ['tl.attendance.title', 'tl.attendance.present']);

    await openTab(page, t['nav.tasks_map']);
    await checkScreen(page, test.info(), locale, 'lead-map', ['tl.tasks.my_rows', 'tl.tasks.active_rows']);

    await openTab(page, t['nav.chat']);
    await checkScreen(page, test.info(), locale, 'lead-chat', ['chat.field_comms']);

    // Errores de consola: solo se apuntan (el cambio de idioma recarga y corta peticiones en vuelo)
    recordFinding(test.info(), `i18n-${locale}-console`, { errors: errs.errors });
  });

  test(`payroll screens in ${locale}`, async ({ page }) => {
    await loginAs(page, 'payroll');
    await switchLanguage(page, locale);
    await checkScreen(page, test.info(), locale, 'payroll-dashboard', ['pay.total_buckets', 'pay.top_up_required', 'pay.picker_breakdown']);
    await openTab(page, t['nav.wage_calculator']);
    await checkScreen(page, test.info(), locale, 'payroll-calculator', ['pay.calc.title', 'pay.calc.total']);
  });

  test(`HR screens in ${locale}`, async ({ page }) => {
    await loginAs(page, 'hr');
    await switchLanguage(page, locale);
    await checkScreen(page, test.info(), locale, 'hr-home', ['hr.active_workers', 'hr.pending_contracts']);
  });
}
