/**
 * MFAVerify — Pantalla de verificación 2FA durante el login
 *
 * Mejoras §5:
 * - OtpInput: 6 cajas con auto-avance y backspace
 * - Botón "← Back to login"
 * - Countdown de 30s antes de poder reenviar
 * - Todas las cadenas via useTranslation()
 * - Estilo consistente con Login (no modal genérico)
 */
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/i18n';
import { useMFA } from '../hooks/useMFA';
import OtpInput from './auth/OtpInput';

const RESEND_COOLDOWN_S = 30;

interface MFAVerifyProps {
    factorId: string;
    onSuccess?: () => void;
    onCancel?: () => void;
}

export function MFAVerify({ factorId, onSuccess, onCancel }: MFAVerifyProps) {
    const { t } = useTranslation();
    const { verifyLoginCode, isLoading } = useMFA();
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [resendCountdown, setResendCountdown] = useState(RESEND_COOLDOWN_S);

    // Contador de reenvío: decrementa cada segundo
    useEffect(() => {
        if (resendCountdown <= 0) return;
        const id = setTimeout(() => setResendCountdown(s => s - 1), 1000);
        return () => clearTimeout(id);
    }, [resendCountdown]);

    const handleVerify = useCallback(async () => {
        if (code.length !== 6) {
            setError(t('auth.twoFactor.error_length'));
            return;
        }
        setError(null);
        try {
            await verifyLoginCode(code, factorId);
            onSuccess?.();
        } catch {
            setError(t('auth.twoFactor.error_invalid'));
            setCode('');
        }
    }, [code, factorId, onSuccess, t, verifyLoginCode]);

    // Auto-submit al completar los 6 dígitos
    useEffect(() => {
        if (code.length === 6) {
            handleVerify();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code]);

    const handleResend = useCallback(() => {
        if (resendCountdown > 0) return;
        setResendCountdown(RESEND_COOLDOWN_S);
        setCode('');
        setError(null);
        // El canal de reenvío depende del factor type; aquí sólo reseteamos el estado.
        // Si el integrador necesita reenviar por SMS/email, debe pasar un onResend prop.
    }, [resendCountdown]);

    const mm = String(Math.floor(resendCountdown / 60)).padStart(2, '0');
    const ss = String(resendCountdown % 60).padStart(2, '0');

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 p-4">
            <div className="w-full max-w-sm">
                {/* Back to login */}
                {onCancel && (
                    <button
                        onClick={onCancel}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 text-sm text-text-muted hover:text-indigo-600 mb-6 transition-colors disabled:opacity-50"
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-base">arrow_back</span>
                        {t('auth.twoFactor.back')}
                    </button>
                )}

                {/* Card */}
                <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 p-8">
                    {/* Icon */}
                    <div className="flex justify-center mb-5">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                            <span aria-hidden="true" className="material-symbols-outlined text-3xl text-white">shield_lock</span>
                        </div>
                    </div>

                    {/* Title */}
                    <h2 className="text-2xl font-black text-text-main text-center mb-1">
                        {t('auth.twoFactor.title')}
                    </h2>
                    <p className="text-sm text-text-muted text-center mb-6">
                        {t('auth.twoFactor.subtitle')}
                    </p>

                    {/* OTP Input */}
                    <OtpInput
                        value={code}
                        onChange={setCode}
                        disabled={isLoading}
                        hasError={!!error}
                    />

                    {/* Error */}
                    {error && (
                        <p className="mt-3 text-center text-sm text-red-600 font-medium animate-fade-in">
                            {error}
                        </p>
                    )}

                    {/* Expiry hint */}
                    {!error && resendCountdown > 0 && (
                        <p className="mt-3 text-center text-xs text-text-muted">
                            {t('auth.twoFactor.expires_in')
                                .replace('{mm}', mm)
                                .replace('{ss}', ss)}
                        </p>
                    )}

                    {/* Verify Button */}
                    <button
                        onClick={handleVerify}
                        disabled={code.length !== 6 || isLoading}
                        className="mt-5 w-full py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <span aria-hidden="true" className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                                {t('auth.twoFactor.verifying')}
                            </>
                        ) : (
                            t('auth.twoFactor.verify')
                        )}
                    </button>

                    {/* Resend */}
                    <div className="mt-4 text-center">
                        {resendCountdown > 0 ? (
                            <p className="text-xs text-text-muted">
                                {t('auth.twoFactor.resend_in').replace('{n}', String(resendCountdown))}
                            </p>
                        ) : (
                            <button
                                onClick={handleResend}
                                className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold underline underline-offset-2"
                            >
                                {t('auth.twoFactor.resend')}
                            </button>
                        )}
                    </div>

                    {/* Help */}
                    <div className="mt-5 pt-4 border-t border-slate-100 text-center">
                        <p className="text-xs text-text-muted">{t('auth.twoFactor.lost_access')}</p>
                        <p className="text-xs text-text-muted mt-0.5">{t('auth.twoFactor.contact_admin')}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
