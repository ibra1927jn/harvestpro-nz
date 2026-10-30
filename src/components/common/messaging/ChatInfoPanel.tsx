/**
 * ChatInfoPanel — info de la conversación (botón ⋮ de la cabecera del chat).
 *
 * - Personas: foto o iniciales y rol.
 * - Grupo: renombrar y añadir / quitar personas (solo quien lo creó, un
 *   manager o un admin; lo comprueba también la BD, RPC update_conversation).
 * - Chat directo: crear un grupo con esta persona y otras.
 * - Silenciar (solo para mí).
 * - Adjuntos compartidos (de los mensajes cargados).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { useTranslation } from '@/i18n';
import { roleLabel } from '@/i18n/roleLabel';
import UserAvatar from '@/components/common/account/UserAvatar';
import { messagingRepository, type ChatParticipant } from '@/repositories/messaging.repository';
import { formatBytes, formatDuration } from '@/services/chat-attachments.service';
import { logger } from '@/utils/logger';
import type { ChatGroup, DBMessage } from '@/context/messaging.types';
import { useAttachmentUrl } from './ChatAttachmentView';

interface Props {
    chat: ChatGroup;
    messages: DBMessage[];
    appUserId: string;
    /** manager o admin: gestiona cualquier grupo en el que esté */
    canManageAny: boolean;
    availableUsers: Array<{ id: string; name: string; role: string }>;
    onClose: () => void;
    onUpdate: (changes: { name?: string; add?: string[]; remove?: string[] }) => Promise<boolean>;
    onSetMuted: (muted: boolean) => Promise<boolean>;
    onCreateGroup: (name: string, memberIds: string[]) => Promise<void>;
}

const SharedThumb: React.FC<{ m: DBMessage }> = ({ m }) => {
    const { t } = useTranslation();
    const url = useAttachmentUrl(m.attachment_path, m.local_file_id);
    const label = m.attachment_name || t(`chat.file_kind.${m.attachment_type ?? 'image'}`);
    if (m.attachment_type === 'image') {
        return url
            ? <a href={url} target="_blank" rel="noopener noreferrer" className="block size-16 rounded-lg overflow-hidden bg-slate-100"><img src={url} alt={label} className="size-full object-cover" /></a>
            : <span className="block size-16 rounded-lg bg-slate-100" />;
    }
    return (
        <a href={url ?? undefined} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-1.5 text-xs text-slate-600 min-w-0">
            <span aria-hidden="true" className="material-symbols-outlined text-lg text-slate-400">{m.attachment_type === 'pdf' ? 'picture_as_pdf' : 'mic'}</span>
            <span className="truncate">{m.attachment_type === 'audio' ? `${label} · ${formatDuration(m.duration_ms ?? 0)}` : `${label}${m.attachment_size ? ` · ${formatBytes(m.attachment_size)}` : ''}`}</span>
        </a>
    );
};

const ChatInfoPanel: React.FC<Props> = ({
    chat, messages, appUserId, canManageAny, availableUsers, onClose, onUpdate, onSetMuted, onCreateGroup,
}) => {
    const { t } = useTranslation();
    const ref = useRef<HTMLDivElement>(null);
    useDialogA11y(ref, { onClose });

    const [people, setPeople] = useState<ChatParticipant[]>([]);
    const [loadError, setLoadError] = useState(false);
    const [name, setName] = useState(chat.name);
    const [adding, setAdding] = useState(false);
    const [addSearch, setAddSearch] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupIds, setNewGroupIds] = useState<string[]>([]);
    const [creating, setCreating] = useState(false);

    const memberKey = chat.members.join(',');
    useEffect(() => {
        let cancelled = false;
        messagingRepository.getParticipants(chat.members)
            .then(rows => { if (!cancelled) { setPeople(rows); setLoadError(false); } })
            .catch(e => { logger.warn('[ChatInfo] Participants not loaded:', e); if (!cancelled) setLoadError(true); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [memberKey]);

    const canManage = !!chat.isGroup && (chat.createdBy === appUserId || canManageAny);
    const shared = useMemo(() => messages.filter(m => m.attachment_path).slice().reverse(), [messages]);
    const candidates = useMemo(
        () => availableUsers.filter(u => !chat.members.includes(u.id) && u.name.toLowerCase().includes(addSearch.toLowerCase())),
        [availableUsers, chat.members, addSearch]
    );

    const run = async (fn: () => Promise<boolean>) => {
        setBusy(true);
        setError(null);
        const ok = await fn();
        setBusy(false);
        if (!ok) setError(t('chat.info_not_saved'));
        return ok;
    };

    const personName = (p: ChatParticipant) => (p.id === appUserId ? t('chat.you') : p.full_name || t('chat.unknown_person'));

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
            <div ref={ref} role="dialog" aria-modal="true" aria-label={t('chat.info')}
                className="w-full max-w-sm h-full bg-white shadow-2xl flex flex-col overflow-y-auto" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between px-5 h-16 border-b border-slate-100 shrink-0">
                    <h2 className="text-base font-black text-slate-800">{t('chat.info')}</h2>
                    <button type="button" onClick={onClose} aria-label={t('common.close')} className="size-9 rounded-lg text-slate-400 hover:bg-slate-50 flex items-center justify-center">
                        <span aria-hidden="true" className="material-symbols-outlined">close</span>
                    </button>
                </header>

                {error && <p role="alert" className="mx-5 mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

                {/* Nombre del grupo */}
                {chat.isGroup && canManage ? (
                    <form className="px-5 pt-4 flex gap-2" onSubmit={e => { e.preventDefault(); if (name.trim() && name.trim() !== chat.name) void run(() => onUpdate({ name: name.trim() })); }}>
                        <label className="flex-1">
                            <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{t('chat.group_name')}</span>
                            <input value={name} maxLength={80} onChange={e => setName(e.target.value)}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100" />
                        </label>
                        <button type="submit" disabled={busy || !name.trim() || name.trim() === chat.name}
                            className="self-end px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:opacity-40">{t('chat.rename')}</button>
                    </form>
                ) : (
                    <p className="px-5 pt-4 text-lg font-black text-slate-800">{chat.name}</p>
                )}

                {/* Silenciar */}
                <label className="mx-5 mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm font-bold text-slate-700">
                        <span aria-hidden="true" className="material-symbols-outlined text-slate-400">{chat.muted ? 'notifications_off' : 'notifications'}</span>
                        {t('chat.mute')}
                    </span>
                    <input type="checkbox" role="switch" checked={!!chat.muted} disabled={busy}
                        onChange={e => { const v = e.target.checked; void run(() => onSetMuted(v)); }} className="size-5 accent-indigo-600" />
                </label>

                {/* Personas */}
                <section className="px-5 mt-5" aria-labelledby="chat-info-people">
                    <div className="flex items-center justify-between mb-2">
                        <h3 id="chat-info-people" className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('chat.people_n', { n: chat.members.length })}</h3>
                        {canManage && (
                            <button type="button" onClick={() => setAdding(a => !a)} aria-expanded={adding}
                                className="flex items-center gap-1 text-xs font-bold text-indigo-600">
                                <span aria-hidden="true" className="material-symbols-outlined text-base">person_add</span>{t('chat.add_people')}
                            </button>
                        )}
                    </div>
                    {loadError && <p className="text-xs text-slate-400">{t('chat.people_not_loaded')}</p>}
                    <ul className="space-y-1.5">
                        {people.map(p => (
                            <li key={p.id} className="flex items-center gap-3">
                                <UserAvatar name={p.full_name ?? '?'} userId={p.id} className="size-9 rounded-full bg-indigo-500 text-white" textClassName="text-xs font-bold" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-700 truncate">{personName(p)}</p>
                                    <p className="text-[11px] text-slate-400">
                                        {roleLabel(t, p.role)}
                                        {p.id === chat.createdBy && chat.isGroup ? ` · ${t('chat.group_creator')}` : ''}
                                        {p.is_active === false ? ` · ${t('chat.inactive_account')}` : ''}
                                    </p>
                                </div>
                                {canManage && p.id !== appUserId && (
                                    <button type="button" disabled={busy || chat.members.length <= 2}
                                        onClick={() => void run(() => onUpdate({ remove: [p.id] }))}
                                        aria-label={t('chat.remove_person', { name: personName(p) })}
                                        className="size-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center disabled:opacity-30">
                                        <span aria-hidden="true" className="material-symbols-outlined text-lg">person_off</span>
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                    {canManage && adding && (
                        <div className="mt-3 rounded-xl border border-slate-100 p-2">
                            <input value={addSearch} onChange={e => setAddSearch(e.target.value)} placeholder={t('chat.search_people')} aria-label={t('chat.search_people')}
                                className="w-full rounded-lg bg-slate-50 px-3 py-2 text-sm focus:outline-none" />
                            <ul className="max-h-48 overflow-y-auto mt-1">
                                {candidates.map(u => (
                                    <li key={u.id}>
                                        <button type="button" disabled={busy} onClick={() => void run(() => onUpdate({ add: [u.id] }))}
                                            className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-indigo-50 text-left">
                                            <span className="text-sm text-slate-700">{u.name} <span className="text-[11px] text-slate-400">· {roleLabel(t, u.role)}</span></span>
                                            <span aria-hidden="true" className="material-symbols-outlined text-indigo-500 text-lg">add</span>
                                        </button>
                                    </li>
                                ))}
                                {candidates.length === 0 && <li className="px-2 py-2 text-xs text-slate-400">{t('chat.nobody_to_add')}</li>}
                            </ul>
                        </div>
                    )}
                </section>

                {/* Directo → grupo */}
                {!chat.isGroup && (
                    <section className="px-5 mt-5" aria-labelledby="chat-info-new-group">
                        {!creating ? (
                            <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-2 text-sm font-bold text-indigo-600">
                                <span aria-hidden="true" className="material-symbols-outlined">group_add</span>
                                <span id="chat-info-new-group">{t('chat.create_group_with')}</span>
                            </button>
                        ) : (
                            <form className="space-y-2" onSubmit={async e => {
                                e.preventDefault();
                                if (!newGroupName.trim()) return;
                                setBusy(true);
                                const others = chat.members.filter(id => id !== appUserId);
                                await onCreateGroup(newGroupName.trim(), [...others, ...newGroupIds]);
                                setBusy(false);
                            }}>
                                <h3 id="chat-info-new-group" className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('chat.create_group_with')}</h3>
                                <input value={newGroupName} maxLength={80} onChange={e => setNewGroupName(e.target.value)} placeholder={t('chat.group_name_example')} aria-label={t('chat.group_name')}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none" />
                                <ul className="max-h-40 overflow-y-auto">
                                    {availableUsers.filter(u => !chat.members.includes(u.id)).map(u => (
                                        <li key={u.id}>
                                            <label className="flex items-center gap-2 px-1 py-1.5 text-sm text-slate-700">
                                                <input type="checkbox" checked={newGroupIds.includes(u.id)}
                                                    onChange={() => setNewGroupIds(ids => (ids.includes(u.id) ? ids.filter(x => x !== u.id) : [...ids, u.id]))} />
                                                {u.name} <span className="text-[11px] text-slate-400">· {roleLabel(t, u.role)}</span>
                                            </label>
                                        </li>
                                    ))}
                                </ul>
                                <button type="submit" disabled={busy || !newGroupName.trim()} className="w-full py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:opacity-40">
                                    {t('chat.create_group_n', { n: chat.members.length + newGroupIds.length })}
                                </button>
                            </form>
                        )}
                    </section>
                )}

                {/* Adjuntos compartidos */}
                <section className="px-5 mt-5 pb-6" aria-labelledby="chat-info-shared">
                    <h3 id="chat-info-shared" className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{t('chat.shared_files')}</h3>
                    {shared.length === 0 ? (
                        <p className="text-xs text-slate-400">{t('chat.no_shared_files')}</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {shared.map(m => <SharedThumb key={m.id} m={m} />)}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default ChatInfoPanel;
