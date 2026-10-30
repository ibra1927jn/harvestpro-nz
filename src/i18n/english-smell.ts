/**
 * i18n/english-smell.ts — Strings canónicas por sección que DEBEN estar
 * traducidas al ES y al FR (english-smell.test.ts).
 *
 * Cada entrada registra:
 *   section  — agrupación lógica para reportes legibles
 *   key      — clave de traducción
 *   en       — valor EN de referencia (lo que NO debe aparecer en ES)
 *
 * Uso: english-smell.test.ts los consume para verificar que las traducciones
 * ES difieren del inglés y que no hay "english smell" en los valores.
 *
 * AÑADIR una entrada aquí cada vez que se agregue una nueva clave
 * de UI visible en producción.
 */

export interface SmellEntry {
    section: string;
    key: string;
    en: string;
}

export const CANONICAL_TRANSLATIONS: SmellEntry[] = [
    // ── Nav ──────────────────────────────────────────────────────
    { section: 'nav', key: 'nav.dashboard',  en: 'Dashboard' },
    { section: 'nav', key: 'nav.teams',      en: 'Teams' },
    { section: 'nav', key: 'nav.map',        en: 'Orchard Map' },
    { section: 'nav', key: 'nav.insights',   en: 'Insights' },
    { section: 'nav', key: 'nav.settings',   en: 'Settings' },
    { section: 'nav', key: 'nav.messaging',  en: 'Messaging' },

    // ── Dashboard ─────────────────────────────────────────────────
    { section: 'dashboard', key: 'dashboard.title',              en: 'Orchard Overview' },
    { section: 'dashboard', key: 'dashboard.live_monitoring',    en: 'Live monitoring' },
    { section: 'dashboard', key: 'dashboard.velocity',           en: 'Velocity' },
    { section: 'dashboard', key: 'dashboard.production',         en: 'Production' },
    { section: 'dashboard', key: 'dashboard.active_crew',        en: 'Active Crew' },
    { section: 'dashboard', key: 'dashboard.daily_target',       en: 'Daily Target' },
    { section: 'dashboard', key: 'dashboard.projected',          en: 'Projected end-of-day' },
    { section: 'dashboard', key: 'dashboard.goal_progress',      en: 'Goal Progress' },
    { section: 'dashboard', key: 'dashboard.performance_focus',  en: 'Performance Focus' },

    // Velocity chart
    { section: 'dashboard/velocity', key: 'dashboard.velocity.title',           en: 'Velocity (Hourly)' },
    { section: 'dashboard/velocity', key: 'dashboard.velocity.subtitle',        en: 'Last 8 hours' },
    { section: 'dashboard/velocity', key: 'dashboard.velocity.total_buckets',   en: 'total buckets' },
    { section: 'dashboard/velocity', key: 'dashboard.velocity.awaiting',        en: 'Awaiting First Scan' },
    { section: 'dashboard/velocity', key: 'dashboard.velocity.current_hour',    en: 'Current hour' },
    { section: 'dashboard/velocity', key: 'dashboard.velocity.above_target',    en: 'Above target' },
    { section: 'dashboard/velocity', key: 'dashboard.velocity.below_target',    en: 'Below target' },
    { section: 'dashboard/velocity', key: 'dashboard.velocity.drilldown_title', en: 'Hour Breakdown' },
    { section: 'dashboard/velocity', key: 'dashboard.velocity.drilldown_empty', en: 'No scans this hour' },

    // ── Common ────────────────────────────────────────────────────
    { section: 'common', key: 'common.loading',   en: 'Loading…' },
    { section: 'common', key: 'common.error',     en: 'Something went wrong' },
    { section: 'common', key: 'common.retry',     en: 'Retry' },
    { section: 'common', key: 'common.cancel',    en: 'Cancel' },
    { section: 'common', key: 'common.save',      en: 'Save' },
    { section: 'common', key: 'common.close',     en: 'Close' },
    { section: 'common', key: 'common.search',    en: 'Search' },
    { section: 'common', key: 'common.today',     en: 'Today' },
    { section: 'common', key: 'common.sign_out',  en: 'Sign Out' },

    // ── Auth ──────────────────────────────────────────────────────
    { section: 'auth', key: 'auth.sign_in',              en: 'Sign In' },
    { section: 'auth', key: 'auth.email',                en: 'Email' },
    { section: 'auth', key: 'auth.password',             en: 'Password' },
    { section: 'auth', key: 'auth.twoFactor.title',      en: 'Two-Factor Authentication' },
    { section: 'auth', key: 'auth.twoFactor.verify',     en: 'Verify' },
    { section: 'auth', key: 'auth.twoFactor.error_invalid', en: 'Invalid code. Please try again.' },

    // ── Teams ─────────────────────────────────────────────────────
    { section: 'teams', key: 'teams.header',        en: 'Teams & Hierarchy' },
    { section: 'teams', key: 'teams.team_leader',   en: 'Team Leader' },
    { section: 'teams', key: 'teams.harvest_teams', en: 'Harvest Teams' },
    { section: 'teams', key: 'teams.active_runners',en: 'Active Runners' },
    { section: 'teams', key: 'teams.bins_today',    en: 'bins today' },

    // ── Insights ──────────────────────────────────────────────────
    { section: 'insights', key: 'insights.header',                en: 'Insights & Analytics' },
    { section: 'insights', key: 'insights.tabs.analytics',        en: 'Analytics' },
    { section: 'insights', key: 'insights.tabs.report',           en: 'Weekly Report' },
    { section: 'insights', key: 'insights.kpi.cost_per_bin',      en: 'COST/BIN' },
    { section: 'insights', key: 'insights.kpi.total_bins',        en: 'TOTAL BINS' },
    { section: 'insights', key: 'insights.kpi.total_labour',      en: 'TOTAL LABOUR' },
    { section: 'insights', key: 'insights.cost_breakdown.title',  en: 'Cost Breakdown' },
    { section: 'insights', key: 'insights.trend.title',           en: 'Cost Per Bin — 7 Day Trend' },
    { section: 'insights', key: 'insights.team_cost.title',       en: 'Team Cost' },
    { section: 'insights', key: 'insights.efficient.most.title',  en: 'Most Efficient' },
    { section: 'insights', key: 'insights.efficient.least.title', en: 'Least Efficient' },

    // ── Settings ──────────────────────────────────────────────────
    { section: 'settings', key: 'settings.title',               en: 'Settings' },
    { section: 'settings', key: 'settings.harvest.title',       en: 'Harvest Configuration' },
    { section: 'settings', key: 'settings.compliance.title',    en: 'Compliance Settings' },
    { section: 'settings', key: 'settings.danger.title',        en: 'Danger Zone' },
    { section: 'settings', key: 'settings.orchard.title',       en: 'Orchard Details' },

    // ── Panel (picker/runner/TL drawer) ───────────────────────────
    { section: 'panel', key: 'panel.picker.bins',     en: 'BUCKETS' },
    { section: 'panel', key: 'panel.picker.earned',   en: 'EARNED' },
    { section: 'panel', key: 'panel.tl.roster',       en: 'Team Roster' },
    { section: 'panel', key: 'panel.tabs.today',      en: 'Today' },
    { section: 'panel', key: 'panel.tabs.history',    en: 'History' },
    { section: 'panel', key: 'panel.tabs.quality',    en: 'Quality' },

    // ── Fraud shield ──────────────────────────────────────────────
    { section: 'fraud', key: 'fraud.title',         en: 'Fraud Shield' },
    { section: 'fraud', key: 'fraud.high',          en: 'High' },
    { section: 'fraud', key: 'fraud.medium',        en: 'Medium' },
    { section: 'fraud', key: 'fraud.low',           en: 'Low' },
    { section: 'fraud', key: 'fraud.no_anomalies',  en: 'No anomalies detected' },
    { section: 'fraud', key: 'fraud.analyzing',     en: 'Analyzing scan patterns…' },

    // ── Scanner ───────────────────────────────────────────────────
    { section: 'scanner', key: 'scanner.scan',           en: 'Scan' },
    { section: 'scanner', key: 'scanner.align_qr',       en: 'Align the QR code in the frame' },
    { section: 'scanner', key: 'scanner.scanned',        en: 'Scanned ✓' },

    // ── Misc ──────────────────────────────────────────────────────
    { section: 'misc', key: 'timesheet.title', en: 'Timesheet Editor' },
    { section: 'misc', key: 'sync.all_clear',  en: 'All Clear!' },

    // ── Estructura del huerto y huerto nuevo ─────────────────────
    { section: 'orchard-setup', key: 'nav.structure',          en: 'Orchard setup' },
    { section: 'orchard-setup', key: 'ostruct.seasons',        en: 'Seasons' },
    { section: 'orchard-setup', key: 'ostruct.add_block',      en: 'Add block' },
    { section: 'orchard-setup', key: 'ostruct.mode_range',     en: 'Set a range' },
    { section: 'orchard-setup', key: 'owiz.title',             en: 'New Orchard Setup' },
    { section: 'orchard-setup', key: 'owiz.step.structure',    en: 'Season & blocks' },
];

/**
 * Claves que pueden tener el mismo valor en EN y ES (abreviaturas,
 * nombres propios, símbolos) — excluidas del smell check.
 */
export const EXEMPT_FROM_DIFF_CHECK = new Set<string>([
    'common.per_hour',     // '/hr' es igual en ambos idiomas
    'common.nzd',          // 'NZD' — código de moneda
    'common.hours_short',  // 'h' — abreviatura universal
    'common.bins',         // puede coincidir según traducción
]);

// ─── Francés ─────────────────────────────────────────────────────────

/** Palabras que se escriben igual en inglés y en francés (o que se dejan en inglés a propósito). */
export const FR_SAME_AS_EN_WORDS: ReadonlySet<string> = new Set<string>([
    // Términos del sector y del producto que no se traducen
    'bin', 'bins', 'runner', 'runners', 'kia', 'ora',
    // Marcas, formatos y siglas
    'nzd', 'csv', 'excel', 'google', 'sheets', 'xero', 'paysauce', 'pdf', 'qr', 'id', 'rej', 'ok',
    'kiwisaver', 'ird', 'paye', 'email',
    // Unidades
    'h', 'min',
    // Palabras francesas que coinciden con el inglés
    'photo', 'conversation', 'conversations', 'direct', 'production', 'stable', 'type', 'visa',
    'notes', 'total', 'transit', 'zone', 'inactive', 'action', 'date', 'message', 'acceptable',
    'stock', 'transport', 'active', 'notifications', 'avatar', 'menu', 'documents', 'maintenance',
    'permanent', 'cycles',
]);

/** Palabras de un texto (sin placeholders {x}, números ni signos). */
function words(text: string): string[] {
    return text
        .replace(/\{[A-Za-z_][A-Za-z0-9_]*\}/g, ' ')
        .toLowerCase()
        .split(/[^a-zà-ÿœæ]+/)
        .filter(Boolean);
}

/** true si un texto inglés puede quedarse igual en francés (todas sus palabras están en la lista). */
export function frSameAsEnIsOk(text: string): boolean {
    return words(text).every(w => FR_SAME_AS_EN_WORDS.has(w));
}
