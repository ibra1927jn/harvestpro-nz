/**
 * Tests for useNotifications hook
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock push.service
vi.mock('@/services/push.service', () => ({
    pushService: {
        isSupported: vi.fn().mockReturnValue(true),
        isSubscribed: vi.fn().mockResolvedValue(false),
        getPermissionState: vi.fn().mockReturnValue('default'),
        subscribe: vi.fn().mockResolvedValue({ endpoint: 'https://push.example.com' }),
        unsubscribe: vi.fn().mockResolvedValue(true),
        sendTestPush: vi.fn().mockResolvedValue(true),
    },
}));

// Mock notification.service
vi.mock('@/services/notification.service', () => ({
    notificationService: {
        getPrefs: vi.fn().mockReturnValue({
            enabled: false,
            types: { visa_expiry: true, qc_reject: true, transport: true, attendance: true },
        }),
        setEnabled: vi.fn().mockResolvedValue(true),
        setAlertTypes: vi.fn(),
        startChecking: vi.fn(),
        stopChecking: vi.fn(),
        sendTest: vi.fn().mockReturnValue({}),
    },
}));

import { useNotifications } from './useNotifications';
import { pushService } from '@/services/push.service';

describe('useNotifications', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns isSupported from pushService', () => {
        const { result } = renderHook(() => useNotifications());
        expect(result.current.isSupported).toBe(true);
    });

    it('returns initial permission state', () => {
        const { result } = renderHook(() => useNotifications());
        expect(result.current.permission).toBe('default');
    });

    it('returns prefs from notificationService', () => {
        const { result } = renderHook(() => useNotifications());
        expect(result.current.prefs.enabled).toBe(false);
        expect(result.current.prefs.types.visa_expiry).toBe(true);
    });

    it('subscribe calls pushService.subscribe', async () => {
        const { result } = renderHook(() => useNotifications());

        await act(async () => {
            await result.current.subscribe();
        });

        expect(pushService.subscribe).toHaveBeenCalledOnce();
    });

    it('unsubscribe calls pushService.unsubscribe', async () => {
        const { result } = renderHook(() => useNotifications());

        await act(async () => {
            await result.current.unsubscribe();
        });

        expect(pushService.unsubscribe).toHaveBeenCalledOnce();
    });

    it('sendTest calls pushService.sendTestPush when subscribed', async () => {
        vi.mocked(pushService.isSubscribed).mockResolvedValue(true);

        const { result } = renderHook(() => useNotifications());

        // Esperar a la comprobación inicial (sin dormir: hasta que el estado cambie)
        await vi.waitFor(() => expect(result.current.isSubscribed).toBe(true));

        await act(async () => {
            await result.current.sendTest();
        });

        expect(pushService.sendTestPush).toHaveBeenCalled();
    });
});
