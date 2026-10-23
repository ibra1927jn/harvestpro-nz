/**
 * AccountSheet — «Mi cuenta»: secciones, guardar datos, foto, idioma,
 * contraseña, 2FA según rol, cierre (Escape / fondo / botón) y modo sin conexión.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@/test-utils';

const h = vi.hoisted(() => ({
    appUser: {
        id: 'u1',
        email: 'tl@orchard.nz',
        full_name: 'Tama Leader',
        role: 'team_leader',
        is_active: true,
        orchard_id: 'o1',
        avatar_url: null as string | null,
        phone: null as string | null,
        preferred_locale: null as string | null,
    },
    availableOrchards: [{ id: 'o1', name: 'Sunrise Orchard', total_rows: 20 }],
    updateAuthState: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    navigate: vi.fn(),
    online: true,
    service: {
        getMyProfile: vi.fn(),
        updateMyDetails: vi.fn(),
        updatePreferredLocale: vi.fn(),
        uploadAvatar: vi.fn(),
        removeAvatar: vi.fn(),
        changePassword: vi.fn(),
    },
    mfa: {
        checkMFAStatus: vi.fn(),
        unenrollMFA: vi.fn(),
    },
    notif: { enabled: false, setEnabled: vi.fn() },
}));

vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({
        appUser: h.appUser,
        orchardName: 'Sunrise Orchard',
        availableOrchards: h.availableOrchards,
        signOut: h.signOut,
        updateAuthState: h.updateAuthState,
    }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => h.navigate }));
vi.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isOnline: h.online }) }));
vi.mock('@/hooks/useAvatarUrl', () => ({
    useAvatarSignedUrl: (path: string | null | undefined) => (path ? `signed:${path}` : null),
    useUserAvatarUrl: () => null,
}));
vi.mock('@/services/account.service', () => ({ accountService: h.service }));
vi.mock('@/services/notification.service', () => ({
    notificationService: {
        getPrefs: () => ({ enabled: h.notif.enabled, types: {} }),
        setEnabled: h.notif.setEnabled,
    },
}));
vi.mock('@/services/config.service', () => ({ getConfig: () => ({ APP_VERSION: '9.9.0-test' }) }));
vi.mock('@/services/push.service', () => ({ pushService: { unavailableReason: () => null, isRegistered: () => false } }));
vi.mock('@/hooks/useMFA', () => ({ useMFA: () => h.mfa }));
vi.mock('@/components/MFASetup', () => ({
    MFASetup: ({ onComplete, friendlyName }: { onComplete: () => void; friendlyName: string }) => (
        <div data-testid="mfa-setup" data-name={friendlyName}>
            <button onClick={onComplete}>verify-new-factor</button>
        </div>
    ),
}));
vi.mock('@/stores/useHarvestStore', () => {
    const state = {
        crew: [
            { id: 'u1', picker_id: 'TL-001', name: 'Tama Leader', role: 'team_leader', status: 'active', team_leader_id: null },
            { id: 'p1', picker_id: 'P-001', name: 'Alice', role: 'picker', status: 'active', team_leader_id: 'u1' },
            { id: 'p2', picker_id: 'P-002', name: 'Bob', role: 'picker', status: 'active', team_leader_id: 'u1' },
        ],
        settings: { piece_rate: 4.25, min_wage_rate: 23.5, min_buckets_per_hour: 3.6, target_tons: 10 },
    };
    return { useHarvestStore: (sel: (s: typeof state) => unknown) => sel(state) };
});

import AccountSheet from './AccountSheet';

beforeEach(() => {
    vi.clearAllMocks();
    h.online = true;
    h.appUser = { ...h.appUser, role: 'team_leader', avatar_url: null, phone: null, full_name: 'Tama Leader' };
    h.service.getMyProfile.mockResolvedValue({ ok: true, data: null });
    h.service.updateMyDetails.mockImplementation(async (input: { full_name: string; phone: string }) => ({
        ok: true, data: { id: 'u1', full_name: input.full_name.trim(), phone: input.phone || null, preferred_locale: null, avatar_url: null },
    }));
    h.service.updatePreferredLocale.mockResolvedValue({ ok: true, data: {} });
    h.service.uploadAvatar.mockResolvedValue({ ok: true, data: 'u1/avatar-2.jpg' });
    h.service.removeAvatar.mockResolvedValue({ ok: true, data: null });
    h.service.changePassword.mockResolvedValue({ ok: true, data: null });
    h.mfa.checkMFAStatus.mockResolvedValue({ enabled: false, factors: [], hasVerifiedFactor: false });
    h.mfa.unenrollMFA.mockResolvedValue({});
    h.notif.setEnabled.mockResolvedValue(true);
});

const open = () => {
    const onClose = vi.fn();
    render(<AccountSheet onClose={onClose} />);
    return onClose;
};

describe('AccountSheet', () => {
    it('shows every section, the read-only work data and the real app version', async () => {
        open();
        expect(screen.getByRole('dialog', { name: 'My account' })).toBeTruthy();
        for (const name of ['Photo', 'My details', 'Language', 'Security', 'My work', 'Notifications']) {
            expect(screen.getByRole('region', { name })).toBeTruthy();
        }
        expect(screen.getByText('Team Leader')).toBeTruthy();
        expect(screen.getByText('Sunrise Orchard')).toBeTruthy();
        expect(screen.getByText('2 members')).toBeTruthy();
        expect(screen.getByText('TL-001')).toBeTruthy();
        expect(screen.getByText('$4.25 / bin')).toBeTruthy();
        expect(screen.getByText('$23.50 / hr')).toBeTruthy();
        expect(screen.getByText('HarvestPro NZ v9.9.0-test')).toBeTruthy();
        expect(screen.queryByText(/Build 2024/)).toBeNull();
        // Datos de RRHH: solo el aviso, ningún campo
        expect(screen.getByText(/contract: HR/)).toBeTruthy();
        expect(screen.queryByLabelText(/IRD|Bank|Visa/i)).toBeNull();
        await waitFor(() => expect(h.service.getMyProfile).toHaveBeenCalledWith('u1'));
    });

    it('saves display name and phone through the service and refreshes the auth state', async () => {
        open();
        fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Tama L.' } });
        fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '021 555 123' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(h.service.updateMyDetails).toHaveBeenCalledWith({ full_name: 'Tama L.', phone: '021 555 123' }));
        expect(await screen.findByText('Details saved')).toBeTruthy();
        expect(h.updateAuthState).toHaveBeenCalledWith(expect.objectContaining({
            appUser: expect.objectContaining({ full_name: 'Tama L.', phone: '021 555 123' }),
            userName: 'Tama L.',
        }));
    });

    it('shows the translated error when saving fails', async () => {
        h.service.updateMyDetails.mockResolvedValue({ ok: false, error: { code: 'INVALID_NAME', message: 'x' } });
        open();
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Display name: 2 to 80 characters.');
    });

    it('changes the app language at once and saves the preference to the account', async () => {
        open();
        expect(screen.getByRole('button', { name: /English/ }).getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(screen.getByRole('button', { name: /Español/ }));
        await waitFor(() => expect(h.service.updatePreferredLocale).toHaveBeenCalledWith('es'));
        expect(await screen.findByRole('dialog', { name: 'Mi cuenta' })).toBeTruthy();
        expect(h.updateAuthState).toHaveBeenCalledWith(expect.objectContaining({
            appUser: expect.objectContaining({ preferred_locale: 'es' }),
        }));
        // Vuelta al inglés para el resto de tests
        expect(screen.getByRole('button', { name: /Español/ }).getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(screen.getByRole('button', { name: /English/ }));
        expect(await screen.findByRole('dialog', { name: 'My account' })).toBeTruthy();
    });

    it('offers only English, Spanish and French', () => {
        open();
        const names = ['English', 'Español', 'Français', 'Te Reo Māori', 'Gagana Samoa', 'हिन्दी', 'Lea Faka-Tonga', 'Filipino'];
        const offered = names.filter(n => screen.queryByRole('button', { name: new RegExp(n) }) !== null);
        expect(offered).toEqual(['English', 'Español', 'Français']);
    });

    it('uploads a chosen photo and removes it again', async () => {
        open();
        const input = screen.getByLabelText('Change photo') as HTMLInputElement;
        const file = new File([new Uint8Array(10)], 'me.jpg', { type: 'image/jpeg' });
        await act(async () => {
            fireEvent.change(input, { target: { files: [file] } });
        });
        await waitFor(() => expect(h.service.uploadAvatar).toHaveBeenCalledWith(file, 'u1', null));
        expect(await screen.findByText('Photo updated')).toBeTruthy();
        expect(h.updateAuthState).toHaveBeenCalledWith(expect.objectContaining({
            appUser: expect.objectContaining({ avatar_url: 'u1/avatar-2.jpg' }),
        }));
    });

    it('offers "Remove photo" only when there is one, and clears it', async () => {
        h.appUser = { ...h.appUser, avatar_url: 'u1/avatar-1.jpg' };
        open();
        expect((screen.getByRole('img', { name: 'Tama Leader' }) as HTMLImageElement).src).toContain('signed:u1/avatar-1.jpg');
        fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
        await waitFor(() => expect(h.service.removeAvatar).toHaveBeenCalledWith('u1', 'u1/avatar-1.jpg'));
        expect(await screen.findByText('Photo removed')).toBeTruthy();
    });

    it('changes the password with current + new + repeat', async () => {
        open();
        fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'oldpass123' } });
        fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'newpass123' } });
        fireEvent.change(screen.getByLabelText('Repeat new password'), { target: { value: 'newpass123' } });
        fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
        await waitFor(() => expect(h.service.changePassword).toHaveBeenCalledWith('tl@orchard.nz', 'oldpass123', 'newpass123', 'newpass123'));
        expect(await screen.findByText('Password changed')).toBeTruthy();
        expect((screen.getByLabelText('Current password') as HTMLInputElement).value).toBe('');
    });

    it('2FA: not offered to field roles; status + regenerate for privileged roles, unenrolling the old factor', async () => {
        open();
        expect(screen.getByText('Not required for your role.')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /2FA/ })).toBeNull();
    });

    it('2FA for a manager: shows when it was enabled and regenerates it', async () => {
        h.appUser = { ...h.appUser, role: 'manager' };
        h.mfa.checkMFAStatus
            .mockResolvedValueOnce({ enabled: true, hasVerifiedFactor: true, factors: [
                { id: 'old', type: 'totp', status: 'verified', created_at: '2026-09-01T00:00:00Z', updated_at: '' },
            ] })
            .mockResolvedValueOnce({ enabled: true, hasVerifiedFactor: true, factors: [
                { id: 'old', type: 'totp', status: 'verified', created_at: '2026-09-01T00:00:00Z', updated_at: '' },
                { id: 'new', type: 'totp', status: 'verified', created_at: '2026-10-22T00:00:00Z', updated_at: '' },
                { id: 'half', type: 'totp', status: 'unverified', created_at: '2026-10-01T00:00:00Z', updated_at: '' },
            ] })
            .mockResolvedValue({ enabled: true, hasVerifiedFactor: true, factors: [
                { id: 'new', type: 'totp', status: 'verified', created_at: '2026-10-22T00:00:00Z', updated_at: '' },
            ] });
        open();
        expect(await screen.findByText(/Enabled since/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Regenerate 2FA' }));
        const setup = await screen.findByTestId('mfa-setup');
        expect(setup.getAttribute('data-name')).toMatch(/^HarvestPro Authenticator /);
        fireEvent.click(screen.getByText('verify-new-factor'));
        await waitFor(() => expect(h.mfa.unenrollMFA).toHaveBeenCalledWith('old'));
        expect(h.mfa.unenrollMFA).toHaveBeenCalledWith('half');
        expect(h.mfa.unenrollMFA).not.toHaveBeenCalledWith('new');
        expect(await screen.findByText('2FA updated')).toBeTruthy();
    });

    it('toggles push notifications through the notification service', async () => {
        open();
        fireEvent.click(screen.getByRole('switch'));
        await waitFor(() => expect(h.notif.setEnabled).toHaveBeenCalledWith(true));
    });

    it('closes with the close button, Escape and the backdrop', () => {
        const onClose = open();
        fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(2);
        const dialog = screen.getByRole('dialog', { name: 'My account' });
        fireEvent.click(dialog.previousElementSibling as Element);
        expect(onClose).toHaveBeenCalledTimes(3);
    });

    it('signs out and goes to the login page', async () => {
        open();
        fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }));
        await waitFor(() => expect(h.signOut).toHaveBeenCalled());
        expect(h.navigate).toHaveBeenCalledWith('/login', { replace: true });
    });

    it('offline: shows the notice and disables saving, photo and password (nothing is queued)', () => {
        h.online = false;
        open();
        expect(screen.getByText(/You are offline/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Change photo' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Update password' })).toBeDisabled();
        expect(h.service.getMyProfile).not.toHaveBeenCalled();
    });
});
