/**
 * Mi cuenta → Seguridad: cambio de contraseña (pide la actual) y 2FA.
 *
 * 2FA solo para los roles que lo necesitan (config/mfa.ts): a los demás nadie
 * les pide el código al entrar, así que un factor enrolado no protegería nada.
 * «Regenerar» enrola un autenticador nuevo con MFASetup y, verificado el
 * código, da de baja el anterior (y los enrolados a medias).
 */
import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useTranslation } from '@/i18n';
import { useMFA, type MFAFactor } from '@/hooks/useMFA';
import { isMfaRole } from '@/config/mfa';
import { accountService, type AccountErrorCode } from '@/services/account.service';
import { PASSWORD_MIN } from '@/schemas/account.schemas';
import { formatNZDate } from '@/utils/nzFormat';
import { logger } from '@/utils/logger';
import { AccountField, AccountPrimaryButton, AccountSection, AccountStatusLine, type AccountStatus } from './accountUi';

// Solo se carga al pulsar «Configurar / Regenerar»
const MFASetup = lazy(() => import('@/components/MFASetup').then(m => ({ default: m.MFASetup })));

interface AccountSecurityProps {
    email: string;
    role: string | null | undefined;
    isOnline: boolean;
}

type MfaState =
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'ready'; factors: MFAFactor[] }
    | { kind: 'error' };

const verifiedOf = (factors: MFAFactor[]) =>
    factors.filter(f => f.status === 'verified').sort((a, b) => b.created_at.localeCompare(a.created_at));

export const AccountSecurity: React.FC<AccountSecurityProps> = ({ email, role, isOnline }) => {
    const { t } = useTranslation();

    // ── Contraseña ──
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [repeat, setRepeat] = useState('');
    const [busy, setBusy] = useState(false);
    const [pwStatus, setPwStatus] = useState<AccountStatus>(null);

    const submitPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setPwStatus(null);
        const r = await accountService.changePassword(email, current, next, repeat);
        setBusy(false);
        if (r.ok) {
            setCurrent('');
            setNext('');
            setRepeat('');
            setPwStatus({ kind: 'ok', text: t('account.security.password_changed') });
        } else {
            setPwStatus({ kind: 'error', code: r.error.code as AccountErrorCode });
        }
    };

    // ── 2FA ──
    const mfaApplies = isMfaRole(role);
    const { checkMFAStatus, unenrollMFA } = useMFA();
    const [mfa, setMfa] = useState<MfaState>({ kind: 'idle' });
    const [settingUp, setSettingUp] = useState(false);
    const [mfaStatus, setMfaStatus] = useState<AccountStatus>(null);

    const loadMfa = useCallback(async () => {
        setMfa({ kind: 'loading' });
        try {
            const status = await checkMFAStatus();
            setMfa({ kind: 'ready', factors: status.factors });
        } catch (err) {
            logger.warn('[Account] Could not read MFA status:', err);
            setMfa({ kind: 'error' });
        }
    }, [checkMFAStatus]);

    useEffect(() => {
        if (mfaApplies && isOnline) void loadMfa();
    }, [mfaApplies, isOnline, loadMfa]);

    const verified = mfa.kind === 'ready' ? verifiedOf(mfa.factors) : [];
    const hasMfa = verified.length > 0;

    /** Código verificado: se queda el factor más nuevo y se dan de baja el resto */
    const handleSetupComplete = async () => {
        setSettingUp(false);
        try {
            const status = await checkMFAStatus();
            const keep = verifiedOf(status.factors)[0];
            const stale = status.factors.filter(f => f.id !== keep?.id);
            for (const f of stale) {
                await unenrollMFA(f.id).catch(err => logger.warn('[Account] Could not unenroll old factor:', err));
            }
            setMfaStatus({ kind: 'ok', text: t('account.security.mfa_updated') });
        } catch (err) {
            logger.warn('[Account] Could not finish 2FA regeneration:', err);
        } finally {
            void loadMfa();
        }
    };

    return (
        <AccountSection icon="lock" title={t('settings.security')}>
            <form onSubmit={e => void submitPassword(e)} className="space-y-3" aria-label={t('account.security.change_password')}>
                <p className="text-sm font-semibold text-text-main">{t('account.security.change_password')}</p>
                <AccountField
                    id="account-pw-current"
                    label={t('account.security.current_password')}
                    type="password"
                    autoComplete="current-password"
                    value={current}
                    onChange={e => setCurrent(e.target.value)}
                    disabled={!isOnline || busy}
                    required
                />
                <AccountField
                    id="account-pw-next"
                    label={t('account.security.new_password')}
                    hint={t('account.security.password_hint', { n: PASSWORD_MIN })}
                    type="password"
                    autoComplete="new-password"
                    minLength={PASSWORD_MIN}
                    value={next}
                    onChange={e => setNext(e.target.value)}
                    disabled={!isOnline || busy}
                    required
                />
                <AccountField
                    id="account-pw-repeat"
                    label={t('account.security.repeat_password')}
                    type="password"
                    autoComplete="new-password"
                    value={repeat}
                    onChange={e => setRepeat(e.target.value)}
                    disabled={!isOnline || busy}
                    required
                />
                <AccountStatusLine status={pwStatus} />
                <AccountPrimaryButton busy={busy} disabled={!isOnline || !current || !next || !repeat} className="w-full">
                    {t('account.security.update_password')}
                </AccountPrimaryButton>
            </form>

            <div className="border-t border-border-light pt-3 space-y-2">
                <p className="text-sm font-semibold text-text-main flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-text-muted">shield</span>
                    {t('auth.twoFactor.title')}
                </p>
                {!mfaApplies && (
                    <p className="text-xs text-text-muted">{t('account.security.mfa_not_required')}</p>
                )}
                {mfaApplies && !settingUp && (
                    <>
                        {mfa.kind === 'loading' && <p className="text-xs text-text-muted">{t('mfa.checking')}</p>}
                        {mfa.kind === 'error' && <p role="alert" className="text-xs text-red-600">{t('mfa.check_failed')}</p>}
                        {mfa.kind === 'ready' && (
                            <p className="text-xs text-text-sub">
                                {hasMfa
                                    ? t('account.security.mfa_on', { date: formatNZDate(verified[0].created_at, 'medium') })
                                    : t('account.security.mfa_off')}
                            </p>
                        )}
                        {mfa.kind === 'idle' && !isOnline && <p className="text-xs text-text-muted">{t('mfa.checking')}</p>}
                        {hasMfa && <p className="text-[11px] text-text-muted">{t('account.security.mfa_regenerate_hint')}</p>}
                        <AccountStatusLine status={mfaStatus} />
                        <button
                            type="button"
                            onClick={() => { setMfaStatus(null); setSettingUp(true); }}
                            disabled={!isOnline || mfa.kind !== 'ready'}
                            className="min-h-[44px] px-4 rounded-xl border-2 border-border-light text-sm font-bold text-text-main hover:bg-background-light transition-colors disabled:opacity-50"
                        >
                            {hasMfa ? t('account.security.mfa_regenerate') : t('account.security.mfa_setup')}
                        </button>
                    </>
                )}
                {mfaApplies && settingUp && (
                    <Suspense fallback={<p className="text-xs text-text-muted">{t('common.loading')}</p>}>
                        <MFASetup
                            friendlyName={`HarvestPro Authenticator ${new Date().toISOString().slice(0, 16)}`}
                            onComplete={() => void handleSetupComplete()}
                            onCancel={() => setSettingUp(false)}
                        />
                    </Suspense>
                )}
            </div>
        </AccountSection>
    );
};

export default AccountSecurity;
