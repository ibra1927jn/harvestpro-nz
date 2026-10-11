/**
 * SIMPLE CHAT COMPONENT
 * Sistema de mensajería simple estilo WhatsApp
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { simpleMessagingService, Conversation, ChatMessage } from '../services/simple-messaging.service';
import { nowNZST } from '@/utils/nzst';
import NewChatModal from './NewChatModal';

export interface SimpleChatProps {
    userId: string;
    userName: string;
    channelType?: 'team' | 'direct';
    recipientId?: string;
}

export const SimpleChat = ({ userId, userName, channelType, recipientId }: SimpleChatProps) => {
    // State
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [showNewChat, setShowNewChat] = useState(false);
    const [users, setUsers] = useState<Array<{ id: string; name: string; role: string }>>([]);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const unsubscribeRef = useRef<(() => void) | null>(null);

    // Helper functions (declared before use in effects)
    const loadConversations = useCallback(async () => {
        setLoading(true);
        const convs = await simpleMessagingService.getConversations(userId);
        setConversations(convs);
        setLoading(false);
    }, [userId]);

    const loadUsers = useCallback(async () => {
        const allUsers = await simpleMessagingService.getUsers();
        setUsers(allUsers.filter(u => u.id !== userId));
    }, [userId]);

    // Load conversations on mount
    useEffect(() => {
        const init = async () => {
            await loadConversations();
            await loadUsers();

            // Deep linking logic
            if (channelType && recipientId && userId) {
                // Determine if we need to find an existing chat or create one
                // ... logic to find or create conversation ...
                // For now, let's just try to find a direct chat if recipientId is provided
                if (channelType === 'direct') {
                    // This logic would need to be robust, for now we rely on user clicking "New Chat" if not found
                    // Or we could trigger handleCreateConversation if needed.
                }
            }
        };
        init();
    }, [userId, channelType, recipientId, loadConversations, loadUsers]);

    // Load messages when conversation changes
    useEffect(() => {
        const conversationId = activeConversation?.id;
        if (conversationId) {
            loadMessages(conversationId);
            subscribeToConversation(conversationId);
        }

        return () => {
            if (unsubscribeRef.current) {
                unsubscribeRef.current();
                unsubscribeRef.current = null;
            }
        };
    }, [activeConversation?.id]);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);


    const loadMessages = async (conversationId: string) => {
        const msgs = await simpleMessagingService.getMessages(conversationId);
        setMessages(msgs);
    };

    const subscribeToConversation = (conversationId: string) => {
        if (unsubscribeRef.current) {
            unsubscribeRef.current();
        }

        unsubscribeRef.current = simpleMessagingService.subscribeToConversation(
            conversationId,
            (newMsg) => {
                setMessages(prev => {
                    // Avoid duplicates
                    if (prev.some(m => m.id === newMsg.id)) return prev;
                    return [...prev, newMsg];
                });
            }
        );
    };

    const handleSend = async () => {
        if (!newMessage.trim() || !activeConversation) return;

        const content = newMessage.trim();
        setNewMessage('');

        // Optimistic update
        const tempMessage: ChatMessage = {
            id: 'temp-' + Date.now(),
            conversation_id: activeConversation.id,
            sender_id: userId,
            content,
            created_at: nowNZST(),
            sender_name: userName,
        };
        setMessages(prev => [...prev, tempMessage]);

        // Send to server
        const sent = await simpleMessagingService.sendMessage(activeConversation.id, userId, content);

        if (sent) {
            // Replace temp message with real one
            setMessages(prev => prev.map(m =>
                m.id === tempMessage.id ? { ...sent, sender_name: userName } : m
            ));
        }
    };

    const handleCreateConversation = async (type: 'direct' | 'group', participantIds: string[], name?: string) => {
        const allParticipants = [...new Set([userId, ...participantIds])];
        const conv = await simpleMessagingService.createConversation(type, allParticipants, userId, name);

        if (conv) {
            await loadConversations();
            setActiveConversation(conv);
            setShowNewChat(false);
        }
    };

    const getConversationName = (conv: Conversation): string => {
        if (conv.type === 'group') return conv.name || 'Group';

        // For direct chats, show the other person's name
        const otherUserId = conv.participant_ids.find(id => id !== userId);
        const otherUser = users.find(u => u.id === otherUserId);
        return otherUser?.name || 'Chat';
    };

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleTimeString('en-NZ', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit' });
    };

    // =============================================
    // RENDER
    // =============================================

    return (
        <div className="flex h-full bg-background-light rounded-2xl overflow-hidden border border-border-light">
            {/* Sidebar - Conversation List */}
            <div className={`
                md:w-80 w-full border-r border-border-light flex-col
                ${activeConversation ? 'hidden md:flex' : 'flex'}
            `}>
                {/* Header */}
                <div className="p-4 border-b border-border-light flex items-center justify-between">
                    <h2 className="text-lg font-bold text-text-main">Chats</h2>
                    <button
                        onClick={() => setShowNewChat(true)}
                        className="size-10 bg-primary rounded-full flex items-center justify-center hover:bg-primary/80 transition"
                    >
                        <span className="material-symbols-outlined text-white">add</span>
                    </button>
                </div>

                {/* Conversation List */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="p-4 text-center text-text-muted">Loading...</div>
                    ) : conversations.length === 0 ? (
                        <div className="p-4 text-center text-text-muted">
                            No conversations yet
                            <button
                                onClick={() => setShowNewChat(true)}
                                className="block mx-auto mt-2 text-primary hover:underline"
                            >
                                Start a new chat
                            </button>
                        </div>
                    ) : (
                        conversations.map(conv => (
                            <div
                                key={conv.id}
                                onClick={() => setActiveConversation(conv)}
                                className={`p-4 border-b border-slate-100 cursor-pointer transition hover:bg-slate-50 ${activeConversation?.id === conv.id ? 'bg-slate-50 border-l-2 border-l-primary' : ''
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="size-12 rounded-full bg-primary/20 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-primary">
                                            {conv.type === 'group' ? 'group' : 'person'}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-text-main truncate">{getConversationName(conv)}</p>
                                        <p className="text-xs text-text-muted">
                                            {conv.participant_ids.length} participants
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Main Chat Area */}
            <div className={`
                flex-1 flex-col
                ${activeConversation ? 'flex' : 'hidden md:flex'}
            `}>
                {activeConversation ? (
                    <>
                        {/* Chat Header */}
                        <div className="p-4 border-b border-border-light flex items-center gap-3">
                            <button
                                onClick={() => setActiveConversation(null)}
                                className="md:hidden size-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-text-muted"
                            >
                                <span className="material-symbols-outlined">arrow_back</span>
                            </button>
                            <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center">
                                <span className="material-symbols-outlined text-primary">
                                    {activeConversation.type === 'group' ? 'group' : 'person'}
                                </span>
                            </div>
                            <div>
                                <p className="font-bold text-text-main">{getConversationName(activeConversation)}</p>
                                <p className="text-xs text-text-muted">
                                    {activeConversation.participant_ids.length} members
                                </p>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {messages.map(msg => (
                                <div
                                    key={msg.id}
                                    className={`flex ${msg.sender_id === userId ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div
                                        className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2 ${msg.sender_id === userId
                                            ? 'bg-primary text-white rounded-br-sm'
                                            : 'bg-slate-100 text-text-main rounded-bl-sm'
                                            }`}
                                    >
                                        {msg.sender_id !== userId && (
                                            <p className="text-xs font-bold text-primary mb-1">{msg.sender_name}</p>
                                        )}
                                        <p>{msg.content}</p>
                                        <p className="text-xs opacity-60 mt-1">{formatTime(msg.created_at)}</p>
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div className="p-4 border-t border-border-light">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                    placeholder="Type a message..."
                                    className="flex-1 bg-slate-100 border border-border-light rounded-full px-4 py-3 text-text-main focus:border-primary outline-none"
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!newMessage.trim()}
                                    className="size-12 bg-primary rounded-full flex items-center justify-center hover:bg-primary/80 transition disabled:opacity-50"
                                >
                                    <span className="material-symbols-outlined text-white">send</span>
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-text-muted">
                        <div className="text-center">
                            <span className="material-symbols-outlined text-6xl mb-4">chat</span>
                            <p>Select a conversation or start a new chat</p>
                        </div>
                    </div>
                )}
            </div>

            {/* New Chat Modal */}
            {showNewChat && (
                <NewChatModal
                    users={users}
                    onClose={() => setShowNewChat(false)}
                    onCreate={handleCreateConversation}
                />
            )}
        </div>
    );
};

export default SimpleChat;
