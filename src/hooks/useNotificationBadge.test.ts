/** La campana cuenta chat sin leer + avisos sin confirmar + avisos de calidad sin ver */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const state = vi.hoisted(() => ({
    messaging: { unreadCount: 2, broadcasts: [] as Array<{ sender_id: string; acknowledged_by: string[] }> },
    qcUnseen: 1,
}));
vi.mock('@/context/MessagingContext', () => ({ useMessaging: () => state.messaging }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ appUser: { id: 'me', role: 'qc_inspector' } }) }));
vi.mock('./useQcAlerts', () => ({ useQcAlerts: () => ({ unseenCount: state.qcUnseen }) }));

import { useNotificationBadge } from './useNotificationBadge';

describe('useNotificationBadge', () => {
    it('goes up when a broadcast arrives live', () => {
        const { result, rerender } = renderHook(() => useNotificationBadge());
        expect(result.current).toBe(3);
        state.messaging = { ...state.messaging, broadcasts: [{ sender_id: 'manager', acknowledged_by: [] }] };
        rerender();
        expect(result.current).toBe(4);
        state.messaging = { ...state.messaging, broadcasts: [{ sender_id: 'manager', acknowledged_by: ['me'] }] };
        rerender();
        expect(result.current).toBe(3);
    });
});
