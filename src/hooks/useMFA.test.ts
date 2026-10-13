/**
 * useMFA Hook Tests — initial state and error handling
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMFA } from './useMFA';
import { supabase } from '../services/supabase';

// Mock supabase auth MFA
vi.mock('../services/supabase', () => ({
    supabase: {
        auth: {
            mfa: {
                enroll: vi.fn(),
                challenge: vi.fn(),
                verify: vi.fn(),
                listFactors: vi.fn(),
                unenroll: vi.fn(),
                getAuthenticatorAssuranceLevel: vi.fn(),
            },
        },
    },
}));

describe('useMFA', () => {
    it('initializes with null state', () => {
        const { result } = renderHook(() => useMFA());
        expect(result.current.qrCode).toBeNull();
        expect(result.current.secret).toBeNull();
        expect(result.current.factorId).toBeNull();
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it('exposes all action functions', () => {
        const { result } = renderHook(() => useMFA());
        expect(typeof result.current.setupMFA).toBe('function');
        expect(typeof result.current.verifySetupCode).toBe('function');
        expect(typeof result.current.verifyLoginCode).toBe('function');
        expect(typeof result.current.checkMFAStatus).toBe('function');
        expect(typeof result.current.unenrollMFA).toBe('function');
        expect(typeof result.current.getAuthenticatorLevel).toBe('function');
    });

    describe('code verification (setup and login share challenge + verify)', () => {
        const mfa = supabase.auth.mfa as unknown as Record<'challenge' | 'verify', ReturnType<typeof vi.fn>>;
        beforeEach(() => {
            mfa.challenge.mockReset();
            mfa.verify.mockReset();
        });

        it('login: challenges the factor and verifies the code against that challenge', async () => {
            mfa.challenge.mockResolvedValue({ data: { id: 'ch-1' }, error: null });
            mfa.verify.mockResolvedValue({ data: { access_token: 't' }, error: null });
            const { result } = renderHook(() => useMFA());
            let out: unknown;
            await act(async () => { out = await result.current.verifyLoginCode('123456', 'f-1'); });
            expect(mfa.verify).toHaveBeenCalledWith({ factorId: 'f-1', challengeId: 'ch-1', code: '123456' });
            expect(out).toEqual({ access_token: 't' });
            expect(result.current.isLoading).toBe(false);
        });

        it('a wrong code is rethrown and kept in error state', async () => {
            mfa.challenge.mockResolvedValue({ data: { id: 'ch-1' }, error: null });
            mfa.verify.mockResolvedValue({ data: null, error: new Error('Invalid TOTP code') });
            const { result } = renderHook(() => useMFA());
            await act(async () => {
                await expect(result.current.verifySetupCode('000000', 'f-1')).rejects.toThrow('Invalid TOTP code');
            });
            expect(result.current.error?.message).toBe('Invalid TOTP code');
        });

        it('fails without verifying when the challenge cannot be created', async () => {
            mfa.challenge.mockResolvedValue({ data: null, error: null });
            const { result } = renderHook(() => useMFA());
            await act(async () => {
                await expect(result.current.verifyLoginCode('123456', 'f-1')).rejects.toThrow('Failed to create MFA challenge');
            });
            expect(mfa.verify).not.toHaveBeenCalled();
        });

        it('setup without any factor id fails before calling Supabase', async () => {
            const { result } = renderHook(() => useMFA());
            await act(async () => {
                await expect(result.current.verifySetupCode('123456')).rejects.toThrow('No factor ID available');
            });
            expect(mfa.challenge).not.toHaveBeenCalled();
        });
    });
});
