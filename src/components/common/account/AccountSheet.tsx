/**
 * AccountSheet — «Mi cuenta», la misma pantalla para los 8 roles.
 * Se abre desde el avatar de la cabecera (Header en móvil, DesktopLayout en escritorio).
 *
 * Secciones: foto · datos (nombre a mostrar, teléfono) · idioma · seguridad
 * (contraseña, 2FA) · mi trabajo (solo lectura) · notificaciones · cerrar sesión.
 * Los datos de RRHH (nombre legal, IRD, banco, visado, contrato) no se tocan aquí.
 * Todo lo que escribe necesita red: sin conexión se deshabilita y se avisa.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useAvatarSignedUrl } from '@/hooks/useAvatarUrl';
import { useTranslation, SUPPORTED_LOCALES, type Locale } from '@/i18n';
import { roleLabel } from '@/i18n/roleLabel';
import { accountService, type AccountErrorCode } from '@/services/account.service';
import { notificationService } from '@/services/notification.service';
import { PushStatusHint } from '@/components/common/PushStatusHint';
import { getConfig } from '@/services/config.service';
import { findTeamLeader, selectTeamOf } from '@/services/harvestMetrics/roster';
import { AVATAR_INPUT_TYPES, DISPLAY_NAME_MAX, DISPLAY_NAME_MIN, PHONE_MAX } from '@/schemas/account.schemas';
import { formatNZD } from '@/utils/nzFormat';
import { logger } from '@/utils/logger';
import type { AppUser } from '@/types';
import { ToggleRow } from '@/components/views/manager/settings/SettingsFormComponents';
import UserAvatar from './UserAvatar';
import Toast from '@/components/ui/Toast';
import { useToast } from '@/hooks/useToast';
import AccountSecurity from './AccountSecurity';
import { AccountField, AccountPanel, AccountPrimaryButton, AccountSection, AccountStatusLine, type AccountStatus } from './accountUi';

interface AccountSheetProps {
    onClose: () => void;
}

/** Roles que cobran o gestionan por cubeta: ven precio y mínimo del huerto */
const BUCKET_PAY_ROLES = new Set(['team_leader', 'runner']);

const errorStatus = (code: string): AccountStatus => ({ kind: 'error', code: code as AccountErrorCode });

const AccountSheet: React.FC<AccountSheetProps> = ({ onClose }) => {
    const { t, locale, setLocale } = useTranslation();
    const navigate = useNavigate();
    const { appUser, orchardName, availableOrchards, signOut, updateAuthState } = useAuth();
    const { isOnline } = useNetworkStatus();
    const crew = useHarvestStore(s => s.crew);
    const settings = useHarvestStore(s => s.settings);

    const user: AppUser | null = appUser;
    const userId = user?.id ?? '';
    // Siempre la última versión de appUser: tras un await (subida, guardado) no se pisa
    // con una copia vieja lo que haya cambiado mientras tanto
    const userRef = useRef(user);
    userRef.current = user;

    /** Aplica cambios del perfil al estado de auth (cabecera, cajones…) */
    const patchUser = useCallback((patch: Partial<AppUser>) => {
        const current = userRef.current;
        if (!current) return;
        const nextUser = { ...current, ...patch };
        updateAuthState({ appUser: nextUser, userName: nextUser.full_name || '' });
    }, [updateAuthState]);

    // Al abrir con red: refrescar teléfono / idioma / foto por si cambiaron en otro dispositivo
    useEffect(() => {
        if (!userId || !isOnline) return;
        let cancelled = false;
        void accountService.getMyProfile(userId).then(r => {
            if (cancelled || !r.ok || !r.data) return;
            const row = r.data;
            patchUser({
                full_name: row.full_name ?? '',
                phone: row.phone,
                preferred_locale: row.preferred_locale,
                avatar_url: row.avatar_url,
            });
        });
        return () => {
            cancelled = true;
        };
    }, [userId, isOnline, patchUser]);

    // ── Foto ──
    const avatarUrl = useAvatarSignedUrl(user?.avatar_url);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [photoBusy, setPhotoBusy] = useState(false);
    const [photoStatus, setPhotoStatus] = useState<AccountStatus>(null);

    const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !user) return;
        setPhotoBusy(true);
        setPhotoStatus(null);
        const r = await accountService.uploadAvatar(file, user.id, user.avatar_url);
        setPhotoBusy(false);
        if (r.ok) {
            patchUser({ avatar_url: r.data });
            setPhotoStatus({ kind: 'ok', text: t('account.photo.saved') });
        } else {
            setPhotoStatus(errorStatus(r.error.code));
        }
    };

    const onRemovePhoto = async () => {
        if (!user) return;
        setPhotoBusy(true);
        setPhotoStatus(null);
        const r = await accountService.removeAvatar(user.id, user.avatar_url);
        setPhotoBusy(false);
        if (r.ok) {
            patchUser({ avatar_url: null });
            setPhotoStatus({ kind: 'ok', text: t('account.photo.removed') });
        } else {
            setPhotoStatus(errorStatus(r.error.code));
        }
    };

    // ── Datos ──
    const [fullName, setFullName] = useState(user?.full_name ?? '');
    const [phone, setPhone] = useState(user?.phone ?? '');
    const [detailsBusy, setDetailsBusy] = useState(false);
    // Guardar nombre / teléfono avisa con un toast (antes una línea bajo el formulario que no se veía)
    // Los errores siguen junto al formulario (dicen qué campo corregir)
    const { toast, showToast, hideToast } = useToast();
    const [detailsStatus, setDetailsStatus] = useState<AccountStatus>(null);
    // Si el perfil llega refrescado (otro dispositivo) y aún no se ha tocado el formulario, se refleja
    const detailsDirty = useRef(false);
    useEffect(() => {
        if (detailsDirty.current) return;
        setFullName(user?.full_name ?? '');
        setPhone(user?.phone ?? '');
    }, [user?.full_name, user?.phone]);

    const submitDetails = async (e: React.FormEvent) => {
        e.preventDefault();
        setDetailsBusy(true);
        setDetailsStatus(null);
        const r = await accountService.updateMyDetails({ full_name: fullName, phone });
        setDetailsBusy(false);
        if (r.ok) {
            detailsDirty.current = false;
            patchUser({ full_name: r.data.full_name ?? fullName.trim(), phone: r.data.phone });
            showToast(t('account.details.saved'), 'success');
        } else {
            setDetailsStatus(errorStatus(r.error.code));
        }
    };

    // ── Idioma ──
    const [langStatus, setLangStatus] = useState<AccountStatus>(null);
    const chooseLocale = async (code: Locale) => {
        setLangStatus(null);
        const switched = await setLocale(code);
        if (!switched) return;
        if (!isOnline) {
            setLangStatus({ kind: 'ok', text: t('account.language.saved_locally') });
            return;
        }
        const r = await accountService.updatePreferredLocale(code);
        if (r.ok) patchUser({ preferred_locale: code });
        else setLangStatus(errorStatus(r.error.code));
    };

    // ── Mi trabajo ──
    const pickerRecord = crew.find(p => p.id === userId);
    const teamLeader = pickerRecord ? findTeamLeader(crew, pickerRecord) : undefined;
    const ownTeamSize = user?.role === 'team_leader' ? selectTeamOf(crew, userId).length : 0;
    const showsBucketPay = BUCKET_PAY_ROLES.has(user?.role ?? '');

    // ── Notificaciones ──
    const [notifEnabled, setNotifEnabled] = useState(() => notificationService.getPrefs().enabled);
    const toggleNotifications = async (enabled: boolean) => {
        const ok = await notificationService.setEnabled(enabled);
        if (ok) setNotifEnabled(enabled);
    };

    // ── Cerrar sesión ──
    const [signingOut, setSigningOut] = useState(false);
    const handleSignOut = async () => {
        if (signingOut) return;
        setSigningOut(true);
        try {
            await signOut();
            navigate('/login', { replace: true });
        } catch (err) {
            logger.error('[Account] Sign-out failed:', err);
            setSigningOut(false);
        }
    };

    if (!user) return null;

    const version = getConfig().APP_VERSION ?? '';

    return (
        <AccountPanel title={t('account.title')} onClose={onClose}>
            <div className="px-4 py-4 space-y-4 pb-10">
                {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
                {!isOnline && (
                    <div role="status" className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2 text-xs font-semibold">
                        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">cloud_off</span>
                        {t('account.error.offline')}
                    </div>
                )}

                {/* Foto */}
                <AccountSection icon="photo_camera" title={t('account.photo.title')}>
                    <div className="flex items-center gap-4">
                        <UserAvatar
                            name={user.full_name || user.email}
                            url={avatarUrl}
                            className="size-20 rounded-2xl bg-primary text-white shadow-md"
                            textClassName="text-2xl"
                        />
                        <div className="flex-1 min-w-0 space-y-2">
                            <p className="text-base font-black text-text-main truncate">{user.full_name}</p>
                            <p className="text-xs text-text-muted truncate">{user.email}</p>
                            <div className="flex flex-wrap gap-2">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept={AVATAR_INPUT_TYPES.join(',')}
                                    className="sr-only"
                                    aria-label={t('account.photo.change')}
                                    onChange={e => void onPickFile(e)}
                                    disabled={!isOnline || photoBusy}
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={!isOnline || photoBusy}
                                    className="min-h-[40px] px-3 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                                >
                                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                                        {photoBusy ? 'progress_activity' : 'upload'}
                                    </span>
                                    {photoBusy ? t('common.loading') : t('account.photo.change')}
                                </button>
                                {user.avatar_url && (
                                    <button
                                        type="button"
                                        onClick={() => void onRemovePhoto()}
                                        disabled={!isOnline || photoBusy}
                                        className="min-h-[40px] px-3 rounded-xl border-2 border-border-light text-xs font-bold text-text-sub hover:text-red-600 hover:border-red-200 disabled:opacity-50"
                                    >
                                        {t('account.photo.remove')}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    <p className="text-[11px] text-text-muted">{t('account.photo.hint')}</p>
                    <AccountStatusLine status={photoStatus} />
                </AccountSection>

                {/* Datos */}
                <AccountSection icon="badge" title={t('account.details.title')}>
                    <form onSubmit={e => void submitDetails(e)} className="space-y-3">
                        <AccountField
                            id="account-full-name"
                            label={t('account.details.display_name')}
                            hint={t('account.details.display_name_hint', { min: DISPLAY_NAME_MIN, max: DISPLAY_NAME_MAX })}
                            value={fullName}
                            onChange={e => { detailsDirty.current = true; setFullName(e.target.value); }}
                            maxLength={DISPLAY_NAME_MAX}
                            autoComplete="name"
                            disabled={!isOnline || detailsBusy}
                            required
                        />
                        <AccountField
                            id="account-phone"
                            label={t('account.details.phone')}
                            hint={t('account.details.phone_hint', { max: PHONE_MAX })}
                            type="tel"
                            value={phone}
                            onChange={e => { detailsDirty.current = true; setPhone(e.target.value); }}
                            maxLength={PHONE_MAX}
                            autoComplete="tel"
                            disabled={!isOnline || detailsBusy}
                        />
                        <AccountStatusLine status={detailsStatus} />
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-[11px] text-text-muted flex-1">{t('account.details.hr_note')}</p>
                            <AccountPrimaryButton busy={detailsBusy} disabled={!isOnline}>
                                {t('common.save')}
                            </AccountPrimaryButton>
                        </div>
                    </form>
                </AccountSection>

                {/* Idioma */}
                <AccountSection icon="translate" title={t('settings.language')}>
                    <div className="grid grid-cols-2 gap-2">
                        {SUPPORTED_LOCALES.map(loc => {
                            const active = locale === loc.code;
                            return (
                                <button
                                    key={loc.code}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => void chooseLocale(loc.code)}
                                    className={`flex items-center gap-2 p-2.5 rounded-xl border-2 text-left transition-all ${
                                        active ? 'border-primary bg-primary/5' : 'border-border-light hover:border-primary/40'
                                    }`}
                                >
                                    <span aria-hidden="true" className="text-lg">{loc.flag}</span>
                                    <span className={`text-xs font-semibold truncate ${active ? 'text-primary' : 'text-text-sub'}`}>
                                        {loc.nativeName}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-[11px] text-text-muted">{t('account.language.hint')}</p>
                    <AccountStatusLine status={langStatus} />
                </AccountSection>

                {/* Seguridad */}
                <AccountSecurity email={user.email} role={user.role} isOnline={isOnline} />

                {/* Mi trabajo (solo lectura) */}
                <AccountSection icon="work" title={t('account.work.title')}>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                        <WorkItem label={t('hr.role')} value={roleLabel(t, user.role)} />
                        <WorkItem
                            label={availableOrchards.length > 1 ? t('account.work.orchards') : t('panel.history.orchard')}
                            value={availableOrchards.length > 1 ? availableOrchards.map(o => o.name).join(', ') : orchardName || '—'}
                        />
                        {(ownTeamSize > 0 || teamLeader || pickerRecord) && (
                            <WorkItem
                                label={t('panel.picker.team')}
                                value={
                                    user.role === 'team_leader'
                                        ? t('account.work.team_members', { n: ownTeamSize })
                                        : teamLeader?.name ?? t('panel.picker.no_team')
                                }
                            />
                        )}
                        {pickerRecord && <WorkItem label={t('account.work.picker_id')} value={pickerRecord.picker_id} mono />}
                        {showsBucketPay && settings && (
                            <>
                                <WorkItem label={t('tl.piece_rate')} value={t('tl.per_bin', { amount: formatNZD(settings.piece_rate ?? 0) })} mono />
                                <WorkItem label={t('tl.min_wage')} value={t('tl.per_hour', { amount: formatNZD(settings.min_wage_rate ?? 0) })} mono />
                            </>
                        )}
                    </dl>
                </AccountSection>

                {/* Notificaciones */}
                <AccountSection icon="notifications" title={t('settings.notifications')}>
                    <ToggleRow
                        label={t('settings.notif.enable')}
                        description={t('settings.notif.enable_desc')}
                        checked={notifEnabled}
                        onChange={v => void toggleNotifications(v)}
                        icon="notifications_active"
                    />
                    <PushStatusHint enabled={notifEnabled} />
                </AccountSection>

                {/* Cerrar sesión + versión */}
                <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    disabled={signingOut}
                    className="w-full min-h-[48px] bg-slate-900 hover:bg-black text-white font-bold rounded-xl shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                    <span aria-hidden="true" className="material-symbols-outlined">{signingOut ? 'hourglass_empty' : 'logout'}</span>
                    {t('common.sign_out')}
                </button>
                {/* i18n-ignore: nombre del producto y número de versión */}
                <p className="text-center text-[10px] text-text-muted font-mono">HarvestPro NZ v{version}</p>
            </div>
        </AccountPanel>
    );
};

const WorkItem: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
    <div className="min-w-0">
        <dt className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{label}</dt>
        <dd className={`text-text-main font-semibold break-words ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
);

export default AccountSheet;
