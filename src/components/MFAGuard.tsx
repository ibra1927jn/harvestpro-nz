/**
 * MFAGuard Component
 *
 * Roles con acceso a datos sensibles (manager, admin, payroll_admin, hr_admin)
 * necesitan una sesión verificada con 2FA (nivel "aal2" de Supabase):
 * - Sin factor configurado → pantalla de configuración obligatoria.
 * - Con factor pero sesión sin verificar (solo contraseña) → pide el código.
 * - Sesión ya verificada → entra. El nivel aal2 va dentro del token de sesión,
 *   así que se mantiene al recargar o reabrir la app (también sin conexión).
 * Si la comprobación falla, NO se deja pasar (antes se dejaba entrar).
 */

import { logger } from '@/utils/logger';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMFA } from '../hooks/useMFA';
import { supabase } from '../services/supabase';
import { useTranslation } from '@/i18n';
import { mfaRequiredFor } from '@/config/mfa';

// Solo los roles con 2FA ven estas pantallas: fuera del bundle inicial (login/runner)
const MFASetup = lazy(() => import('./MFASetup').then(m => ({ default: m.MFASetup })));
const MFAVerify = lazy(() => import('./MFAVerify').then(m => ({ default: m.MFAVerify })));

interface MFAGuardProps {
  children: React.ReactNode;
}

// Qué roles necesitan 2FA y el interruptor de desarrollo: src/config/mfa.ts

type GuardState =
  | { kind: 'checking' }
  | { kind: 'ok' }
  | { kind: 'setup' }
  | { kind: 'verify'; factorId: string }
  | { kind: 'error' };

export function MFAGuard({ children }: MFAGuardProps) {
  const { t } = useTranslation();
  const { currentRole, isAuthenticated, signOut } = useAuth();
  const { checkMFAStatus } = useMFA();
  const [state, setState] = useState<GuardState>({ kind: 'checking' });
  const required = isAuthenticated && mfaRequiredFor(currentRole);
  // Con qué valor de `required` se calculó `state` (el efecto llega un render tarde)
  const [evaluatedForRequired, setEvaluatedForRequired] = useState(false);

  const evaluate = useCallback(async () => {
    setEvaluatedForRequired(required);
    if (!required) {
      setState({ kind: 'ok' });
      return;
    }
    setState({ kind: 'checking' });
    try {
      // Se lee del token de sesión local: funciona sin conexión
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;
      if (data?.currentLevel === 'aal2') {
        setState({ kind: 'ok' });
        return;
      }
      if (data?.nextLevel === 'aal2') {
        // Tiene 2FA pero esta sesión solo usó la contraseña: pedir el código
        const status = await checkMFAStatus();
        const factor = status.factors.find(f => f.status === 'verified');
        if (!factor) throw new Error('Verified MFA factor not found');
        setState({ kind: 'verify', factorId: factor.id });
        return;
      }
      setState({ kind: 'setup' });
    } catch (error) {
      logger.error('[MFAGuard] Error checking MFA status:', error);
      setState({ kind: 'error' });
    }
  }, [required, checkMFAStatus]);

  useEffect(() => {
    void evaluate();
  }, [evaluate]);

  if (!required) return <>{children}</>;
  // Un "ok" calculado cuando no hacía falta 2FA (p. ej. antes de entrar) no
  // vale para el rol privilegiado: hasta que corra la comprobación, spinner
  const pending = !evaluatedForRequired;

  // Mismo spinner mientras se comprueba y mientras llega el chunk de MFA (nunca deja ver la app)
  const checking = (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-text-secondary">{t('mfa.checking')}</p>
      </div>
    </div>
  );

  if (pending || state.kind === 'checking') return checking;

  if (state.kind === 'verify') {
    return (
      <Suspense fallback={checking}>
        <MFAVerify
          factorId={state.factorId}
          onSuccess={() => void evaluate()}
          onCancel={() => void signOut()}
        />
      </Suspense>
    );
  }

  if (state.kind === 'setup') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-light">
        <div className="max-w-2xl w-full px-4">
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h2 className="font-bold text-blue-900 mb-2">🔒 {t('mfa.required_title')}</h2>
            <p className="text-blue-800 text-sm">
              {t('mfa.required_desc')}
            </p>
          </div>
          <Suspense fallback={checking}>
            <MFASetup onComplete={() => void evaluate()} requireSetup={true} />
          </Suspense>
        </div>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="max-w-sm w-full text-center" role="alert">
          <h2 className="font-bold text-text-main mb-2">{t('mfa.check_failed')}</h2>
          <p className="text-sm text-text-secondary mb-4">
            {t('mfa.check_connection')}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => void evaluate()}
              className="min-h-[44px] px-4 rounded-lg bg-blue-600 text-white font-semibold"
            >
              {t('mfa.try_again')}
            </button>
            <button
              onClick={() => void signOut()}
              className="min-h-[44px] px-4 rounded-lg border border-border-light font-semibold"
            >
              {t('common.sign_out')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
