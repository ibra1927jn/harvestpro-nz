/**
 * ReAuthModal - Session Re-authentication Modal
 * 
 * 🔧 R8-Fix2: Prevents the "Dead Session" deadlock.
 * When JWT expires while offline with pending data,
 * this modal lets the user re-authenticate WITHOUT calling signOut()
 * (which would trigger V27 guard and wipe Dexie).
 * 
 * The modal is ineludible — it overlays the entire app until the user
 * successfully re-authenticates with their password.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { supabase } from '@/services/supabase';
import { syncService } from '@/services/sync.service';
import { logger } from '@/utils/logger';
import { useTranslation } from '@/i18n';
import { authErrorText } from '@/i18n/authErrorText';

interface ReAuthModalProps {
    /** The email of the expired session user */
    email: string;
    /** Called after successful re-authentication */
    onReAuthenticated: () => void;
}

const ReAuthModal: React.FC<ReAuthModalProps> = ({ email, onReAuthenticated }) => {
    const { t } = useTranslation();
    // Sesión caducada: no se puede cerrar con Escape, pero el foco queda dentro
    const dialogRef = useRef<HTMLDivElement>(null);
    useDialogA11y(dialogRef, { closeOnEscape: false });
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);

    useEffect(() => {
        syncService.getPendingCount().then(setPendingCount);
    }, []);

    const handleReAuth = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const { error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) {
                setError(authErrorText(t, authError.message));
                return;
            }

            logger.info('[ReAuthModal] Re-authentication successful. Resuming sync.');
            onReAuthenticated();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('common.unknown_error'));
        } finally {
            setIsLoading(false);
        }
    }, [email, password, onReAuthenticated, t]);

    return (
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="reauth-title" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
        }}>
            <div style={{
                backgroundColor: 'var(--color-surface, #1e1e2e)',
                borderRadius: '16px',
                padding: '32px',
                maxWidth: '400px',
                width: '90vw',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                border: '1px solid var(--color-border, #333)',
            }}>
                <h2 id="reauth-title" style={{ color: 'var(--color-text, #fff)', marginTop: 0, fontSize: '20px' }}>
                    🔒 {t('reauth.title')}
                </h2>

                <p style={{ color: 'var(--color-text-muted, #aaa)', fontSize: '14px', lineHeight: '1.5' }}>
                    {t('reauth.desc_before')}{' '}
                    <strong style={{ color: '#ff6b6b' }}>{t('reauth.records_n', { n: pendingCount })}</strong>{' '}
                    {t('reauth.desc_after')}
                </p>

                <form onSubmit={handleReAuth}>
                    <input
                        type="email"
                        value={email}
                        disabled
                        aria-label={t('auth.email')}
                        style={{
                            width: '100%',
                            padding: '10px 12px',
                            marginBottom: '12px',
                            borderRadius: '8px',
                            border: '1px solid #444',
                            backgroundColor: '#2a2a3e',
                            color: '#888',
                            fontSize: '14px',
                            boxSizing: 'border-box',
                        }}
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t('auth.password')}
                        autoFocus
                        required
                        aria-label={t('auth.password')}
                        style={{
                            width: '100%',
                            padding: '10px 12px',
                            marginBottom: '16px',
                            borderRadius: '8px',
                            border: '1px solid #444',
                            backgroundColor: '#2a2a3e',
                            color: '#fff',
                            fontSize: '14px',
                            boxSizing: 'border-box',
                        }}
                    />

                    {error && (
                        <p style={{ color: '#ff6b6b', fontSize: '13px', margin: '0 0 12px 0' }}>
                            ❌ {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading || !password}
                        style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: isLoading ? '#555' : '#4CAF50',
                            color: '#fff',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {isLoading ? `⏳ ${t('reauth.reconnecting')}` : `🔓 ${t('reauth.reconnect')}`}
                    </button>
                </form>

                <p style={{ color: '#666', fontSize: '11px', marginTop: '16px', textAlign: 'center' }}>
                    ⚠️ {t('reauth.keep_open')}
                </p>
            </div>
        </div>
    );
};

export default ReAuthModal;
