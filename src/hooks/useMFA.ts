/**
 * useMFA Hook
 * 
 * React hook for Multi-Factor Authentication (TOTP)
 * Supports enrollment, verification, and status checking
 */

import { logger } from '@/utils/logger';
import { useState, useCallback } from 'react';
import { supabase } from '../services/supabase';

export interface MFAFactor {
    id: string;
    type: 'totp';
    status: 'unverified' | 'verified';
    friendly_name?: string;
    created_at: string;
    updated_at: string;
}

export interface MFAStatus {
    enabled: boolean;
    factors: MFAFactor[];
    hasVerifiedFactor: boolean;
}

/** Reto TOTP + verificación del código (alta de MFA y login usan lo mismo) */
async function challengeAndVerify(factorId: string, code: string) {
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) throw challengeError;
    if (!challengeData) throw new Error('Failed to create MFA challenge');

    const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code,
    });
    if (verifyError) throw verifyError;
    return verifyData;
}

export function useMFA() {
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [secret, setSecret] = useState<string | null>(null);
    const [factorId, setFactorId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    /**
     * Enroll in MFA - generates QR code and secret
     */
    const setupMFA = async (friendlyName: string = 'Authenticator App') => {
        setIsLoading(true);
        setError(null);

        try {
            const { data, error: enrollError } = await supabase.auth.mfa.enroll({
                factorType: 'totp',
                friendlyName,
            });

            if (enrollError) {
                throw enrollError;
            }

            if (!data || !data.totp) {
                throw new Error('Failed to enroll MFA: no TOTP data returned');
            }

            setQrCode(data.totp.qr_code);
            setSecret(data.totp.secret);
            setFactorId(data.id);

            return {
                qrCode: data.totp.qr_code,
                secret: data.totp.secret,
                factorId: data.id,
            };
        } catch (err) {
            const error = err as Error;
            setError(error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Verify MFA code during setup
     */
    const verifySetupCode = async (code: string, targetFactorId?: string) => {
        setIsLoading(true);
        setError(null);

        try {
            const fId = targetFactorId || factorId;
            if (!fId) {
                throw new Error('No factor ID available. Please setup MFA first.');
            }

            return await challengeAndVerify(fId, code);
        } catch (err) {
            const error = err as Error;
            setError(error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Verify MFA code during login
     */
    const verifyLoginCode = async (code: string, targetFactorId: string) => {
        setIsLoading(true);
        setError(null);

        try {
            return await challengeAndVerify(targetFactorId, code);
        } catch (err) {
            const error = err as Error;
            setError(error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Check MFA status for current user
     */
    const checkMFAStatus = useCallback(async (): Promise<MFAStatus> => {
        setIsLoading(true);
        setError(null);

        try {
            const { data, error: listError } = await supabase.auth.mfa.listFactors();

            if (listError) {
                throw listError;
            }

            if (!data) {
                return {
                    enabled: false,
                    factors: [],
                    hasVerifiedFactor: false,
                };
            }

            const hasVerifiedFactor = data.totp.some((f) => f.status === 'verified');

            // Map Supabase factors to our MFAFactor type
            const mappedFactors: MFAFactor[] = data.totp.map(f => ({
                id: f.id,
                type: 'totp' as const,
                status: f.status,
                friendly_name: f.friendly_name,
                created_at: f.created_at,
                updated_at: f.updated_at,
            }));

            return {
                enabled: data.totp.length > 0,
                factors: mappedFactors,
                hasVerifiedFactor,
            };
        } catch (err) {
            const error = err as Error;
            setError(error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    }, []); // Empty deps - stable function reference

    /**
     * Unenroll (remove) an MFA factor
     */
    const unenrollMFA = async (targetFactorId: string) => {
        setIsLoading(true);
        setError(null);

        try {
            const { data, error: unenrollError } = await supabase.auth.mfa.unenroll({
                factorId: targetFactorId,
            });

            if (unenrollError) {
                throw unenrollError;
            }

            // Clear local state if it was the current factor
            if (targetFactorId === factorId) {
                setQrCode(null);
                setSecret(null);
                setFactorId(null);
            }

            return data;
        } catch (err) {
            const error = err as Error;
            setError(error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Get Authenticator Level (AAL)
     */
    const getAuthenticatorLevel = async () => {
        try {
            const { data, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

            if (aalError) {
                throw aalError;
            }

            return {
                currentLevel: data?.currentLevel || null,
                nextLevel: data?.nextLevel || null,
                currentAuthenticationMethods: data?.currentAuthenticationMethods || [],
            };
        } catch (err) {
             
            logger.error('[useMFA] Error getting AAL:', err);
            return {
                currentLevel: null,
                nextLevel: null,
                currentAuthenticationMethods: [],
            };
        }
    };

    return {
        // State
        qrCode,
        secret,
        factorId,
        isLoading,
        error,

        // Actions
        setupMFA,
        verifySetupCode,
        verifyLoginCode,
        checkMFAStatus,
        unenrollMFA,
        getAuthenticatorLevel,
    };
}
