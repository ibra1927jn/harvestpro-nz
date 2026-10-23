/**
 * Login Page Tests
 *
 * Verifies: renders sign-in form, tab switching, error/success display,
 * redirect when already authenticated
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test-utils';
import userEvent from '@testing-library/user-event';

// ── Mocks ────────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate,
    Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
}));

vi.mock('@/context/AuthContext', () => ({
    useAuth: vi.fn().mockReturnValue({
        signIn: vi.fn(),
        signUp: vi.fn(),
        resetPassword: vi.fn(),
        isLoading: false,
        isAuthenticated: false,
        currentRole: null,
        appUser: null,
    }),
}));

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/auth/login', () => ({
    HeroPanel: () => <div data-testid="hero-panel">HeroPanel</div>,
}));

vi.mock('@/components/auth/LoginForm', () => ({
    default: (props: { onSubmit: (e: React.FormEvent) => void }) => (
        <form data-testid="login-form" onSubmit={props.onSubmit}>
            <button type="submit">Sign In</button>
        </form>
    ),
}));

vi.mock('@/components/auth/RegisterForm', () => ({
    default: () => <div data-testid="register-form">Register Form</div>,
}));

import Login from './Login';
import { useAuth } from '@/context/AuthContext';

describe('Login Page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
            signIn: vi.fn(),
            signUp: vi.fn(),
            resetPassword: vi.fn(),
            isLoading: false,
            isAuthenticated: false,
            currentRole: null,
            appUser: null,
        });
    });

    it('renders the sign-in form by default', () => {
        render(<Login />);
        expect(screen.getByText('Welcome back!')).toBeTruthy();
        expect(screen.getByTestId('login-form')).toBeTruthy();
    });

    it('renders hero panel', () => {
        render(<Login />);
        expect(screen.getByTestId('hero-panel')).toBeTruthy();
    });

    it('shows tab pills for Sign In and Register', () => {
        render(<Login />);
        expect(screen.getAllByText('Sign In').length).toBeGreaterThan(0);
        expect(screen.getByText('Register')).toBeTruthy();
    });

    it('switches to register form when Register tab is clicked', async () => {
        const user = userEvent.setup();
        render(<Login />);

        await user.click(screen.getByText('Register'));
        expect(screen.getByText('Create your account')).toBeTruthy();
        expect(screen.getByTestId('register-form')).toBeTruthy();
    });

    it('opens Register when it comes from an invitation link (/login?invite=email)', () => {
        const original = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...original, search: '?invite=new.person%40example.nz' },
        });
        try {
            render(<Login />);
            expect(screen.getByText('Create your account')).toBeTruthy();
            expect(screen.getByTestId('register-form')).toBeTruthy();
        } finally {
            Object.defineProperty(window, 'location', { configurable: true, value: original });
        }
    });

    it('shows loading spinner when auth is loading', () => {
        (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
            signIn: vi.fn(),
            signUp: vi.fn(),
            resetPassword: vi.fn(),
            isLoading: true,
            isAuthenticated: false,
            currentRole: null,
            appUser: null,
        });

        render(<Login />);
        expect(screen.getByText('Connecting to HarvestPro...')).toBeTruthy();
    });

    it('redirects when already authenticated', () => {
        (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
            signIn: vi.fn(),
            signUp: vi.fn(),
            resetPassword: vi.fn(),
            isLoading: false,
            isAuthenticated: true,
            currentRole: 'manager',
            appUser: { role: 'manager' },
        });

        render(<Login />);
        expect(mockNavigate).toHaveBeenCalledWith('/manager', { replace: true });
    });

    it('shows copyright text', () => {
        render(<Login />);
        const year = new Date().getFullYear().toString();
        expect(screen.getByText(new RegExp(year))).toBeTruthy();
    });
});
