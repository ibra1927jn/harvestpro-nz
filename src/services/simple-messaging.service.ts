
import { logger } from '@/utils/logger';
import { messagingRepository, type ConversationHandlers, type ConversationSubscription } from '@/repositories/messaging.repository';
import { userRepository2 } from '@/repositories/user.repository';

export interface ChatMessage {
    id: string;
    conversation_id: string;
    sender_id: string;
    content: string;
    created_at: string;
    sender_name?: string;
    sender?: { full_name: string };
    attachment_path?: string | null;
    attachment_type?: 'image' | 'pdf' | 'audio' | null;
    attachment_name?: string | null;
    attachment_size?: number | null;
    duration_ms?: number | null;
    /** Mensaje al que responde (misma conversación) */
    reply_to_id?: string | null;
}

/** Roles con pantalla de chat (todos los de la app; los pickers no tienen cuenta con chat) */
export const CHAT_ROLES: ReadonlySet<string> = new Set([
    'admin', 'manager', 'team_leader', 'runner', 'qc_inspector', 'hr_admin', 'payroll_admin', 'logistics',
]);

export interface Conversation {
    id: string;
    type: 'direct' | 'group';
    name?: string;
    participant_ids: string[];
    last_message?: string;
    updated_at: string;
}

export const simpleMessagingService = {

    async sendMessage(conversationId: string, senderId: string, content: string) {
        return messagingRepository.sendMessage(conversationId, senderId, content);
    },

    async getMessages(conversationId: string) {
        const data = await messagingRepository.getMessages(conversationId);
        return (data || []).map((msg: unknown) => {
            const m = msg as Record<string, unknown>;
            return {
                id: String(m.id),
                conversation_id: String(m.conversation_id),
                sender_id: String(m.sender_id),
                content: String(m.content),
                created_at: String(m.created_at),
                sender_name: (m.sender as Record<string, unknown>)?.full_name as string || 'Unknown'
            } as ChatMessage;
        });
    },

    /** Canal de la conversación abierta: mensajes, reacciones y «Escribiendo…» */
    subscribeToConversation(
        conversationId: string,
        onMessage: (msg: ChatMessage) => void,
        handlers: ConversationHandlers = {},
    ): ConversationSubscription {
        return messagingRepository.subscribe(conversationId, (payload) => {
            onMessage(payload as ChatMessage);
        }, handlers);
    },

    async getConversations(userId: string): Promise<Conversation[]> {
        try {
            const data = await messagingRepository.getConversations(userId);
            return data as Conversation[];
        } catch (e) {
            logger.warn("Failed to fetch conversations", e);
            return [];
        }
    },

    /**
     * Personas con las que se puede chatear: cuentas activas con pantalla de
     * chat. Antes salían también las dadas de baja y roles sin chat.
     */
    async getUsers() {
        return (await this.getDirectory()).contacts;
    },

    /**
     * Una consulta: contactos (activos con chat) y nombres de todas las cuentas
     * (para que los mensajes de alguien dado de baja sigan con su nombre).
     */
    async getDirectory(): Promise<{
        contacts: Array<{ id: string; name: string; role: string }>;
        names: Record<string, string>;
    }> {
        const data = await userRepository2.getAll();
        const names: Record<string, string> = {};
        for (const u of data) names[u.id] = u.full_name || 'Unknown';
        const contacts = data
            .filter(u => u.is_active !== false && CHAT_ROLES.has(String(u.role ?? '')))
            .map(u => ({ id: u.id, name: u.full_name || 'Unknown', role: String(u.role) }));
        return { contacts, names };
    },

    async createConversation(type: 'direct' | 'group', participantIds: string[], createdBy: string, name?: string) {
        return messagingRepository.createConversation(type, participantIds, createdBy, name) as Promise<Conversation | null>;
    }
};
