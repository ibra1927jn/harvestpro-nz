/**
 * MFAGuard Component
 *
 * Wrapper que fuerza configuración de MFA para roles con acceso a datos sensibles:
 * manager, admin, payroll_admin, hr_admin.
 * Muestra el modal MFASetup si el usuario no tiene MFA habilitado.
 *
 * Device Trust: si el dispositivo ya fue verificado en las últimas N horas
 * (configurable via HarvestSettings.mfa_device_trust_ttl_hours, default 72h),
 * se omite la verificación de MFA sin llamar a Supabase.
 */

import { logger } from '@/utils/logger';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMFA } from '../hooks/useMFA';
import { MFASetup } from './MFASetup';
import {
  isDeviceTrusted,
  saveDeviceTrust,
  DEFAULT_TTL_HOURS,
} from '../services/deviceTrust.service';

interface MFAGuardProps {
  children: React.ReactNode;
  /** TTL en horas para el token de confianza (default: DEFAULT_TTL_HOURS = 72) */
  deviceTrustTtlHours?: number;
}

// Roles que acceden a nómina, contratos, o configuración global — MFA obligatorio
// Desactivable SOLO en desarrollo con VITE_MFA_ENFORCE=false en .env.local.
// En build de produccion (import.meta.env.PROD) se ignora y el MFA siempre se exige.
const MFA_ENFORCED = import.meta.env.PROD || import.meta.env.VITE_MFA_ENFORCE !== 'false';
const MFA_REQUIRED_ROLES = new Set(
  MFA_ENFORCED ? ['manager', 'admin', 'payroll_admin', 'hr_admin'] : []
);

export function MFAGuard({ children, deviceTrustTtlHours = DEFAULT_TTL_HOURS }: MFAGuardProps) {
  const { currentRole, isAuthenticated, user } = useAuth();
  const { checkMFAStatus } = useMFA();
  const [mfaStatus, setMfaStatus] = useState<{ checked: boolean; hasVerifiedFactor: boolean }>({
    checked: false,
    hasVerifiedFactor: false,
  });
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      if (!isAuthenticated || !MFA_REQUIRED_ROLES.has(currentRole ?? '')) {
        setMfaStatus({ checked: true, hasVerifiedFactor: true });
        return;
      }

      // Verificar confianza de dispositivo antes de llamar a Supabase
      const userId = user?.id;
      if (userId) {
        const trusted = await isDeviceTrusted(userId);
        if (trusted) {
          setMfaStatus({ checked: true, hasVerifiedFactor: true });
          return;
        }
      }

      try {
        const status = await checkMFAStatus();
        setMfaStatus({
          checked: true,
          hasVerifiedFactor: status.hasVerifiedFactor,
        });

        // Si el manager ya tiene MFA configurado, guardar confianza del dispositivo
        if (status.hasVerifiedFactor && userId) {
          await saveDeviceTrust(userId, deviceTrustTtlHours);
        }

        // Si el rol requiere MFA y no lo tiene configurado, forzar setup
        if (!status.hasVerifiedFactor) {
          setShowSetup(true);
        }
      } catch (error) {
        logger.error('[MFAGuard] Error checking MFA status:', error);
        // En error, permitir acceso (fail open)
        setMfaStatus({ checked: true, hasVerifiedFactor: true });
      }
    };

    checkStatus();
  }, [isAuthenticated, currentRole, checkMFAStatus, user?.id, deviceTrustTtlHours]);

  const handleMFAComplete = async () => {
    // Guardar confianza del dispositivo después de configurar MFA exitosamente
    const userId = user?.id;
    if (userId) {
      await saveDeviceTrust(userId, deviceTrustTtlHours);
    }
    setShowSetup(false);
    setMfaStatus({ checked: true, hasVerifiedFactor: true });
  };

  // Verificando
  if (!mfaStatus.checked) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-text-secondary">Checking security settings...</p>
        </div>
      </div>
    );
  }

  // Rol privilegiado necesita configurar MFA
  if (showSetup && MFA_REQUIRED_ROLES.has(currentRole ?? '')) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-light">
        <div className="max-w-2xl w-full px-4">
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h2 className="font-bold text-blue-900 mb-2">🔒 Two-Factor Authentication Required</h2>
            <p className="text-blue-800 text-sm">
              Your role requires two-factor authentication to access the application.
              This additional security layer protects sensitive payroll and employee data.
            </p>
          </div>
          <MFASetup
            onComplete={handleMFAComplete}
            requireSetup={true}
          />
        </div>
      </div>
    );
  }

  // MFA verificado o no requerido
  return <>{children}</>;
}
