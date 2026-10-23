/**
 * ChatWindow — Message stream, compose bar, and chat header
 */
import React, { useState, useRef, useCallback, useMemo } from 'react';
import { ChatGroup, DBMessage } from '../../../context/MessagingContext';
import type { OutgoingAttachment, SendAttachmentResult } from '../../../context/messaging.types';
import { QUICK_REPLIES, REACTION_EMOJIS, getAvatarColor, formatTime, getDateLabel } from './messagingHelpers';
import { useTranslation } from '@/i18n';
import {
    MAX_ATTACHMENT_BYTES,
    MAX_VOICE_MS,
    baseMime,
    classifyFile,
    formatDuration,
    prepareImage,
} from '@/services/chat-attachments.service';
import { useVoiceRecorder, type VoiceRecording } from '@/hooks/useVoiceRecorder';
import ChatAttachmentView from './ChatAttachmentView';

/** Mantener pulsado el micrófono al menos esto = grabar mientras se pulsa y enviar al soltar */
export const HOLD_TO_RECORD_MS = 400;

/** Tipos que acepta el selector de archivos */
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

// Extend DBMessage with optional metadata for reply threading
interface MessageWithMetadata extends DBMessage {
    metadata?: { replyTo?: string };
}

interface Props {
    selectedChat: ChatGroup;
    messages: DBMessage[];
    appUserId: string;
    isManager: boolean;
    userNameMap: Record<string, string>;
    isSending: boolean;
    onSend: (content: string) => void;
    /** Foto, PDF o nota de voz. Devuelve el error si no se pudo enviar ni guardar. */
    onSendAttachment?: (file: OutgoingAttachment) => Promise<SendAttachmentResult['error'] | undefined>;
    /** Abrir el panel de info de la conversación */
    onOpenInfo?: () => void;
    /** Reintentar un mensaje propio que no se envió */
    onRetry?: (messageId: string) => void;
    onBack: () => void;
}

const ChatWindow: React.FC<Props> = ({
    selectedChat, messages, appUserId, userNameMap, isSending, onSend, onSendAttachment, onOpenInfo, onRetry, onBack,
}) => {
    const { t } = useTranslation();
    const [newMessage, setNewMessage] = useState('');
    const [showQuickReplies, setShowQuickReplies] = useState(false);
    const [replyTo, setReplyTo] = useState<DBMessage | null>(null);
    const [hoveredMsg, setHoveredMsg] = useState<string | null>(null);
    const [reactions, setReactions] = useState<Record<string, string[]>>({});
    const [isTyping, setIsTyping] = useState(false);
    const [attachError, setAttachError] = useState<string | null>(null);
    const [isPreparing, setIsPreparing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pressStartRef = useRef<number | null>(null);
    const voice = useVoiceRecorder(MAX_VOICE_MS);
    const isRecording = voice.isRecording;
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const toggleReaction = (msgId: string, emoji: string) => {
        setReactions(prev => {
            const existing = prev[msgId] || [];
            if (existing.includes(emoji)) return { ...prev, [msgId]: existing.filter(e => e !== emoji) };
            return { ...prev, [msgId]: [...existing, emoji] };
        });
        setHoveredMsg(null);
    };

    const getSenderName = (senderId: string) => senderId === appUserId ? t('chat.you') : (userNameMap[senderId] || t('chat.unknown_person'));

    const errorText = (e: SendAttachmentResult['error']) =>
        e === 'queue_full' ? t('chat.queue_full') : e === 'too_large' ? t('chat.file_too_large') : t('chat.attachment_failed');

    const sendFile = useCallback(async (file: OutgoingAttachment) => {
        if (!onSendAttachment) return;
        setAttachError(null);
        const err = await onSendAttachment(file);
        if (err) setAttachError(errorText(err));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onSendAttachment, t]);

    // Foto (se reduce a 1600 px) o PDF, máx. 10 MB
    const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setAttachError(null);
        const kind = classifyFile(file.type);
        if (!kind || kind.type === 'audio') {
            setAttachError(t('chat.file_unsupported'));
            return;
        }
        if (kind.type === 'pdf' && file.size > MAX_ATTACHMENT_BYTES) {
            setAttachError(t('chat.file_too_large'));
            return;
        }
        setIsPreparing(true);
        try {
            const blob = kind.type === 'image' ? await prepareImage(file) : file;
            if (blob.size > MAX_ATTACHMENT_BYTES) {
                setAttachError(t('chat.file_too_large'));
                return;
            }
            const resized = blob !== file;
            const mime = resized ? 'image/jpeg' : baseMime(file.type);
            const ext = resized ? 'jpg' : kind.ext;
            const name = resized ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name;
            await sendFile({ blob, type: kind.type, mime, ext, name, caption: newMessage });
            setNewMessage('');
        } finally {
            setIsPreparing(false);
        }
    };

    // Nota de voz: se envía como adjunto 'audio'
    const sendVoice = useCallback(async (rec: VoiceRecording) => {
        const kind = classifyFile(rec.mime);
        await sendFile({
            blob: rec.blob,
            type: 'audio',
            mime: baseMime(rec.mime) || 'audio/webm',
            ext: kind?.type === 'audio' ? kind.ext : 'webm',
            durationMs: rec.durationMs,
        });
    }, [sendFile]);

    const startVoice = () => {
        setAttachError(null);
        void voice.start(rec => void sendVoice(rec));
    };
    const finishVoice = async () => {
        const rec = await voice.stop();
        if (rec) await sendVoice(rec);
    };
    const voiceErrorText = voice.error === 'denied'
        ? t('chat.mic_denied')
        : voice.error ? t('chat.mic_unavailable') : null;

    const handleSend = useCallback((content?: string) => {
        const text = (content || newMessage).trim();
        if (!text) return;
        onSend(text);
        setNewMessage('');
        setShowQuickReplies(false);
        setReplyTo(null);
        inputRef.current?.focus();
    }, [newMessage, onSend]);

    const messagesByDate = useMemo(() => {
        const groups: { label: string; messages: DBMessage[] }[] = [];
        let currentLabel = '';
        messages.forEach(m => {
            const label = getDateLabel(m.created_at, t);
            if (label !== currentLabel) { currentLabel = label; groups.push({ label, messages: [m] }); }
            else { groups[groups.length - 1].messages.push(m); }
        });
        return groups;
    }, [messages, t]);

    // Auto-scroll on new messages
    React.useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    return (
        <>
            {/* Chat Header */}
            <header className="h-16 flex items-center justify-between px-5 glass-chat-header sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <button aria-label={t('chat.back')} onClick={onBack} className="md:hidden size-9 rounded-lg text-slate-400 hover:bg-slate-50 flex items-center justify-center">
                        <span aria-hidden="true" className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <div className="relative">
                        <div className={`size-10 rounded-full bg-gradient-to-br ${getAvatarColor(selectedChat.name)} flex items-center justify-center font-bold text-white text-sm shadow-sm`}>
                            {selectedChat.isGroup ? <span aria-hidden="true" className="material-symbols-outlined text-base">groups</span> : selectedChat.name.split(' ').map(w => w[0]).join('').substring(0, 1).toUpperCase()}
                        </div>
                        {!selectedChat.isGroup && <div className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-400 border-2 border-white online-dot"></div>}
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-800">{selectedChat.name}</h3>
                        <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                            {selectedChat.isGroup ? t('teams.members_count_other', { n: selectedChat.members.length }) : <><span className="inline-block size-1.5 rounded-full bg-emerald-400 mr-1"></span>{t('common.online')}</>}
                        </p>
                    </div>
                </div>
                <button type="button" onClick={onOpenInfo} aria-label={t('chat.info')} className="size-9 rounded-xl hover:bg-slate-50 text-slate-400 flex items-center justify-center transition" title={t('chat.info')}>
                    <span aria-hidden="true" className="material-symbols-outlined text-xl">more_vert</span>
                </button>
            </header>

            {/* Message Stream */}
            <div className="flex-1 overflow-y-auto px-5 py-4 no-scrollbar chat-bg-pattern">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                        <div className="size-24 rounded-3xl bg-white/80 backdrop-blur-sm shadow-lg flex items-center justify-center mb-5">
                            <span aria-hidden="true" className="material-symbols-outlined text-5xl text-indigo-300">waving_hand</span>
                        </div>
                        <h4 className="text-base font-black text-slate-600 mb-1">{t('chat.start_title')}</h4>
                        <p className="text-sm text-slate-400 max-w-xs">{t('chat.start_desc')}</p>
                        <div className="flex gap-2 mt-4">
                            {QUICK_REPLIES.slice(0, 3).map(qr => (
                                <button key={qr.label} onClick={() => handleSend(`${qr.emoji} ${t(qr.label)}`)} className="px-3 py-1.5 bg-white/90 rounded-full text-xs font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 shadow-sm transition active:scale-95">
                                    {qr.emoji} {t(qr.label)}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    messagesByDate.map((group, gi) => (
                        <React.Fragment key={gi}>
                            <div className="flex justify-center my-4">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-white/80 backdrop-blur-sm px-4 py-1.5 rounded-full shadow-sm">{group.label}</span>
                            </div>
                            {group.messages.map((m, idx) => {
                                const isMe = m.sender_id === appUserId;
                                const senderName = getSenderName(m.sender_id);
                                const showSender = !isMe && selectedChat.isGroup;
                                const msgId = m.id || String(idx);
                                const msgReactions = reactions[msgId] || [];
                                return (
                                    <div key={msgId} className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-3 msg-enter msg-wrapper group`}
                                        style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
                                        onMouseEnter={() => setHoveredMsg(msgId)} onMouseLeave={() => setHoveredMsg(null)}>
                                        {!isMe && (
                                            <div className={`size-8 rounded-full bg-gradient-to-br ${getAvatarColor(senderName)} flex items-center justify-center text-white text-[10px] font-bold mr-2 mt-auto mb-5 shrink-0 shadow-sm`}>
                                                {senderName.substring(0, 1)}
                                            </div>
                                        )}
                                        <div className={`max-w-[70%] relative ${isMe ? 'items-end' : 'items-start'}`}>
                                            {showSender && <p className="text-[10px] font-bold text-indigo-500 mb-0.5 px-3">{senderName}</p>}
                                            <div className={`relative px-4 py-2.5 rounded-2xl text-sm font-medium leading-relaxed transition-shadow ${isMe ? 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white rounded-br-sm shadow-lg shadow-indigo-500/15 msg-tail-sent' : 'bg-white text-slate-700 rounded-bl-sm shadow-md shadow-slate-200/50 msg-tail-received'}`}>
                                                {(m as MessageWithMetadata).metadata?.replyTo && (
                                                    <div className={`reply-quote ${isMe ? 'reply-quote-sent' : ''} mb-1.5 text-xs`}>
                                                        <p className={`font-bold ${isMe ? 'text-white/70' : 'text-indigo-500'} text-[10px]`}>{t('chat.reply')}</p>
                                                        <p className={`${isMe ? 'text-white/60' : 'text-slate-400'} truncate`}>{(m as MessageWithMetadata).metadata!.replyTo}</p>
                                                    </div>
                                                )}
                                                {m.attachment_path && <ChatAttachmentView message={m} isMe={isMe} />}
                                                {m.content.trim() !== '' && <p className={`break-words ${m.attachment_path ? 'mt-1.5' : ''}`}>{m.content}</p>}
                                            </div>
                                            {msgReactions.length > 0 && (
                                                <div className={`flex gap-0.5 mt-0.5 ${isMe ? 'justify-end' : 'justify-start'} px-1`}>
                                                    {msgReactions.map((emoji, ri) => <span key={ri} className="reaction-badge" onClick={() => toggleReaction(msgId, emoji)}>{emoji} 1</span>)}
                                                </div>
                                            )}
                                            <div className={`flex items-center gap-1 mt-0.5 px-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                <span className="text-[9px] font-medium text-slate-400">{formatTime(m.created_at)}</span>
                                                {isMe && m.delivery === 'pending' && (
                                                    <span aria-hidden="true" className="material-symbols-outlined text-[12px] text-slate-400" title={t('chat.waiting_signal')} aria-label={t('chat.waiting_send')}>schedule</span>
                                                )}
                                                {isMe && m.delivery === 'failed' && (
                                                    <span role="alert" className="flex items-center gap-1 text-[10px] font-bold text-red-600" title={m.failure_reason}>
                                                        {t('chat.not_sent')}
                                                        {onRetry && (
                                                            <button type="button" onClick={() => onRetry(m.id)} className="underline">{t('common.retry')}</button>
                                                        )}
                                                    </span>
                                                )}
                                                {isMe && !m.delivery && <span aria-hidden="true" className="material-symbols-outlined text-[12px] text-blue-400">done_all</span>}
                                            </div>
                                            {hoveredMsg === msgId && (
                                                <div className={`absolute top-0 ${isMe ? '-left-24' : '-right-24'} flex gap-0.5 msg-enter`}>
                                                    <button aria-label={t('chat.reply')} onClick={() => setReplyTo(m)} className="size-7 rounded-full bg-white shadow-md flex items-center justify-center text-slate-400 hover:text-indigo-500 transition" title={t('chat.reply')}>
                                                        <span aria-hidden="true" className="material-symbols-outlined text-[14px]">reply</span>
                                                    </button>
                                                    <button className="size-7 rounded-full bg-white shadow-md flex items-center justify-center text-slate-400 hover:text-amber-500 transition relative group/react" title={t('chat.react')}>
                                                        <span aria-hidden="true" className="material-symbols-outlined text-[14px]">add_reaction</span>
                                                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 reaction-bar hidden group-hover/react:flex">
                                                            {REACTION_EMOJIS.map(emoji => <button key={emoji} className="reaction-btn" onClick={() => toggleReaction(msgId, emoji)}>{emoji}</button>)}
                                                        </div>
                                                    </button>
                                                    <button className="size-7 rounded-full bg-white shadow-md flex items-center justify-center text-slate-400 hover:text-slate-600 transition" aria-label={t('nav.more')} title={t('nav.more')}>
                                                        <span aria-hidden="true" className="material-symbols-outlined text-[14px]">more_horiz</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </React.Fragment>
                    ))
                )}
                {isTyping && (
                    <div className="flex justify-start mb-2 msg-enter">
                        <div className="size-8 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center text-white text-[10px] font-bold mr-2 mt-auto mb-1 shrink-0 shadow-sm">
                            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">person</span>
                        </div>
                        <div className="bg-white px-5 py-3 rounded-2xl rounded-bl-sm shadow-md flex items-center gap-1.5">
                            <span className="typing-dot"></span><span className="typing-dot"></span><span className="typing-dot"></span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div >

            {/* Quick replies bar */}
            {
                showQuickReplies && (
                    <div className="px-5 py-2 bg-white border-t border-slate-100 flex gap-1.5 overflow-x-auto no-scrollbar">
                        {QUICK_REPLIES.map(qr => (
                            <button key={qr.label} onClick={() => handleSend(`${qr.emoji} ${t(qr.label)}`)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-full text-xs font-bold text-slate-600 hover:text-indigo-600 transition whitespace-nowrap active:scale-95">
                                <span>{qr.emoji}</span>{t(qr.label)}
                            </button>
                        ))}
                    </div>
                )
            }

            {/* Compose Bar */}
            <footer className="bg-white border-t border-slate-100">
                {(attachError || voiceErrorText) && (
                    <div role="alert" className="mx-3 mt-2 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                        <span className="flex-1">{attachError || voiceErrorText}</span>
                        <button type="button" aria-label={t('common.close')} onClick={() => { setAttachError(null); voice.clearError(); }} className="text-red-700">
                            <span aria-hidden="true" className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>
                )}
                <input ref={fileInputRef} type="file" accept={ACCEPT} className="hidden" onChange={e => void handleFilePicked(e)} data-testid="chat-file-input" />
                {replyTo && (
                    <div className="px-4 pt-2.5 pb-1 flex items-center gap-2 animate-[msgSlideIn_0.2s_ease]">
                        <div className="flex-1 reply-quote">
                            <p className="text-[10px] font-bold text-indigo-500">{getSenderName(replyTo.sender_id)}</p>
                            <p className="text-xs text-slate-400 truncate">{replyTo.content}</p>
                        </div>
                        <button aria-label={t('chat.cancel_reply')} onClick={() => setReplyTo(null)} className="size-6 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 transition">
                            <span aria-hidden="true" className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>
                )}
                <div className="flex items-center gap-1.5 p-2.5">
                    <button aria-label={t('chat.quick_replies')} aria-expanded={showQuickReplies} onClick={() => setShowQuickReplies(!showQuickReplies)}
                        className={`size-9 rounded-full flex items-center justify-center transition shrink-0 ${showQuickReplies ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>
                        <span aria-hidden="true" className="material-symbols-outlined text-[20px]">emoji_emotions</span>
                    </button>
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isPreparing || isRecording || !onSendAttachment}
                        className="size-9 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-50 flex items-center justify-center transition shrink-0 disabled:opacity-40" aria-label={t('chat.attach')} title={t('chat.attach')}>
                        <span aria-hidden="true" className="material-symbols-outlined text-[20px]">{isPreparing ? 'hourglass_empty' : 'attach_file'}</span>
                    </button>
                    {isRecording ? (
                        <div role="status" className="flex-1 flex items-center gap-2 bg-red-50 border border-red-100 rounded-3xl px-4 py-2.5">
                            <span aria-hidden="true" className="size-2.5 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-sm font-bold text-red-700 tabular-nums">
                                {t('chat.recording', { time: formatDuration(voice.elapsedMs), max: formatDuration(MAX_VOICE_MS) })}
                            </span>
                            <button type="button" onClick={voice.cancel} aria-label={t('chat.cancel_recording')} className="ml-auto size-8 rounded-full text-red-600 hover:bg-red-100 flex items-center justify-center">
                                <span aria-hidden="true" className="material-symbols-outlined text-lg">delete</span>
                            </button>
                        </div>
                    ) : (
                    <div className="flex-1 flex items-center bg-slate-50/80 border border-slate-100 rounded-3xl px-4 py-0.5 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-50 transition">
                        <input ref={inputRef} type="text" value={newMessage}
                            onChange={(e) => {
                                setNewMessage(e.target.value);
                                if (e.target.value.length > 0 && !isTyping) {
                                    setIsTyping(true);
                                    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                                    typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
                                }
                                if (e.target.value.length === 0) setIsTyping(false);
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                            placeholder={replyTo ? t('chat.type_reply') : t('chat.type_message')}
                            className="flex-1 bg-transparent py-2.5 text-sm focus:outline-none placeholder:text-slate-300 font-medium text-slate-800" />
                    </div>
                    )}
                    {isRecording ? (
                        <button type="button" aria-label={t('chat.send_voice')} onClick={() => void finishVoice()}
                            className="size-10 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-lg flex items-center justify-center transition active:scale-90 shrink-0"
                            onPointerUp={() => {
                                // Grabación de "mantener pulsado": al soltar se envía
                                if (pressStartRef.current !== null && Date.now() - pressStartRef.current >= HOLD_TO_RECORD_MS) {
                                    pressStartRef.current = null;
                                    void finishVoice();
                                }
                                pressStartRef.current = null;
                            }}>
                            <span aria-hidden="true" className="material-symbols-outlined filled text-lg">send</span>
                        </button>
                    ) : newMessage.trim() ? (
                        <button aria-label={isSending ? t('chat.sending') : t('chat.send')} onClick={() => handleSend()} disabled={isSending}
                            className="size-10 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-lg shadow-indigo-500/20 flex items-center justify-center transition active:scale-90 disabled:opacity-40 shrink-0">
                            <span aria-hidden="true" className="material-symbols-outlined filled text-lg">{isSending ? 'hourglass_empty' : 'send'}</span>
                        </button>
                    ) : (
                        <button type="button" aria-label={t('chat.record_voice')} title={t('chat.record_hint')} disabled={!onSendAttachment}
                            onPointerDown={() => {
                                // Pulsar = empezar; si se mantiene pulsado, al soltar se envía
                                pressStartRef.current = Date.now();
                                startVoice();
                            }}
                            onClick={e => {
                                // Teclado (Enter / Espacio): sin pointerdown, pulsar para grabar
                                if (e.detail === 0 && !isRecording) startVoice();
                            }}
                            className="size-10 rounded-full flex items-center justify-center transition active:scale-90 shrink-0 bg-slate-50 text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-40 touch-none">
                            <span aria-hidden="true" className="material-symbols-outlined text-lg">mic</span>
                        </button>
                    )}
                </div>
            </footer>
        </>
    );
};

export default ChatWindow;
