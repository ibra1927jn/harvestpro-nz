/**
 * InvitationsPanel — «Invitar» (B1, auditoría 2026-10-23).
 *
 * Sin invitación nadie puede darse de alta (el registro exige una fila en
 * allowed_registrations). Admin (Admin › Users) y RRHH (RRHH › Employees)
 * invitan con email, rol, huerto y nombre opcional; ven las pendientes, usadas
 * y caducadas, y reenvían o anulan. No hay envío de correo: la pantalla enseña
 * el enlace de registro para copiarlo y mandarlo (WhatsApp, SMS, correo).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { invitationsRepository, type InvitationRow, INVITATION_DAYS } from '@/repositories/invitations.repository';
import { loadOrchardNames } from '@/repositories/pay-rates.repository';
import { roleLabel } from '@/i18n/roleLabel';
import { useTranslation } from '@/i18n';
import { formatNZDate } from '@/utils/nzFormat';
import { logger } from '@/utils/logger';
import {
    countByStatus,
    invitableRoles,
    invitationErrorKey,
    invitationStatus,
    isValidEmail,
    signupLink,
    type InvitationStatus,
} from './invitationLogic';

interface InvitationsPanelProps {
    /** Admin invita admins; RRHH no (lo vuelve a comprobar la BD) */
    canInviteAdmin: boolean;
}

const STATUS_STYLES: Record<InvitationStatus, string> = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    used: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    expired: 'bg-slate-100 text-slate-500 border-slate-200',
};

const TABS: InvitationStatus[] = ['pending', 'used', 'expired'];

const origin = () => (typeof window !== 'undefined' ? window.location.origin : '');

const InvitationsPanel: React.FC<InvitationsPanelProps> = ({ canInviteAdmin }) => {
    const { t } = useTranslation();
    const roles = useMemo(() => invitableRoles(canInviteAdmin), [canInviteAdmin]);
    const [rows, setRows] = useState<InvitationRow[]>([]);
    const [orchards, setOrchards] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [tab, setTab] = useState<InvitationStatus>('pending');
    const [showForm, setShowForm] = useState(false);
    const [email, setEmail] = useState('');
    const [fullName, setFullName] = useState('');
    const [role, setRole] = useState<string>(roles[0]);
    const [orchardId, setOrchardId] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    /** Enlace de la última invitación creada o reenviada (para copiarlo) */
    const [lastLink, setLastLink] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const [list, names] = await Promise.all([invitationsRepository.list(), loadOrchardNames()]);
            setRows(list);
            setOrchards(names);
        } catch (e) {
            logger.warn('[Invitations] Could not load invitations:', e);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void reload(); }, [reload]);

    const counts = useMemo(() => countByStatus(rows), [rows]);
    const visible = useMemo(() => rows.filter(r => invitationStatus(r) === tab), [rows, tab]);
    const orchardOptions = useMemo(
        () => Object.entries(orchards).sort((a, b) => a[1].localeCompare(b[1])),
        [orchards]
    );

    const copy = async (link: string) => {
        try {
            await navigator.clipboard.writeText(link);
            setNotice(t('invite.copied'));
        } catch {
            // Sin permiso de portapapeles: el enlace queda a la vista para copiarlo a mano
            setNotice(t('invite.copy_manually'));
        }
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setNotice(null);
        if (!isValidEmail(email)) {
            setError(t('invite.err.email'));
            return;
        }
        setSaving(true);
        try {
            const created = await invitationsRepository.create({
                email,
                role,
                orchardId: orchardId || null,
                fullName,
            });
            setRows(prev => [created, ...prev]);
            setLastLink(signupLink(created.email, origin()));
            setNotice(t('invite.created', { email: created.email, days: INVITATION_DAYS }));
            setTab('pending');
            setEmail('');
            setFullName('');
        } catch (err) {
            logger.warn('[Invitations] Invite failed:', err);
            setError(t(invitationErrorKey(err)));
        } finally {
            setSaving(false);
        }
    };

    const resend = async (inv: InvitationRow) => {
        setError(null);
        setNotice(null);
        try {
            const updated = await invitationsRepository.resend(inv.id);
            setRows(prev => prev.map(r => (r.id === updated.id ? updated : r)));
            setLastLink(signupLink(updated.email, origin()));
            setNotice(t('invite.resent', { email: updated.email, days: INVITATION_DAYS }));
        } catch (err) {
            logger.warn('[Invitations] Resend failed:', err);
            setError(t(invitationErrorKey(err)));
        }
    };

    const revoke = async (inv: InvitationRow) => {
        if (!window.confirm(t('invite.confirm_revoke', { email: inv.email }))) return;
        setError(null);
        setNotice(null);
        try {
            await invitationsRepository.revoke(inv.id);
            setRows(prev => prev.filter(r => r.id !== inv.id));
            setNotice(t('invite.revoked', { email: inv.email }));
        } catch (err) {
            logger.warn('[Invitations] Revoke failed:', err);
            setError(t(invitationErrorKey(err)));
        }
    };

    return (
        <section className="bg-white rounded-xl border border-border-light shadow-sm" data-testid="invitations-panel">
            <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-border-light">
                <div className="min-w-0">
                    <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                        <span aria-hidden="true" className="material-symbols-outlined text-base text-indigo-600">mail</span>
                        {t('invite.title')}
                    </h3>
                    <p className="text-xs text-text-secondary">{t('invite.subtitle')}</p>
                </div>
                <button
                    type="button"
                    onClick={() => { setShowForm(v => !v); setError(null); }}
                    aria-expanded={showForm}
                    className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-700 shrink-0"
                >
                    <span aria-hidden="true" className="material-symbols-outlined text-base">person_add</span>
                    {t('invite.new')}
                </button>
            </div>

            {showForm && (
                <form onSubmit={submit} className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-3 border-b border-border-light bg-slate-50/50" aria-label={t('invite.new')}>
                    <label className="text-xs font-semibold text-text-secondary flex flex-col gap-1">
                        {t('invite.email')}
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            autoComplete="off"
                            className="px-3 py-2 rounded-lg border border-border-light text-sm bg-white"
                        />
                    </label>
                    <label className="text-xs font-semibold text-text-secondary flex flex-col gap-1">
                        {t('invite.name_optional')}
                        <input
                            type="text"
                            value={fullName}
                            maxLength={120}
                            onChange={e => setFullName(e.target.value)}
                            className="px-3 py-2 rounded-lg border border-border-light text-sm bg-white"
                        />
                    </label>
                    <label className="text-xs font-semibold text-text-secondary flex flex-col gap-1">
                        {t('invite.role')}
                        <select
                            value={role}
                            onChange={e => setRole(e.target.value)}
                            className="px-3 py-2 rounded-lg border border-border-light text-sm bg-white"
                        >
                            {roles.map(r => <option key={r} value={r}>{roleLabel(t, r)}</option>)}
                        </select>
                    </label>
                    <label className="text-xs font-semibold text-text-secondary flex flex-col gap-1">
                        {t('invite.orchard')}
                        <select
                            value={orchardId}
                            onChange={e => setOrchardId(e.target.value)}
                            className="px-3 py-2 rounded-lg border border-border-light text-sm bg-white"
                        >
                            <option value="">{t('invite.orchard_any')}</option>
                            {orchardOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                        </select>
                    </label>
                    <div className="md:col-span-2 flex justify-end">
                        <button
                            type="submit"
                            disabled={saving || !email}
                            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-50"
                        >
                            {saving ? t('invite.sending') : t('invite.send')}
                        </button>
                    </div>
                </form>
            )}

            {error && <div role="alert" className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
            {notice && <div role="status" className="mx-4 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}
            {lastLink && (
                <div className="mx-4 mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2" data-testid="invite-link">
                    <p className="text-xs font-semibold text-indigo-800 mb-1">{t('invite.link_hint')}</p>
                    <div className="flex items-center gap-2">
                        <input readOnly value={lastLink} aria-label={t('invite.link')} className="flex-1 min-w-0 px-2 py-1.5 rounded border border-indigo-200 text-xs bg-white font-mono" onFocus={e => e.currentTarget.select()} />
                        <button type="button" onClick={() => void copy(lastLink)} className="px-2.5 py-1.5 rounded bg-indigo-600 text-white text-xs font-bold flex items-center gap-1">
                            <span aria-hidden="true" className="material-symbols-outlined text-sm">content_copy</span>
                            {t('invite.copy')}
                        </button>
                    </div>
                </div>
            )}

            <div role="tablist" aria-label={t('invite.title')} className="px-4 pt-3 flex gap-2">
                {TABS.map(s => (
                    <button
                        key={s}
                        type="button"
                        role="tab"
                        aria-selected={tab === s}
                        onClick={() => setTab(s)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold ${tab === s ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}
                    >
                        {t(`invite.status.${s}`)} ({counts[s]})
                    </button>
                ))}
            </div>

            <div className="p-4 space-y-2">
                {loading && <p className="text-sm text-text-muted">{t('invite.loading')}</p>}
                {!loading && loadError && (
                    <div role="alert" className="text-sm text-red-700 flex items-center gap-2">
                        {t('invite.load_failed')}
                        <button type="button" onClick={() => void reload()} className="underline font-semibold">{t('common.retry')}</button>
                    </div>
                )}
                {!loading && !loadError && visible.length === 0 && (
                    <p className="text-sm text-text-muted">{t(`invite.empty.${tab}`)}</p>
                )}
                {!loading && visible.map(inv => {
                    const status = invitationStatus(inv);
                    const link = signupLink(inv.email, origin());
                    return (
                        <div key={inv.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border-light px-3 py-2" data-testid={`invitation-${inv.id}`}>
                            <div className="flex-1 min-w-[180px]">
                                <p className="text-sm font-semibold text-text-primary truncate">{inv.full_name || inv.email}</p>
                                <p className="text-xs text-text-secondary truncate">
                                    {inv.full_name ? `${inv.email} · ` : ''}{roleLabel(t, inv.assigned_role)}
                                    {inv.orchard_id ? ` · ${orchards[inv.orchard_id] ?? ''}` : ''}
                                </p>
                                <p className="text-[11px] text-text-muted">
                                    {status === 'used' && inv.used_at
                                        ? t('invite.used_on', { date: formatNZDate(inv.used_at, 'medium') })
                                        : inv.expires_at
                                            ? t(status === 'expired' ? 'invite.expired_on' : 'invite.expires_on', { date: formatNZDate(inv.expires_at, 'medium') })
                                            : t('invite.no_expiry')}
                                </p>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${STATUS_STYLES[status]}`}>
                                {t(`invite.status.${status}`)}
                            </span>
                            {status !== 'used' && (
                                <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => { setLastLink(link); void copy(link); }} title={t('invite.copy')} aria-label={t('invite.copy_for', { email: inv.email })} className="p-1.5 rounded-md text-text-muted hover:text-indigo-600 hover:bg-indigo-50">
                                        <span aria-hidden="true" className="material-symbols-outlined text-base">content_copy</span>
                                    </button>
                                    <button type="button" onClick={() => void resend(inv)} title={t('invite.resend')} aria-label={t('invite.resend_for', { email: inv.email })} className="p-1.5 rounded-md text-text-muted hover:text-indigo-600 hover:bg-indigo-50">
                                        <span aria-hidden="true" className="material-symbols-outlined text-base">send</span>
                                    </button>
                                    <button type="button" onClick={() => void revoke(inv)} title={t('invite.revoke')} aria-label={t('invite.revoke_for', { email: inv.email })} className="p-1.5 rounded-md text-text-muted hover:text-red-600 hover:bg-red-50">
                                        <span aria-hidden="true" className="material-symbols-outlined text-base">block</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
};

export default InvitationsPanel;
