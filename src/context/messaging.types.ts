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
    /** Solo mensajes propios que aún no están en el servidor (bandeja de salida) */
    delivery?: 'pending' | 'failed';
    /** Motivo del rechazo cuando delivery = 'failed' */
    failure_reason?: string;
    /** Adjunto (columnas de chat_messages): ruta en el almacén chat-attachments */
    attachment_path?: string | null;
    attachment_type?: 'image' | 'pdf' | 'audio' | null;
    attachment_name?: string | null;
    attachment_size?: number | null;
    /** Duración de la nota de voz */
    duration_ms?: number | null;
    /** Adjunto que aún está en el móvil (pending_files): se enseña desde ahí */
    local_file_id?: string;
    /** Mensaje al que responde (misma conversación) */
    reply_to_id?: string | null;
}

export interface ChatGroup {
    id: string;
    name: string;
    members: string[];
    isGroup?: boolean;
    lastMsg?: string;
    /** El último mensaje es solo un adjunto (sin texto): la lista dice «Foto», «PDF»… */
    lastAttachmentType?: 'image' | 'pdf' | 'audio';
    time?: string;
    unreadCount?: number;
    /** Quién creó el grupo (puede renombrarlo y cambiar personas) */
    createdBy?: string | null;
    /** Silenciada por mí: sin notificación ni contador en la pestaña */
    muted?: boolean;
}

export interface MessagingState {
    messages: DBMessage[];
    broadcasts: Broadcast[];
    chatGroups: ChatGroup[];
    unreadCount: number;
}

/** Archivo que se va a enviar al chat (ya reducido si es una foto) */
export interface OutgoingAttachment {
    blob: Blob;
    type: 'image' | 'pdf' | 'audio';
    mime: string;
    ext: string;
    name?: string;
    durationMs?: number;
    /** Texto que acompaña al archivo (puede ir vacío) */
    caption?: string;
    /** Respuesta a este mensaje */
    replyToId?: string;
}

export interface SendAttachmentResult {
    message: DBMessage | null;
    error?: 'queue_full' | 'too_large' | 'failed';
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
        priority?: MessagePriority,
        options?: { replyToId?: string }
    ) => Promise<DBMessage | null>;
    /** Broadcast message to team (triggers notifications) */
    sendBroadcast: (
        title: string,
        content: string,
        priority?: MessagePriority,
        targetRoles?: Role[]
    ) => Promise<boolean>;
    /** Marcar una conversación como leída (se guarda y baja el contador) */
    markConversationRead: (conversationId: string) => Promise<void>;
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
    /** Load all messages in a conversation (incl. own messages not sent yet, marked) */
    loadConversation: (conversationId: string) => Promise<DBMessage[]>;
    /**
     * Enviar foto, PDF o nota de voz. Sin red se guarda (cifrado) en el móvil y
     * sale al volver la conexión. error: 'queue_full' si no cabe en la cola.
     */
    sendAttachment: (conversationId: string, file: OutgoingAttachment) => Promise<SendAttachmentResult>;
    /** Renombrar un grupo / añadir o quitar personas (creador, manager o admin) */
    updateConversation: (conversationId: string, changes: { name?: string; add?: string[]; remove?: string[] }) => Promise<boolean>;
    /** Silenciar o activar una conversación (solo para mí) */
    setConversationMuted: (conversationId: string, muted: boolean) => Promise<boolean>;
    /** Reintentar un mensaje propio que no se pudo enviar (mismo id: nunca duplica) */
    retryMessage: (messageId: string) => Promise<void>;
    /** Refresh broadcasts and conversations from server */
    refreshMessages: () => Promise<void>;
    /** Set active orchard ID for filtering */
    setOrchardId: (id: string) => void;
    /** Set current user ID for messaging context */
    setUserId: (id: string) => void;
}
