/**
 * Messaging Types — Extracted from MessagingContext
 * 
 * Shared types used across messaging components, context, and tests.
 * 
 * @module context/messaging.types
 */
import { Broadcast, Role, MessagePriority } from '../types';

// =============================================
// DATA TYPES
// =============================================
export interface DBMessage {
    id: string;
    sender_id: string;
    recipient_id?: string;
    group_id?: string;
    conversation_id?: string;
    content: string;
    priority: MessagePriority;
    read_by: string[];
    created_at: string;
    orchard_id?: string;
}

export interface ChatGroup {
    id: string;
    name: string;
    members: string[];
    isGroup?: boolean;
    lastMsg?: string;
    time?: string;
    unreadCount?: number;
}

export interface MessagingState {
    messages: DBMessage[];
    broadcasts: Broadcast[];
    chatGroups: ChatGroup[];
    unreadCount: number;
}

// =============================================
// CONTEXT API TYPE
// =============================================
/**
 * MessagingContext public API
 * Provides real-time messaging with offline support and broadcast capabilities
 * 
 * @example
 * ```tsx
 * const { sendMessage, broadcasts, unreadCount } = useMessaging();
 * await sendMessage(conversationId, 'Hello!', 'normal');
 * ```
 */
export interface MessagingContextType extends MessagingState {
    /** Send message to a conversation (with offline queue fallback) */
    sendMessage: (
        conversationId: string,
        content: string,
        priority?: MessagePriority
    ) => Promise<DBMessage | null>;
    /** Broadcast message to team (triggers notifications) */
    sendBroadcast: (
        title: string,
        content: string,
        priority?: MessagePriority,
        targetRoles?: Role[]
    ) => Promise<boolean>;
    /** Get existing or create new 1:1 conversation */
    getOrCreateConversation: (recipientId: string) => Promise<string | null>;
    /** Mark message as read (updates unread count) */
    markMessageRead: (messageId: string) => Promise<void>;
    /** Acknowledge broadcast as read */
    acknowledgeBroadcast: (broadcastId: string) => Promise<void>;
    /** Create a group chat with multiple members */
    createChatGroup: (name: string, memberIds: string[]) => Promise<ChatGroup | null>;
    /** Load all chat groups for current user */
    loadChatGroups: () => Promise<void>;
    /** Load all messages in a conversation */
    loadConversation: (conversationId: string) => Promise<DBMessage[]>;
    /** Refresh broadcasts and conversations from server */
    refreshMessages: () => Promise<void>;
    /** Set active orchard ID for filtering */
    setOrchardId: (id: string) => void;
    /** Set current user ID for messaging context */
    setUserId: (id: string) => void;
}
