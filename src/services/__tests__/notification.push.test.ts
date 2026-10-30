/**
 * El interruptor «Notificaciones» activa también el push de este dispositivo,
 * y las casillas de tipos llegan al servidor (tipos silenciados).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const enable = vi.fn().mockResolvedValue({ ok: true });
const disable = vi.fn().mockResolvedValue(undefined);
const setMutedTypes = vi.fn().mockResolvedValue(undefined);
const resync = vi.fn().mockResolvedValue(undefined);
vi.mock('../push.service', () => ({
    pushService: { enable, disable, setMutedTypes, resync, listenForRenewals: vi.fn() },
}));
vi.mock('../supabase', () => ({ supabase: { from: vi.fn() } }));

import { notificationService, mutedTypesOf } from '../notification.service';

describe('notifications ↔ push', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        Object.defineProperty(window, 'Notification', {
            value: { permission: 'granted', requestPermission: vi.fn().mockResolvedValue('granted') },
            configurable: true, writable: true,
        });
        notificationService.stopChecking();
    });

    it('unchecked types are the muted ones', () => {
        expect(mutedTypesOf({ visa_expiry: true, qc_reject: false, transport: false, attendance: true })).toEqual(['qc_reject', 'transport']);
    });

    it('turning notifications on subscribes this device with its muted types', async () => {
        notificationService.setAlertTypes({ transport: false });
        await notificationService.setEnabled(true);
        expect(enable).toHaveBeenCalledWith(['transport']);
        notificationService.stopChecking();
    });

    it('turning them off removes the subscription', async () => {
        await notificationService.setEnabled(false);
        expect(disable).toHaveBeenCalled();
    });

    it('changing a type while on updates the server', async () => {
        await notificationService.setEnabled(true);
        notificationService.stopChecking();
        notificationService.setAlertTypes({ qc_reject: false });
        await vi.waitFor(() => expect(setMutedTypes).toHaveBeenCalledWith(['qc_reject']));
    });

    it('resume() after sign-in renews the subscription when notifications were on', async () => {
        await notificationService.setEnabled(true);
        notificationService.stopChecking();
        await notificationService.resume();
        notificationService.stopChecking();
        expect(resync).toHaveBeenCalled();
    });
});
