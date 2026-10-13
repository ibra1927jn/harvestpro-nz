/**
 * Tests for ErrorBoundary — Catches React errors and displays recovery UI
 * @module components/common/ErrorBoundary.test
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// All mocks with vi.hoisted
const mocks = vi.hoisted(() => ({
    captureSentryError: vi.fn(),
}));

vi.mock('@/services/config.service', () => ({
    getConfig: () => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k', isDevelopment: true }),
}));
vi.mock('@/services/supabase', () => ({
    supabase: { auth: { getSession: vi.fn() }, from: vi.fn() },
}));
vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/config/sentry', () => ({
    captureSentryError: mocks.captureSentryError,
}));
import ErrorBoundary from './ErrorBoundary';

const Bomb = ({ shouldThrow }: { shouldThrow: boolean }) => {
    if (shouldThrow) throw new Error('Test explosion');
    return <p>Safe</p>;
};

describe('ErrorBoundary', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => { });
    });

    it('renders children when no error', () => {
        render(<ErrorBoundary><p>Hello</p></ErrorBoundary>);
        expect(screen.getByText('Hello')).toBeTruthy();
    });

    it('renders error UI when child throws', () => {
        render(<ErrorBoundary><Bomb shouldThrow={true} /></ErrorBoundary>);
        expect(screen.getByText('Something went wrong')).toBeTruthy();
    });

    it('displays the error message', () => {
        render(<ErrorBoundary><Bomb shouldThrow={true} /></ErrorBoundary>);
        expect(screen.getByText(/Test explosion/)).toBeTruthy();
    });

    it('reports error to Sentry', () => {
        render(<ErrorBoundary><Bomb shouldThrow={true} /></ErrorBoundary>);
        expect(mocks.captureSentryError).toHaveBeenCalledWith(
            expect.any(Error),
            expect.objectContaining({ componentStack: expect.any(String) })
        );
    });

    it('renders Reload button', () => {
        render(<ErrorBoundary><Bomb shouldThrow={true} /></ErrorBoundary>);
        expect(screen.getByText('Reload Application')).toBeTruthy();
    });

    it('renders Clear Cache button', () => {
        render(<ErrorBoundary><Bomb shouldThrow={true} /></ErrorBoundary>);
        expect(screen.getByText('Clear Cache & Reload')).toBeTruthy();
    });

    it('does not show error UI when child is fine', () => {
        render(<ErrorBoundary><Bomb shouldThrow={false} /></ErrorBoundary>);
        expect(screen.getByText('Safe')).toBeTruthy();
        expect(screen.queryByText('Something went wrong')).toBeNull();
    });
});
