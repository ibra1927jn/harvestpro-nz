/**
 * Aviso bajo «Notificaciones»: si llegan con la app cerrada o por qué no.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const unavailableReason = vi.fn();
const isRegistered = vi.fn();
vi.mock('@/services/push.service', () => ({
    pushService: { unavailableReason: () => unavailableReason(), isRegistered: () => isRegistered() },
}));

import { PushStatusHint, pushHintKey } from './PushStatusHint';

describe('PushStatusHint', () => {
    beforeEach(() => {
        unavailableReason.mockReturnValue(null);
        isRegistered.mockReturnValue(false);
    });

    it('says nothing while notifications are off (outside iOS)', () => {
        render(<PushStatusHint enabled={false} />);
        expect(screen.queryByTestId('push-status')).toBeNull();
    });

    it('on iPhone always explains it needs installing', () => {
        unavailableReason.mockReturnValue('ios_needs_install');
        expect(pushHintKey(false)).toBe('settings.push.ios_install');
        render(<PushStatusHint enabled={false} />);
        expect(screen.getByTestId('push-status')).toBeTruthy();
    });

    it('confirms when this device is registered', () => {
        isRegistered.mockReturnValue(true);
        expect(pushHintKey(true)).toBe('settings.push.active');
    });

    it('explains each reason it cannot work with the app closed', () => {
        unavailableReason.mockReturnValue('unsupported');
        expect(pushHintKey(true)).toBe('settings.push.unsupported');
        unavailableReason.mockReturnValue('not_configured');
        expect(pushHintKey(true)).toBe('settings.push.not_configured');
        unavailableReason.mockReturnValue('denied');
        expect(pushHintKey(true)).toBe('settings.push.denied');
        unavailableReason.mockReturnValue(null);
        expect(pushHintKey(true)).toBe('settings.push.open_only');
    });
});
