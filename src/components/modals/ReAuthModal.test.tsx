/**
 * Tests for ReAuthModal — Session re-authentication when JWT expired
 * Critical component: prevents data loss from dead sessions
 * @module components/modals/ReAuthModal.test
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    signInWithPassword: vi.fn(),
    getPendingCount: vi.fn().mockResolvedValue(5),
}));

vi.mock('@/services/config.service', () => ({
    getConfig: () => ({ SUPABASE_URL: 'x', SUPABASE_ANON_KEY: 'k' }),
}));
vi.mock('@/services/supabase', () => ({
    supabase: {
        auth: {
            signInWithPassword: mocks.signInWithPassword,
            getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        },
    },
}));
vi.mock('@/services/sync.service', () => ({
    syncService: { getPendingCount: mocks.getPendingCount },
}));
vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import ReAuthModal from './ReAuthModal';
import { setCurrentLocale } from '@/i18n';

describe('ReAuthModal', () => {
    const onReAuthenticated = vi.fn();

    // Estos tests comprueban los textos en español (idioma de la app = es)
    afterEach(() => setCurrentLocale('en'));
    it('is in English when the app is in English', () => {
        setCurrentLocale('en');
        render(<ReAuthModal email="ana@x.nz" onReAuthenticated={vi.fn()} />);
        expect(screen.getByText(/Session expired/)).toBeTruthy();
        expect(screen.getByLabelText('Password')).toBeTruthy();
    });

    beforeEach(() => {
        setCurrentLocale('es');
        vi.clearAllMocks();
        mocks.getPendingCount.mockResolvedValue(5);
    });

    it('renders session expired title', () => {
        render(<ReAuthModal email="user@test.com" onReAuthenticated={onReAuthenticated} />);
        expect(screen.getByText(/Sesión expirada/)).toBeTruthy();
    });

    it('displays user email in disabled field', () => {
        render(<ReAuthModal email="user@test.com" onReAuthenticated={onReAuthenticated} />);
        const emailInput = screen.getByLabelText('Correo Electrónico') as HTMLInputElement;
        expect(emailInput.value).toBe('user@test.com');
        expect(emailInput.disabled).toBe(true);
    });

    it('renders password input', () => {
        render(<ReAuthModal email="user@test.com" onReAuthenticated={onReAuthenticated} />);
        expect(screen.getByLabelText('Contraseña')).toBeTruthy();
    });

    it('submit button is disabled when password is empty', () => {
        render(<ReAuthModal email="user@test.com" onReAuthenticated={onReAuthenticated} />);
        const submitBtn = screen.getByText(/Reconectar/);
        expect(submitBtn.closest('button')?.disabled).toBe(true);
    });

    it('enables submit when password entered', () => {
        render(<ReAuthModal email="user@test.com" onReAuthenticated={onReAuthenticated} />);
        fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'pass123' } });
        const submitBtn = screen.getByText(/Reconectar/);
        expect(submitBtn.closest('button')?.disabled).toBe(false);
    });

    it('shows data safety warning', () => {
        render(<ReAuthModal email="user@test.com" onReAuthenticated={onReAuthenticated} />);
        expect(screen.getByText(/datos están seguros/)).toBeTruthy();
    });

    it('calls signInWithPassword on form submit', async () => {
        mocks.signInWithPassword.mockResolvedValue({ error: null });

        render(<ReAuthModal email="user@test.com" onReAuthenticated={onReAuthenticated} />);
        fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'pass123' } });
        fireEvent.submit(screen.getByLabelText('Contraseña').closest('form')!);

        await vi.waitFor(() => {
            expect(mocks.signInWithPassword).toHaveBeenCalledWith({
                email: 'user@test.com',
                password: 'pass123',
            });
        });
    });

    it('calls onReAuthenticated on successful login', async () => {
        mocks.signInWithPassword.mockResolvedValue({ error: null });

        render(<ReAuthModal email="user@test.com" onReAuthenticated={onReAuthenticated} />);
        fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'pass123' } });
        fireEvent.submit(screen.getByLabelText('Contraseña').closest('form')!);

        await vi.waitFor(() => {
            expect(onReAuthenticated).toHaveBeenCalled();
        });
    });

    it('shows error on auth failure', async () => {
        mocks.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid password' } });

        render(<ReAuthModal email="user@test.com" onReAuthenticated={onReAuthenticated} />);
        fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'wrongpass' } });
        fireEvent.submit(screen.getByLabelText('Contraseña').closest('form')!);

        await vi.waitFor(() => {
            expect(screen.getByText(/Invalid password/)).toBeTruthy();
        });
    });
});
