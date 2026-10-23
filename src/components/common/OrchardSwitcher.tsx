/**
 * OrchardSwitcher — Multi-orchard dropdown selector
 *
 * Shows a compact dropdown in the page header that lets users
 * with access to multiple orchards switch between them.
 * Only renders when the user has 2+ orchards and a company / office role
 * (admin, manager, HR, payroll): field roles cannot change their own orchard
 * (the server refuses it too: guard_user_changes).
 *
 * @module components/common/OrchardSwitcher
 */
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/i18n';
import { canSwitchOwnOrchard } from '@/config/orchardAccess';

export default function OrchardSwitcher() {
  const { t } = useTranslation();
  const { orchardId, orchardName, availableOrchards, switchOrchard, currentRole, appUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Guard null/undefined — en tests sin AuthProvider completo, useAuth puede
  // devolver availableOrchards undefined. Defensive: tratar como lista vacía.
  const orchards = availableOrchards ?? [];

  // Don't render if user has only one orchard, or cannot switch it themselves
  if (orchards.length <= 1) return null;
  if (!canSwitchOwnOrchard(currentRole ?? appUser?.role)) return null;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-border-light"
        aria-label={t('orchards.switch')}
        aria-expanded={isOpen ? 'true' : 'false'}
        aria-haspopup="listbox"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-base text-primary">park</span>
        <span className="max-w-[140px] truncate text-text-main">
          {orchardName || t('orchards.select')}
        </span>
        <span aria-hidden="true" className="material-symbols-outlined text-base text-text-muted">
          {isOpen ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {isOpen && (
        <div
          className="absolute top-full right-0 mt-1 w-64 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-50"
          role="listbox"
          aria-label={t('orchards.available')}
        >
          {orchards.map(orchard => {
            const isActive = orchard.id === orchardId;
            return (
              <button
                key={orchard.id}
                onClick={() => {
                  if (!isActive) {
                    switchOrchard(orchard.id);
                  }
                  setIsOpen(false);
                }}
                role="option"
                aria-selected={isActive ? 'true' : 'false'}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-lg">
                  {isActive ? 'check_circle' : 'park'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{orchard.name}</p>
                  <p className="text-xs text-slate-500">{t('orchards.rows_n', { n: orchard.total_rows ?? 0 })}</p>
                </div>
                {isActive && <span className="text-xs text-indigo-500 font-medium">{t('common.active')}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
