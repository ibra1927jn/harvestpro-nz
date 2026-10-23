/**
 * «Empresa desde cero» (encargo A, 24-10): un cliente nuevo monta su huerto y
 * trabaja el primer día sin tocar SQL.
 *
 *   1. El primer admin se da de alta (/signup) y crea temporada, bloques y filas
 *      en «Estructura del huerto».
 *   2. Invita a un manager, un team leader y un runner (enlace de invitación).
 *   3. Cada uno se registra con su enlace.
 *   4. El team leader da de alta a un picker y lo ficha.
 *   5. El runner registra una cubeta de ese picker.
 *   6. El manager la ve.
 *
 * Ejecutar: `npm run test:e2e:fresh` (playwright.fresh.config.ts).
 * Base vacía (CI): alta real por /signup. Base con datos (Supabase local con la
 * demo): el alta pública está cerrada, así que se crea lo mismo que hace
 * provision-orchard con la clave de servicio, en un huerto aparte, y al final
 * se borra solo lo creado (ver e2e/fresh-company/db.ts).
 * Configuración: la de desarrollo (2FA apagado: VITE_MFA_ENFORCE=false y
 * scripts/dev-disable-mfa.sql), como el resto de e2e.
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import {
    cleanupShared, detectMode, lit, orchardIdByName, orphanCount, provisionLikeSignup, serverEnforcesMfa, sql, type FreshMode,
} from './fresh-company/db';

const RUN = Date.now().toString(36);
const PASSWORD = 'FreshCo2026!';
const ORCHARD = `E2E Fresh Orchard ${RUN}`;
const people = {
    admin: { name: 'Ana Admin', email: `e2e.fresh.admin.${RUN}@example.test` },
    manager: { name: 'Mere Manager', email: `e2e.fresh.manager.${RUN}@example.test`, role: 'manager' },
    teamLeader: { name: 'Tama Leader', email: `e2e.fresh.tl.${RUN}@example.test`, role: 'team_leader' },
    runner: { name: 'Rangi Runner', email: `e2e.fresh.runner.${RUN}@example.test`, role: 'runner' },
};
const PICKER = { name: `Pita Picker ${RUN}`, code: `FR${RUN.slice(-5).toUpperCase()}`, harness: `HN-${RUN.slice(-4).toUpperCase()}` };

test.describe.configure({ mode: 'serial' });

let mode: FreshMode = 'fresh';
let orchardId: string | null = null;
const invites: Record<string, string> = {};

let orphansBefore = 0;

test.beforeAll(() => {
    const mfaOn = serverEnforcesMfa();
    // En la CI una precondición que falta es un fallo (si no, el test se saltaría y saldría «verde»)
    if (mfaOn && process.env.CI) {
        throw new Error('The server enforces 2FA: the CI job must apply scripts/dev-disable-mfa.sql after the reset');
    }
    test.skip(mfaOn, 'The server enforces 2FA: run with the development settings (scripts/dev-disable-mfa.sql)');
    mode = detectMode();
    if (mode === 'shared') orphansBefore = orphanCount();
});

test.afterAll(() => {
    // Solo en la base compartida: borrar lo creado por la prueba y comprobar que no queda nada
    if (mode === 'shared' && orchardId && !process.env.E2E_FRESH_KEEP) {
        const emails = Object.values(people).map(p => p.email);
        cleanupShared(orchardId, emails);
        expect(sql(`select count(*) from public.orchards where id = ${lit(orchardId)}`)).toEqual(['0']);
        expect(sql(`select count(*) from auth.users where lower(email) in (${emails.map(e => lit(e.toLowerCase())).join(', ')})`)).toEqual(['0']);
        expect(sql(`select count(*) from public.pickers where picker_id = ${lit(PICKER.code)}`)).toEqual(['0']);
        // Ninguna fila hija huérfana (cubetas, fichajes, filas, chat, auditoría…)
        expect(orphanCount()).toBe(orphansBefore);
    }
});

async function login(page: Page, email: string, urlPattern: RegExp): Promise<void> {
    await page.goto('/login');
    // Tras el alta por /signup la sesión ya puede estar abierta: /login redirige a su panel
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput.or(page.locator('main, #main-content').first())).toBeVisible({ timeout: 20_000 });
    if (urlPattern.test(page.url())) return;
    await emailInput.fill(email);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(urlPattern, { timeout: 30_000 });
}

async function withPage<T>(browser: Browser, fn: (page: Page) => Promise<T>): Promise<T> {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
        return await fn(page);
    } finally {
        await context.close();
    }
}

test('1 — the first admin signs up and sets up season, blocks and rows', async ({ browser }) => {
    await withPage(browser, async page => {
        if (mode === 'fresh') {
            await page.goto('/signup');
            await page.getByPlaceholder('e.g. Sunny Hill Orchards').fill(ORCHARD);
            await page.getByRole('button', { name: /Continue/ }).click();
            await page.getByPlaceholder('e.g. James Wilson').fill(people.admin.name);
            await page.getByPlaceholder('james@sunnyhill.co.nz').fill(people.admin.email);
            await page.getByPlaceholder(/Min\. 8 chars/).fill(PASSWORD);
            await page.getByRole('button', { name: /Continue/ }).click();
            await page.locator('#accept-terms-checkbox').check();
            await page.locator('#accept-privacy-checkbox').check();
            await page.locator('#onboarding-submit-btn').click();
            await expect(page.getByText('Welcome to HarvestPro NZ!')).toBeVisible({ timeout: 30_000 });
            // El alta puede dejar la sesión abierta: se entra de nuevo con usuario y contraseña
            await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
            await page.context().clearCookies();
            orchardId = orchardIdByName(ORCHARD);
        } else {
            ({ orchardId } = await provisionLikeSignup({ orchardName: ORCHARD, adminName: people.admin.name, email: people.admin.email, password: PASSWORD }));
        }
        expect(orchardId).toBeTruthy();

        await login(page, people.admin.email, /\/admin/);
        await page.getByTestId(`admin-structure-${orchardId}`).click();
        const structure = page.getByTestId('orchard-structure');
        await expect(structure).toBeVisible();

        // Primera temporada (formulario abierto al no haber ninguna), activa
        await page.getByTestId('ostruct-create-season').click();
        await expect(page.getByTestId('ostruct-no-blocks')).toBeVisible({ timeout: 15_000 });

        // Bloques con sus filas: «filas 1–15 Royal Gala» y «16–20 Braeburn»
        for (const [name, from, to, variety] of [['Block A', '1', '15', 'Royal Gala'], ['Block B', '16', '20', 'Braeburn']] as const) {
            await page.getByTestId('ostruct-block-name').fill(name);
            await page.getByTestId('ostruct-block-from').fill(from);
            await page.getByTestId('ostruct-block-to').fill(to);
            await page.getByTestId('ostruct-block-variety').fill(variety);
            await page.getByTestId('ostruct-add-block').click();
            await expect(page.getByTestId(`ostruct-block-${name}`)).toContainText(`${Number(to) - Number(from) + 1} rows (${from}–${to})`, { timeout: 15_000 });
        }
        // Objetivo por rango en el bloque A
        await page.getByTestId('ostruct-open-Block A').click();
        await page.getByTestId('ostruct-rows-from').fill('1');
        await page.getByTestId('ostruct-rows-to').fill('5');
        await page.getByTestId('ostruct-rows-target').fill('80');
        await page.getByTestId('ostruct-rows-submit').click();
        await expect(page.getByText('5 rows updated')).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId('ostruct-block-Block B')).toContainText('Braeburn ×5');
    });
});

test('2 — the admin invites a manager, a team leader and a runner', async ({ browser }) => {
    await withPage(browser, async page => {
        await login(page, people.admin.email, /\/admin/);
        await page.getByRole('button', { name: /^Users/ }).first().click();
        const panel = page.getByTestId('invitations-panel');
        for (const key of ['manager', 'teamLeader', 'runner'] as const) {
            const p = people[key];
            const form = panel.getByRole('form', { name: 'Invite user' });
            // El formulario se queda abierto tras crear una invitación (el botón lo abre y cierra)
            if (!(await form.isVisible())) await panel.getByRole('button', { name: 'Invite user' }).click();
            await form.getByLabel('Email').fill(p.email);
            await form.getByLabel('Name (optional)').fill(p.name);
            await form.getByLabel('Role').selectOption(p.role);
            await form.getByLabel('Orchard').selectOption(orchardId ?? '');
            await form.getByRole('button', { name: 'Create invitation' }).click();
            const link = panel.getByTestId('invite-link').locator('input');
            await expect(link).toHaveValue(new RegExp(encodeURIComponent(p.email).replace(/\./g, '\\.')), { timeout: 15_000 });
            invites[key] = await link.inputValue();
        }
    });
});

test('3 — each one registers with the invitation link', async ({ browser }) => {
    for (const key of ['manager', 'teamLeader', 'runner'] as const) {
        const p = people[key];
        await withPage(browser, async page => {
            await page.goto(new URL(invites[key]).pathname + new URL(invites[key]).search);
            await expect(page.locator('input[type="email"]')).toHaveValue(p.email);
            await page.getByPlaceholder('John Doe').fill(p.name);
            await page.locator('input[type="password"]').fill(PASSWORD);
            await page.getByRole('button', { name: /Create Account/i }).click();
            // El alta crea la cuenta y su perfil con el rol y huerto de la invitación
            await expect.poll(() => profileOf(p.email), { timeout: 30_000 }).toBe(`${p.role}|${orchardId}`);
        });
        await withPage(browser, page =>
            login(page, p.email, key === 'manager' ? /\/manager/ : key === 'teamLeader' ? /\/team-leader/ : /\/runner/));
    }
});

test('4 — the team leader adds a picker and checks them in', async ({ browser }) => {
    await withPage(browser, async page => {
        await login(page, people.teamLeader.email, /\/team-leader/);
        await page.getByRole('button', { name: 'View All' }).click();
        await page.getByRole('button', { name: 'Add New Picker' }).click();
        await page.getByPlaceholder(/Liam O'Connor/).fill(PICKER.name);
        await page.getByPlaceholder('e.g. 402').fill(PICKER.code);
        await page.getByPlaceholder('HN-402').fill(PICKER.harness);
        await page.getByText('Safety Induction Completed').click();
        await page.getByRole('button', { name: 'Add Picker to Team' }).click();
        await expect(page.getByText(PICKER.name).first()).toBeVisible({ timeout: 20_000 });

        await page.getByRole('button', { name: 'Roll Call' }).first().click();
        await page.getByRole('button', { name: `Check in ${PICKER.name}` }).click();
        // El fichaje sale al servidor (manage-attendance)
        await expect.poll(() => checkedInToday(), { timeout: 30_000 }).toBe(true);
    });
});

test('5 — the runner records a bucket for that picker', async ({ browser }) => {
    await withPage(browser, async page => {
        await login(page, people.runner.email, /\/runner/);
        await page.getByRole('button', { name: /Scan Sticker/ }).click();
        await page.getByPlaceholder(/BKT-1024/).fill(PICKER.code);
        await page.getByRole('button', { name: 'Submit Code' }).click();
        await page.getByRole('button', { name: /Complete Batch \(1\)/ }).click();
        // La cubeta llega a la base (record-bucket, por la cola de sincronización)
        await expect.poll(() => bucketsToday(), { timeout: 45_000 }).toBe(1);
    });
});

test('6 — the manager sees the bucket', async ({ browser }) => {
    await withPage(browser, async page => {
        await login(page, people.manager.email, /\/manager/);
        await page.getByRole('button', { name: /Teams/ }).first().click();
        // El picker aparece con su cubeta en el equipo del team leader
        const row = page.getByText(PICKER.name).first();
        await expect(row).toBeVisible({ timeout: 30_000 });
        await page.getByRole('button', { name: /Dashboard/ }).first().click();
        await expect(page.getByTestId('no-rows-banner')).toHaveCount(0);
        // Tarjeta «Production»: 1 cubeta
        const production = page.locator('div.card-hover').filter({ hasText: /Production/i }).filter({ hasText: /buckets/i }).first();
        await expect(production.locator('h3')).toHaveText('1', { timeout: 30_000 });
    });
});

// ── Comprobaciones en la base ─────────────────────────────────────────────────

function profileOf(email: string): string {
    const [row] = sql(`select role || '|' || coalesce(orchard_id::text, '') from public.users where lower(email) = lower(${lit(email)})`);
    return row ?? '';
}

function checkedInToday(): boolean {
    const [n] = sql(`select count(*) from public.daily_attendance a join public.pickers p on p.id = a.picker_id
                     where p.picker_id = ${lit(PICKER.code)} and a.check_in is not null
                       and a.date = (now() at time zone 'Pacific/Auckland')::date`);
    return Number(n) > 0;
}

function bucketsToday(): number {
    const [n] = sql(`select count(*) from public.bucket_records b join public.pickers p on p.id = b.picker_id
                     where p.picker_id = ${lit(PICKER.code)}`);
    return Number(n);
}
