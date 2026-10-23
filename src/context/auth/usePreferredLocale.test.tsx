/**
 * usePreferredLocale — el idioma guardado en la cuenta se aplica UNA vez al
 * cargar el perfil y no pisa un cambio manual posterior en la sesión.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

const i18n = vi.hoisted(() => ({ locale: 'en', setLocale: vi.fn() }));
vi.mock('@/i18n', () => ({
    useI18n: () => ({ locale: i18n.locale, setLocale: i18n.setLocale }),
}));

import { usePreferredLocale } from './usePreferredLocale';

const Probe: React.FC<{ userId?: string; preferred?: string | null }> = ({ userId, preferred }) => {
    usePreferredLocale(userId, preferred);
    return null;
};

beforeEach(() => {
    i18n.locale = 'en';
    i18n.setLocale.mockReset().mockResolvedValue(true);
});

describe('usePreferredLocale', () => {
    it('applies the saved locale once when the account loads', async () => {
        const { rerender } = render(<Probe />);
        expect(i18n.setLocale).not.toHaveBeenCalled();
        await act(async () => { rerender(<Probe userId="u1" preferred="es" />); });
        expect(i18n.setLocale).toHaveBeenCalledWith('es');
        expect(i18n.setLocale).toHaveBeenCalledTimes(1);
    });

    it('does not override a manual change later in the session (profile refresh or saved preference)', async () => {
        const { rerender } = render(<Probe userId="u1" preferred="es" />);
        await act(async () => undefined);
        expect(i18n.setLocale).toHaveBeenCalledTimes(1);
        // La persona cambia a mano a inglés y luego el perfil llega de nuevo con 'es' (otro dispositivo)
        i18n.locale = 'en';
        await act(async () => { rerender(<Probe userId="u1" preferred="es" />); });
        await act(async () => { rerender(<Probe userId="u1" preferred="mi" />); });
        expect(i18n.setLocale).toHaveBeenCalledTimes(1);
    });

    it('does nothing for an unknown or empty preference, and nothing when it already matches', async () => {
        const { rerender } = render(<Probe userId="u1" preferred={null} />);
        await act(async () => { rerender(<Probe userId="u1" preferred="xx" />); });
        expect(i18n.setLocale).not.toHaveBeenCalled();
        i18n.locale = 'es';
        await act(async () => { rerender(<Probe userId="u2" preferred="es" />); });
        expect(i18n.setLocale).not.toHaveBeenCalled();
    });

    it('applies again for a different account (new login on the same device)', async () => {
        const { rerender } = render(<Probe userId="u1" preferred="es" />);
        await act(async () => undefined);
        i18n.locale = 'en'; // u1 cambió a mano a inglés antes de salir
        await act(async () => { rerender(<Probe userId="u2" preferred="es" />); });
        expect(i18n.setLocale).toHaveBeenNthCalledWith(1, 'es');
        expect(i18n.setLocale).toHaveBeenNthCalledWith(2, 'es');
    });

    it('a saved language that the app no longer offers (mi, sm, hi, to, tl) is ignored: stays in English', async () => {
        for (const [n, removed] of ['mi', 'sm', 'hi', 'to', 'tl'].entries()) {
            const { unmount } = render(<Probe userId={`old-${n}`} preferred={removed} />);
            await act(async () => undefined);
            unmount();
        }
        expect(i18n.setLocale).not.toHaveBeenCalled();
        expect(i18n.locale).toBe('en');
    });
});
