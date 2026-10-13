/**
 * PrivacyConsentModal — NZ Privacy Act 2020 Compliance
 *
 * Ineludible modal shown on first login if the user has not yet
 * accepted the privacy consent. Cannot be dismissed without explicit
 * acceptance. Required by the NZ Privacy Act 2020 for collection of
 * personal and biometric harvest data from workers (including migrant
 * workers under RSE scheme).
 *
 * Audit fix H-3: All inline styles moved to CSS classes in index.css
 * to eliminate need for 'unsafe-inline' in CSP style-src directive.
 *
 * @module components/modals/PrivacyConsentModal
 * @see https://www.legislation.govt.nz/act/public/2020/0031/latest/LMS23223.html
 */
import React, { useState, useCallback, useRef } from 'react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { supabase } from '@/services/supabase';
import { logger } from '@/utils/logger';
import { useTranslation, type TFunction } from '@/i18n';

interface PrivacyConsentModalProps {
  /** The authenticated user's ID (from auth.users) */
  userId: string;
  /** The user's role — determines if pickers table also needs updating */
  userRole: string;
  /** Called after successful consent recording */
  onConsentGiven: () => void;
}

/**
 * Returns the consent sections based on current language.
 * Each section maps to a specific NZ Privacy Act 2020 Information Privacy Principle (IPP).
 */
function getConsentSections(t: TFunction): Array<{ title: string; body: string }> {
  return [
    { title: t('privacy.section1.title'), body: t('privacy.section1.body') },
    { title: t('privacy.section2.title'), body: t('privacy.section2.body') },
    { title: t('privacy.section3.title'), body: t('privacy.section3.body') },
    { title: t('privacy.section4.title'), body: t('privacy.section4.body') },
    { title: t('privacy.section5.title'), body: t('privacy.section5.body') },
    { title: t('privacy.section6.title'), body: t('privacy.section6.body') },
  ];
}

const PrivacyConsentModal: React.FC<PrivacyConsentModalProps> = ({
  userId,
  userRole,
  onConsentGiven,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  const { t } = useTranslation();

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    // Consider "scrolled to bottom" if within 20px of the end
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
    if (atBottom) {
      setHasScrolledToBottom(true);
    }
  }, []);

  const handleAccept = useCallback(async () => {
    setIsSubmitting(true);
    setError('');

    try {
      const now = new Date().toISOString();

      // 1. Update public.users with consent timestamp
      const { error: userError } = await supabase
        .from('users')
        .update({ privacy_consent_at: now })
        .eq('id', userId);

      if (userError) {
        logger.error('[PrivacyConsent] Failed to update users table:', userError);
        throw new Error(t('privacy.error'));
      }

      // 2. If the user is associated with a picker record, update that too
      if (['runner', 'team_leader', 'manager'].includes(userRole)) {
        await supabase.from('pickers').update({ privacy_consent_at: now }).eq('user_id', userId);
      }

      // 3. Log to immutable audit trail (privacy_consent_log)
      await supabase.from('privacy_consent_log').insert({
        user_id: userId,
        consent_type: 'privacy_policy',
        policy_version: '1.0',
        consent_given: true,
        user_agent: navigator?.userAgent || null,
      });

      logger.info(`[PrivacyConsent] Consent recorded for user ${userId} at ${now}`);
      onConsentGiven();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('privacy.error');
      setError(message);
      logger.error('[PrivacyConsent] Error recording consent:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [userId, userRole, onConsentGiven, t]);

  // Consentimiento obligatorio: sin Escape, pero el foco no se escapa del diálogo
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef, { closeOnEscape: false });

  const sections = getConsentSections(t);
  const buttonDisabled = isSubmitting || !hasScrolledToBottom;

  return (
    <div
      ref={dialogRef}
      data-testid="privacy-consent-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-consent-title"
      className="privacy-modal-overlay"
    >
      <div className="privacy-modal-container">
        {/* Header */}
        <div className="privacy-modal-header">
          <h2 id="privacy-consent-title" className="privacy-modal-title">
            🔐 {t('privacy.title')}
          </h2>
          <p className="privacy-modal-subtitle">{t('privacy.subtitle')}</p>
        </div>

        {/* Scrollable content */}
        <div
          data-testid="privacy-consent-content"
          onScroll={handleScroll}
          className="privacy-modal-content"
        >
          {sections.map((section, idx) => (
            <div key={idx} className="privacy-modal-section">
              <h3 className="privacy-modal-section-title">{section.title}</h3>
              <p className="privacy-modal-section-body">{section.body}</p>
            </div>
          ))}

          {/* Legal reference */}
          <div className="privacy-modal-legal-ref">
            <p className="privacy-modal-legal-text">{t('privacy.legalRef')}</p>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <p role="alert" className="privacy-modal-error">
            ❌ {error}
          </p>
        )}

        {/* Accept button */}
        <button
          data-testid="privacy-consent-accept"
          type="button"
          onClick={handleAccept}
          disabled={buttonDisabled}
          aria-label={t('privacy.acceptButton')}
          className={`privacy-modal-button ${buttonDisabled ? 'privacy-modal-button--disabled' : 'privacy-modal-button--active'}`}
        >
          {isSubmitting
            ? `⏳ ${t('privacy.submitting')}`
            : !hasScrolledToBottom
              ? `↓ ${t('privacy.scrollToRead')}`
              : `✅ ${t('privacy.acceptButton')}`}
        </button>

        {/* Footer notice */}
        <p className="privacy-modal-footer">{t('privacy.footer')}</p>
      </div>
    </div>
  );
};

export default PrivacyConsentModal;
