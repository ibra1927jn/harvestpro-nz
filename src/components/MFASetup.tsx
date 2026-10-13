/**
 * MFASetup Component
 *
 * Allows users to enroll in MFA by:
 * 1. Generating a QR code
 * 2. Scanning with authenticator app (Google Authenticator, Authy, etc.)
 * 3. Verifying with a test code
 */

import { useState } from 'react';
import { useMFA } from '../hooks/useMFA';
import { useTranslation } from '@/i18n';

interface MFASetupProps {
  onComplete?: () => void;
  onCancel?: () => void;
  requireSetup?: boolean; // If true, hides cancel button
}

export function MFASetup({ onComplete, onCancel, requireSetup = false }: MFASetupProps) {
  const { t } = useTranslation();
  const { qrCode, secret, factorId, isLoading, setupMFA, verifySetupCode } = useMFA();
  const [step, setStep] = useState<'generate' | 'scan' | 'verify'>('generate');
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerateQR = async () => {
    setError(null);
    try {
      await setupMFA('HarvestPro Authenticator');
      setStep('scan');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('mfa.qr_failed');
      setError(errorMessage);
    }
  };

  const handleVerify = async () => {
    if (verificationCode.length !== 6) {
      setError(t('auth.twoFactor.error_length'));
      return;
    }

    setError(null);
    try {
      await verifySetupCode(verificationCode, factorId!);
      onComplete?.();
    } catch (_err: unknown) {
      setError(t('auth.twoFactor.error_invalid'));
    }
  };

  const handleCopySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="mfa-setup max-w-lg mx-auto p-6 bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="mb-6 text-center">
        <span aria-hidden="true" className="material-symbols-outlined text-5xl mx-auto mb-3 text-blue-600">
          shield
        </span>
        <h2 className="text-2xl font-bold">{t('mfa.setup_title')}</h2>
        <p className="text-text-secondary mt-2">
          {t('mfa.setup_desc')}
        </p>
      </div>

      {/* Step 1: Generate QR */}
      {step === 'generate' && (
        <div className="text-center">
          <p className="mb-4 text-text-primary">{t('mfa.generate_hint')}</p>
          <button
            onClick={handleGenerateQR}
            disabled={isLoading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-surface-tertiary flex items-center gap-2 mx-auto"
          >
            {isLoading ? (
              <>
                <span aria-hidden="true" className="material-symbols-outlined text-xl animate-spin">
                  progress_activity
                </span>
                {t('mfa.generating')}
              </>
            ) : (
              <>
                <span aria-hidden="true" className="material-symbols-outlined text-xl">shield</span>
                {t('mfa.generate')}
              </>
            )}
          </button>
        </div>
      )}

      {/* Step 2: Scan QR */}
      {step === 'scan' && qrCode && (
        <div>
          <div className="mb-4">
            <h3 className="font-semibold mb-2">{t('mfa.step1')}</h3>
            <p className="text-sm text-text-secondary mb-3">
              {t('mfa.step1_desc')}
            </p>

            {/* QR Code */}
            <div className="bg-white p-4 rounded border-2 border-border-light mb-3">
              <img src={qrCode} alt={t('mfa.qr_alt')} className="w-full max-w-xs mx-auto" />
            </div>

            {/* Manual Entry Option */}
            <details className="text-sm">
              <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                {t('mfa.cant_scan')}
              </summary>
              <div className="mt-2 p-3 bg-background-light rounded">
                <p className="text-text-primary mb-2">{t('mfa.secret_key')}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-white border rounded text-xs break-all">
                    {secret}
                  </code>
                  <button aria-label={t('mfa.copy_secret')}
                    onClick={handleCopySecret}
                    className="p-2 bg-surface-secondary hover:bg-surface-tertiary rounded"
                    title={t('mfa.copy_secret')}
                  >
                    {copied ? (
                      <span aria-hidden="true" className="material-symbols-outlined text-base text-green-600">
                        check
                      </span>
                    ) : (
                      <span aria-hidden="true" className="material-symbols-outlined text-base">content_copy</span>
                    )}
                  </button>
                </div>
              </div>
            </details>
          </div>

          <button
            onClick={() => setStep('verify')}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {t('mfa.scanned_next')} →
          </button>
        </div>
      )}

      {/* Step 3: Verify */}
      {step === 'verify' && (
        <div>
          <div className="mb-4">
            <h3 className="font-semibold mb-2">{t('mfa.step2')}</h3>
            <p className="text-sm text-text-secondary mb-3">
              {t('auth.twoFactor.subtitle')}:
            </p>

            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={verificationCode}
              onChange={e => setVerificationCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full px-4 py-3 text-center text-2xl font-mono border-2 border-border-medium rounded focus:border-blue-500 focus:outline-none"
              autoFocus
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setStep('scan')}
              className="flex-1 px-4 py-3 bg-surface-secondary hover:bg-surface-tertiary rounded"
            >
              ← {t('common.back')}
            </button>
            <button
              onClick={handleVerify}
              disabled={verificationCode.length !== 6 || isLoading}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-surface-tertiary"
            >
              {isLoading ? t('auth.twoFactor.verifying') : t('mfa.verify_activate')}
            </button>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && step !== 'verify' && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Cancel Button (if optional) */}
      {!requireSetup && onCancel && step === 'generate' && (
        <button
          onClick={onCancel}
          className="mt-4 w-full text-text-secondary hover:text-text-primary text-sm"
        >
          {t('mfa.skip')}
        </button>
      )}
    </div>
  );
}
