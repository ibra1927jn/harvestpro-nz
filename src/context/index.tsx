/**
 * Context Index - Combined provider wrapper and exports
 */
import React, { ReactNode, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/config/queryClient';
import { AuthProvider, useAuth } from './AuthContext';
import { MessagingProvider, useMessaging } from './MessagingContext';
import ErrorBoundary from '@/components/common/ErrorBoundary';
const StartupErrorBoundary = ErrorBoundary;

// Re-export all hooks
export { useAuth } from './AuthContext';
export { useMessaging } from './MessagingContext';
export { Role } from '../types';
// supabase intentionally NOT re-exported — use repositories instead

// Re-export types
export type { DBMessage, ChatGroup } from './MessagingContext';

/**
 * Combined Provider - Wraps all context providers
 *
 * Usage:
 * <AppProvider>
 *   <App />
 * </AppProvider>
 */
export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <StartupErrorBoundary>
        <AuthProvider>
          <MessagingProvider>
            <SyncContexts />
            {children}
          </MessagingProvider>
        </AuthProvider>
      </StartupErrorBoundary>
    </QueryClientProvider>
  );
};

/**
 * Internal component to sync context values between providers
 */
const SyncContexts: React.FC = () => {
  const { appUser, orchardId, mfaVerifiedAt } = useAuth();
  const { setUserId, setOrchardId, refreshMessages } = useMessaging();

  useEffect(() => {
    if (appUser?.id) {
      setUserId(appUser.id);
    }
    if (orchardId) {
      setOrchardId(orchardId);
      // También tras el código 2FA: con aal1 la BD no daba los mensajes
      refreshMessages();
    }
  }, [appUser?.id, orchardId, mfaVerifiedAt, setUserId, setOrchardId, refreshMessages]);

  return null;
};

export default AppProvider;
