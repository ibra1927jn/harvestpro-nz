/**
 * messagingHelpers — constants + date/role formatting helpers.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    QUICK_REPLIES,
    REACTION_EMOJIS,
    getAvatarColor,
    isSameDay,
    getDateLabel,
    formatTime,
    getRoleBadge,
} from './messagingHelpers';

describe('constants', () => {
    it('QUICK_REPLIES expone 6 items con emoji + label', () => {
        expect(QUICK_REPLIES).toHaveLength(6);
        for (const q of QUICK_REPLIES) {
            expect(q.emoji.length).toBeGreaterThan(0);
            expect(q.label).toBeTruthy();
        }
    });

    it('REACTION_EMOJIS cubre 6 reacciones', () => {
        expect(REACTION_EMOJIS).toHaveLength(6);
        expect(REACTION_EMOJIS).toContain('👍');
        expect(REACTION_EMOJIS).toContain('❤️');
    });
});

describe('getAvatarColor', () => {
    it('devuelve un gradient "from-*-* to-*-*"', () => {
        expect(getAvatarColor('Alice')).toMatch(/^from-\w+-\d+ to-\w+-\d+$/);
    });

    it('es determinista: mismo nombre → mismo color', () => {
        expect(getAvatarColor('Bob')).toBe(getAvatarColor('Bob'));
    });

    it('name vacío no crashea (usa hash 0)', () => {
        expect(() => getAvatarColor('')).not.toThrow();
        expect(getAvatarColor('')).toMatch(/^from-/);
    });
});

describe('isSameDay', () => {
    it('true cuando el mismo día local', () => {
        const a = new Date('2026-04-18T01:00:00');
        const b = new Date('2026-04-18T23:59:59');
        expect(isSameDay(a, b)).toBe(true);
    });

    it('false para días diferentes', () => {
        const a = new Date('2026-04-18T00:00:00');
        const b = new Date('2026-04-19T00:00:00');
        expect(isSameDay(a, b)).toBe(false);
    });
});

describe('getDateLabel', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-18T12:00:00'));
    });
    afterEach(() => vi.useRealTimers());

    it('hoy → "Today"', () => {
        expect(getDateLabel('2026-04-18T09:00:00')).toBe('Today');
    });

    it('ayer → "Yesterday"', () => {
        expect(getDateLabel('2026-04-17T09:00:00')).toBe('Yesterday');
    });

    it('anterior → weekday + día + mes', () => {
        const label = getDateLabel('2026-04-10T09:00:00');
        // Formato en-NZ típico: "Fri, 10 Apr" (coma opcional según node/icu)
        expect(label).toMatch(/\w{3},? \d{1,2} \w{3}/);
    });
});

describe('formatTime', () => {
    it('devuelve HH:MM', () => {
        expect(formatTime('2026-04-18T09:05:00')).toMatch(/\d{1,2}:\d{2}/);
    });

    it('string inválido → ""', () => {
        expect(formatTime('')).toMatch(/^$|Invalid/);
    });
});

describe('getRoleBadge', () => {
    it('manager → purple admin icon', () => {
        const r = getRoleBadge('manager');
        expect(r.icon).toBe('admin_panel_settings');
        expect(r.bg).toContain('purple');
    });

    it('team_leader → blue supervisor icon', () => {
        expect(getRoleBadge('team_leader').icon).toBe('supervisor_account');
    });

    it('runner → amber directions_run icon', () => {
        expect(getRoleBadge('runner').icon).toBe('directions_run');
    });

    it('picker/default → agriculture emerald', () => {
        const r = getRoleBadge('picker');
        expect(r.icon).toBe('agriculture');
        expect(r.bg).toContain('emerald');
    });

    it('es case-insensitive', () => {
        expect(getRoleBadge('MANAGER').icon).toBe('admin_panel_settings');
    });
});

describe('chat times use NZ time even if the phone is set to another zone', () => {
    const realTz = process.env.TZ;
    beforeEach(() => {
        process.env.TZ = 'UTC'; // móvil/portátil con la zona mal puesta
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-04-18T12:30:00Z')); // 19 abr 00:30 en NZ
    });
    afterEach(() => {
        vi.useRealTimers();
        process.env.TZ = realTz;
    });

    it('shows the NZ clock time and the NZ day', () => {
        // 18 abr 23:30 en NZ: en UTC serían las 11:30 del mismo día
        expect(formatTime('2026-04-18T11:30:00Z')).toBe('23:30');
        expect(getDateLabel('2026-04-18T11:30:00Z')).toBe('Yesterday');
        expect(getDateLabel('2026-04-18T12:15:00Z')).toBe('Today');
    });

    it('labels the day in the app language', () => {
        expect(getDateLabel('2026-04-18T12:15:00Z', k => (k === 'common.today' ? 'Hoy' : k))).toBe('Hoy');
    });
});
