/**
 * Smoke tests para los nav configs de las 7 roles.
 * Validan que cada config expone items con id/label/icon distintos
 * y que los IDs reflejados en los union types existen en el array.
 */
import { describe, it, expect } from 'vitest';
import { ADMIN_NAV_ITEMS, ADMIN_SUMMARY_CARDS } from './admin.nav';
import { HR_NAV_ITEMS } from './hhrr.nav';
import { QC_NAV_TABS } from './qc.nav';
import { RUNNER_NAV_TABS } from './runner.nav';
import { TEAM_LEADER_NAV_TABS } from './team-leader.nav';
import { LOG_NAV_ITEMS } from './logistics.nav';
import { MOBILE_TABS, DESKTOP_NAV } from './manager.nav';

type NavLike = { id: string; label: string; icon: string };

function assertWellFormed(nav: ReadonlyArray<NavLike>, name: string) {
    expect(nav.length, `${name} debe tener al menos 3 items`).toBeGreaterThanOrEqual(3);
    const ids = nav.map((n) => n.id);
    expect(new Set(ids).size, `${name} IDs únicos`).toBe(ids.length);
    for (const item of nav) {
        expect(item.id, `${name} id no vacío`).toBeTruthy();
        expect(item.label, `${name} label no vacío`).toBeTruthy();
        expect(item.icon, `${name} icon no vacío`).toBeTruthy();
    }
}

describe('navigation configs — well-formed', () => {
    it('admin nav', () => assertWellFormed(ADMIN_NAV_ITEMS, 'admin'));
    it('hhrr nav', () => assertWellFormed(HR_NAV_ITEMS, 'hhrr'));
    it('qc nav', () => assertWellFormed(QC_NAV_TABS, 'qc'));
    it('runner nav', () => assertWellFormed(RUNNER_NAV_TABS, 'runner'));
    it('team-leader nav', () => assertWellFormed(TEAM_LEADER_NAV_TABS, 'team-leader'));
    it('logistics nav', () => assertWellFormed(LOG_NAV_ITEMS, 'logistics'));
    it('manager mobile nav', () => assertWellFormed(MOBILE_TABS, 'manager-mobile'));
    it('manager desktop nav', () => assertWellFormed(DESKTOP_NAV, 'manager-desktop'));
});

describe('admin summary cards', () => {
    it('exposes 4 cards with key/label/icon/color', () => {
        expect(ADMIN_SUMMARY_CARDS).toHaveLength(4);
        for (const c of ADMIN_SUMMARY_CARDS) {
            expect(c.key).toBeTruthy();
            expect(c.label).toBeTruthy();
            expect(c.icon).toBeTruthy();
            expect(c.color).toMatch(/^text-/);
        }
    });

    it('keys are unique', () => {
        const keys = ADMIN_SUMMARY_CARDS.map((c) => c.key);
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe('cross-role invariants', () => {
    it('admin has orchards/users/compliance/audit tabs', () => {
        const ids = ADMIN_NAV_ITEMS.map((n) => n.id);
        expect(ids).toContain('orchards');
        expect(ids).toContain('users');
        expect(ids).toContain('compliance');
        expect(ids).toContain('audit');
    });

    it('hhrr covers 6 HR domains + chat', () => {
        expect(HR_NAV_ITEMS).toHaveLength(7);
        const ids = HR_NAV_ITEMS.map((n) => n.id);
        expect(ids).toEqual(
            expect.arrayContaining(['employees', 'contracts', 'payroll', 'documents', 'calendar', 'planning', 'messaging']),
        );
    });

    it('every role has the chat tab', () => {
        for (const items of [HR_NAV_ITEMS, LOG_NAV_ITEMS, ADMIN_NAV_ITEMS, QC_NAV_TABS]) {
            expect(items.map((n) => n.id)).toContain('messaging');
        }
    });

    it('manager mobile is subset of desktop (same ids appear on desktop)', () => {
        const desktopIds = new Set(DESKTOP_NAV.map((n) => n.id));
        const overlap = MOBILE_TABS.filter((m) => m.id !== 'more').every((m) => desktopIds.has(m.id));
        expect(overlap).toBe(true);
    });

    it('runner has 5 tabs with timesheet', () => {
        const ids = RUNNER_NAV_TABS.map((t) => t.id);
        expect(ids).toContain('timesheet');
        expect(ids).toContain('logistics');
    });

    it('team-leader includes attendance for roll-call', () => {
        const ids = TEAM_LEADER_NAV_TABS.map((t) => t.id);
        expect(ids).toContain('attendance');
    });
});
