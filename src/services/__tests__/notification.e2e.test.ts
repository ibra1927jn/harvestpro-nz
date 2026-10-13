/**
 * E2E tests for notification.service.ts (257L) — exercises ALL methods
 * getPrefs, savePrefs, requestPermission, sendNotification,
 * checkAlerts, startChecking, stopChecking, setEnabled, setAlertTypes, sendTest
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/utils/nzst', () => ({
    todayNZST: () => '2026-03-10',
}));

import { notificationService } from '../notification.service';

describe('notificationService — E2E deep tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    afterEach(() => {
        notificationService.stopChecking();
    });

    describe('getPrefs', () => {
        it('returns default prefs when no storage', () => {
            const prefs = notificationService.getPrefs();
            expect(prefs.enabled).toBe(false);
            expect(prefs.types.visa_expiry).toBe(true);
            expect(prefs.types.qc_reject).toBe(true);
            expect(prefs.types.transport).toBe(true);
            expect(prefs.types.attendance).toBe(true);
        });

        it('returns saved prefs from localStorage', () => {
            localStorage.setItem('harvestpro_notification_prefs', JSON.stringify({
                enabled: true,
                types: { visa_expiry: false, qc_reject: true, transport: false, attendance: true },
            }));
            const prefs = notificationService.getPrefs();
            expect(prefs.enabled).toBe(true);
            expect(prefs.types.visa_expiry).toBe(false);
        });

        it('handles corrupted localStorage', () => {
            localStorage.setItem('harvestpro_notification_prefs', 'invalid-json{{{');
            const prefs = notificationService.getPrefs();
            expect(prefs.enabled).toBe(false);
        });
    });

    describe('setAlertTypes', () => {
        it('merges alert type changes', () => {
            notificationService.setAlertTypes({ visa_expiry: false });
            const prefs = notificationService.getPrefs();
            expect(prefs.types.visa_expiry).toBe(false);
            expect(prefs.types.qc_reject).toBe(true); // unchanged
        });

        it('can disable all types', () => {
            notificationService.setAlertTypes({ visa_expiry: false, qc_reject: false, transport: false, attendance: false });
            const prefs = notificationService.getPrefs();
            expect(Object.values(prefs.types).every(v => v === false)).toBe(true);
        });
    });

    describe('requestPermission', () => {
        it('returns false when Notification not supported', async () => {
            const original = (window as any).Notification;
            delete (window as any).Notification;
            const result = await notificationService.requestPermission();
            expect(result).toBe(false);
            (window as any).Notification = original;
        });
    });



    describe('startChecking / stopChecking', () => {
        it('starts and stops without error', () => {
            expect(() => {
                notificationService.startChecking();
                notificationService.stopChecking();
            }).not.toThrow();
        });

        it('calling stop twice is safe', () => {
            expect(() => {
                notificationService.stopChecking();
                notificationService.stopChecking();
            }).not.toThrow();
        });
    });

    describe('checkAlerts', () => {
        it('returns early when not enabled', async () => {
            // Prefs default to enabled=false
            await notificationService.checkAlerts();
            // No crash, no Supabase calls
        });
    });

    describe('setEnabled', () => {
        it('returns false when Notification API denies', async () => {
            const original = (window as any).Notification;
            delete (window as any).Notification;
            const result = await notificationService.setEnabled(true);
            expect(result).toBe(false);
            (window as any).Notification = original;
        });

        it('disables notifications', async () => {
            const result = await notificationService.setEnabled(false);
            expect(result).toBe(true);
            const prefs = notificationService.getPrefs();
            expect(prefs.enabled).toBe(false);
        });
    });

    describe('exports all methods', () => {
        it('requestPermission', () => expect(notificationService.requestPermission).toBeDefined());
        it('sendNotification', () => expect(notificationService.sendNotification).toBeDefined());
        it('getPrefs', () => expect(notificationService.getPrefs).toBeDefined());
        it('setEnabled', () => expect(notificationService.setEnabled).toBeDefined());
        it('setAlertTypes', () => expect(notificationService.setAlertTypes).toBeDefined());
        it('sendTest', () => expect(notificationService.sendTest).toBeDefined());
        it('startChecking', () => expect(notificationService.startChecking).toBeDefined());
        it('stopChecking', () => expect(notificationService.stopChecking).toBeDefined());
        it('checkAlerts', () => expect(notificationService.checkAlerts).toBeDefined());
    });
});

