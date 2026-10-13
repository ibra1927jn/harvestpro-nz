/**
 * Modales ineludibles del proveedor de auth: re-autenticación (JWT caducado
 * con datos pendientes) y consentimiento de la Ley de Privacidad NZ 2020.
 * @module context/auth/AuthModals
 */
import React from 'react';
import ReAuthModal from '@/components/modals/ReAuthModal';
import PrivacyConsentModal from '@/components/modals/PrivacyConsentModal';
import { syncService } from '@/services/sync.service';
import type { AuthState } from '../auth.types';

interface AuthModalsProps {
  state: AuthState;
  onReAuthenticated: () => void;
  onConsentGiven: () => void;
}

export const AuthModals: React.FC<AuthModalsProps> = ({
  state,
  onReAuthenticated,
  onConsentGiven,
}) => (
  <>
    {/* R8-Fix2: JWT caducado con datos pendientes */}
    {state.needsReAuth && state.userEmail && (
      <ReAuthModal
        email={state.userEmail}
        onReAuthenticated={() => {
          onReAuthenticated();
          // Reanudar la sincronización tras re-autenticar
          syncService.processQueue();
        }}
      />
    )}
    {/* Ley de Privacidad NZ 2020: consentimiento en el primer login */}
    {state.needsPrivacyConsent && state.user && state.appUser && (
      <PrivacyConsentModal
        userId={state.user.id}
        userRole={state.appUser.role || 'runner'}
        onConsentGiven={onConsentGiven}
      />
    )}
  </>
);
