/**
 * ChatWindow — Message stream, compose bar, and chat header
 */
import React, { useState, useRef, useCallback, useMemo } from 'react';
import { ChatGroup, DBMessage } from '../../../context/MessagingContext';
import { QUICK_REPLIES, REACTION_EMOJIS, getAvatarColor, formatTime, getDateLabel } from './messagingHelpers';

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
    /** Reintentar un mensaje propio que no se envió */
    onRetry?: (messageId: string) => void;
    onBack: () => void;
}

const ChatWindow: React.FC<Props> = ({
    selectedChat, messages, appUserId, userNameMap, isSending, onSend, onRetry, onBack,
}) => {
    const [newMessage, setNewMessage] = useState('');
    const [showQuickReplies, setShowQuickReplies] = useState(false);
    const [replyTo, setReplyTo] = useState<DBMessage | null>(null);
    const [hoveredMsg, setHoveredMsg] = useState<string | null>(null);
    const [reactions, setReactions] = useState<Record<string, string[]>>({});
    const [isRecording, setIsRecording] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
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

    const getSenderName = (senderId: string) => senderId === appUserId ? 'You' : (userNameMap[senderId] || 'Unknown');

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
            const label = getDateLabel(m.created_at);
            if (label !== currentLabel) { currentLabel = label; groups.push({ label, messages: [m] }); }
            else { groups[groups.length - 1].messages.push(m); }
        });
        return groups;
    }, [messages]);

    // Auto-scroll on new messages
    React.useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    return (
        <>
            {/* Chat Header */}
            <header className="h-16 flex items-center justify-between px-5 glass-chat-header sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="md:hidden size-9 rounded-lg text-slate-400 hover:bg-slate-50 flex items-center justify-center">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <div className="relative">
                        <div className={`size-10 rounded-full bg-gradient-to-br ${getAvatarColor(selectedChat.name)} flex items-center justify-center font-bold text-white text-sm shadow-sm`}>
                            {selectedChat.isGroup ? <span className="material-symbols-outlined text-base">groups</span> : selectedChat.name.split(' ').map(w => w[0]).join('').substring(0, 1).toUpperCase()}
                        </div>
                        {!selectedChat.isGroup && <div className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-400 border-2 border-white online-dot"></div>}
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-800">{selectedChat.name}</h3>
                        <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                            {selectedChat.isGroup ? `${selectedChat.members.length} members` : <><span className="inline-block size-1.5 rounded-full bg-emerald-400 mr-1"></span>Online</>}
                        </p>
                    </div>
                </div>
                <button className="size-9 rounded-xl hover:bg-slate-50 text-slate-400 flex items-center justify-center transition" title="Chat info">
                    <span className="material-symbols-outlined text-xl">more_vert</span>
                </button>
            </header>

            {/* Message Stream */}
            <div className="flex-1 overflow-y-auto px-5 py-4 no-scrollbar chat-bg-pattern">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                        <div className="size-24 rounded-3xl bg-white/80 backdrop-blur-sm shadow-lg flex items-center justify-center mb-5 animate-[breathe_3s_ease-in-out_infinite]">
                            <span className="material-symbols-outlined text-5xl text-indigo-300">waving_hand</span>
                        </div>
                        <h4 className="text-base font-black text-slate-600 mb-1">Start the conversation</h4>
                        <p className="text-sm text-slate-400 max-w-xs">Send a message, use a quick reply, or record a voice note</p>
                        <div className="flex gap-2 mt-4">
                            {QUICK_REPLIES.slice(0, 3).map(qr => (
                                <button key={qr.label} onClick={() => handleSend(`${qr.emoji} ${qr.label}`)} className="px-3 py-1.5 bg-white/90 rounded-full text-xs font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 shadow-sm transition active:scale-95">
                                    {qr.emoji} {qr.label}
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
                                                        <p className={`font-bold ${isMe ? 'text-white/70' : 'text-indigo-500'} text-[10px]`}>Reply</p>
                                                        <p className={`${isMe ? 'text-white/60' : 'text-slate-400'} truncate`}>{(m as MessageWithMetadata).metadata!.replyTo}</p>
                                                    </div>
                                                )}
                                                <p className="break-words">{m.content}</p>
                                            </div>
                                            {msgReactions.length > 0 && (
                                                <div className={`flex gap-0.5 mt-0.5 ${isMe ? 'justify-end' : 'justify-start'} px-1`}>
                                                    {msgReactions.map((emoji, ri) => <span key={ri} className="reaction-badge" onClick={() => toggleReaction(msgId, emoji)}>{emoji} 1</span>)}
                                                </div>
                                            )}
                                            <div className={`flex items-center gap-1 mt-0.5 px-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                <span className="text-[9px] font-medium text-slate-400">{formatTime(m.created_at)}</span>
                                                {isMe && m.delivery === 'pending' && (
                                                    <span className="material-symbols-outlined text-[12px] text-slate-400" title="Waiting for signal — will send automatically" aria-label="Waiting to send">schedule</span>
                                                )}
                                                {isMe && m.delivery === 'failed' && (
                                                    <span role="alert" className="flex items-center gap-1 text-[10px] font-bold text-red-600" title={m.failure_reason}>
                                                        Not sent
                                                        {onRetry && (
                                                            <button type="button" onClick={() => onRetry(m.id)} className="underline">Retry</button>
                                                        )}
                                                    </span>
                                                )}
                                                {isMe && !m.delivery && <span className="material-symbols-outlined text-[12px] text-blue-400">done_all</span>}
                                            </div>
                                            {hoveredMsg === msgId && (
                                                <div className={`absolute top-0 ${isMe ? '-left-24' : '-right-24'} flex gap-0.5 msg-enter`}>
                                                    <button onClick={() => setReplyTo(m)} className="size-7 rounded-full bg-white shadow-md flex items-center justify-center text-slate-400 hover:text-indigo-500 transition" title="Reply">
                                                        <span className="material-symbols-outlined text-[14px]">reply</span>
                                                    </button>
                                                    <button className="size-7 rounded-full bg-white shadow-md flex items-center justify-center text-slate-400 hover:text-amber-500 transition relative group/react" title="React">
                                                        <span className="material-symbols-outlined text-[14px]">add_reaction</span>
                                                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 reaction-bar hidden group-hover/react:flex">
                                                            {REACTION_EMOJIS.map(emoji => <button key={emoji} className="reaction-btn" onClick={() => toggleReaction(msgId, emoji)}>{emoji}</button>)}
                                                        </div>
                                                    </button>
                                                    <button className="size-7 rounded-full bg-white shadow-md flex items-center justify-center text-slate-400 hover:text-slate-600 transition" title="More">
                                                        <span className="material-symbols-outlined text-[14px]">more_horiz</span>
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
                            <span className="material-symbols-outlined text-[14px]">person</span>
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
                            <button key={qr.label} onClick={() => handleSend(`${qr.emoji} ${qr.label}`)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-full text-xs font-bold text-slate-600 hover:text-indigo-600 transition whitespace-nowrap active:scale-95">
                                <span>{qr.emoji}</span>{qr.label}
                            </button>
                        ))}
                    </div>
                )
            }

            {/* Compose Bar */}
            <footer className="bg-white border-t border-slate-100">
                {replyTo && (
                    <div className="px-4 pt-2.5 pb-1 flex items-center gap-2 animate-[msgSlideIn_0.2s_ease]">
                        <div className="flex-1 reply-quote">
                            <p className="text-[10px] font-bold text-indigo-500">{getSenderName(replyTo.sender_id)}</p>
                            <p className="text-xs text-slate-400 truncate">{replyTo.content}</p>
                        </div>
                        <button onClick={() => setReplyTo(null)} className="size-6 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 transition">
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>
                )}
                <div className="flex items-center gap-1.5 p-2.5">
                    <button onClick={() => setShowQuickReplies(!showQuickReplies)}
                        className={`size-9 rounded-full flex items-center justify-center transition shrink-0 ${showQuickReplies ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>
                        <span className="material-symbols-outlined text-[20px]">emoji_emotions</span>
                    </button>
                    <button className="size-9 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-50 flex items-center justify-center transition shrink-0" title="Attach file">
                        <span className="material-symbols-outlined text-[20px]">attach_file</span>
                    </button>
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
                            placeholder={replyTo ? 'Type your reply...' : 'Type a message...'}
                            className="flex-1 bg-transparent py-2.5 text-sm focus:outline-none placeholder:text-slate-300 font-medium text-slate-800" />
                    </div>
                    {newMessage.trim() ? (
                        <button onClick={() => handleSend()} disabled={isSending}
                            className="size-10 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-lg shadow-indigo-500/20 flex items-center justify-center transition active:scale-90 disabled:opacity-40 shrink-0">
                            <span className="material-symbols-outlined filled text-lg">{isSending ? 'hourglass_empty' : 'send'}</span>
                        </button>
                    ) : (
                        <button onClick={() => setIsRecording(!isRecording)}
                            className={`size-10 rounded-full flex items-center justify-center transition active:scale-90 shrink-0 ${isRecording ? 'voice-recording text-white' : 'bg-slate-50 text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}>
                            <span className="material-symbols-outlined text-lg">{isRecording ? 'stop' : 'mic'}</span>
                        </button>
                    )}
                </div>
            </footer>
        </>
    );
};

export default ChatWindow;
