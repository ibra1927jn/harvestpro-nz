/**
 * Header.tsx — Shared Mobile Header
 *
 * Used by all BottomNav pages: TeamLeader, Runner, Manager, QC
 * Features: App branding, notifications with unread badge + dropdown, user avatar, sign-out with offline guard
 */
import { useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { logger } from '@/utils/logger';
import { useMessaging } from '@/context/MessagingContext';
import { useNavigate } from 'react-router-dom';
import { offlineService } from '@/services/offline.service';
import NotificationPanel from './NotificationPanel';
import ThemeToggle from '@/components/ui/ThemeToggle';
import OrchardSwitcher from './OrchardSwitcher';
import { useTranslation } from '@/i18n';

interface HeaderProps {
  title: string;
  subtitle: string;
  /** Optional callback when profile avatar is tapped (e.g. open settings) */
  onProfileClick?: () => void;
  /** Callback to navigate to messaging tab */
  onNavigateToMessaging?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  onProfileClick,
  onNavigateToMessaging,
}) => {
  const { t } = useTranslation();
  const { appUser, signOut } = useAuth();
  const { unreadCount } = useMessaging();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Derive user initials from full name
  const initials = (appUser?.full_name || 'U')
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);

    try {
      // Offline guard: check for pending sync items
      const pendingCount = await offlineService.getPendingCount();
      if (pendingCount > 0) {
        const confirmed = window.confirm(`⚠️ ${t('header.unsynced_confirm', { n: pendingCount })}`);
        if (!confirmed) {
          setSigningOut(false);
          return;
        }
      }

      await signOut();
      navigate('/login', { replace: true });
    } catch (err) {
      logger.error('[Header] Sign-out failed:', err);
      setSigningOut(false);
    }
  }, [signingOut, signOut, navigate, t]);

  return (
    <header className="sticky top-0 z-30 glass-header">
      <div className="flex flex-wrap items-center gap-y-2 px-4 py-3 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {/* Logo mark */}
          <div className="size-10 rounded-xl bg-primary shadow-md shadow-primary/20 flex items-center justify-center">
            <span aria-hidden="true" className="material-symbols-outlined text-white text-[22px]">agriculture</span>
          </div>
          <div>
            <h1 className="text-text-main text-lg font-bold tracking-tight">{title}</h1>
            <p className="text-xs text-text-muted">{subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Multi-orchard switcher — only visible with 2+ orchards */}
          <OrchardSwitcher />
          {/* Theme toggle */}
          <ThemeToggle />

          {/* Notifications bell with unread badge + dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="size-10 rounded-xl bg-slate-100 border border-border-light flex items-center justify-center text-text-muted hover:bg-slate-200 transition-colors relative"
              title={t('settings.notifications')}
              aria-label={
                unreadCount > 0 ? t('shell.notifications_unread', { n: unreadCount }) : t('settings.notifications')
              }
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">notifications</span>
              {unreadCount > 0 ? (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : (
                <span className="absolute top-1.5 right-1.5 size-2 bg-primary rounded-full ring-2 ring-white" />
              )}
            </button>

            {showNotifications && (
              <NotificationPanel
                onViewAll={onNavigateToMessaging}
                onClose={() => setShowNotifications(false)}
              />
            )}
          </div>

          {/* Profile avatar */}
          {onProfileClick ? (
            <button
              onClick={onProfileClick}
              className="size-10 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-sm shadow-md shadow-primary/20 hover:bg-primary-dim transition-colors"
              aria-label={t('header.open_profile')}
            >
              {initials}
            </button>
          ) : (
            <div className="size-10 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-sm shadow-md shadow-primary/20">
              {initials}
            </div>
          )}

          {/* Sign-out button */}
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="size-10 rounded-xl bg-slate-100 border border-border-light flex items-center justify-center text-text-muted hover:text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors disabled:opacity-50"
            title={t('common.sign_out')}
            aria-label={signingOut ? t('header.signing_out') : t('common.sign_out')}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
              {signingOut ? 'hourglass_empty' : 'logout'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
