/**
 * Messaging Repository — chat_messages + conversations queries
 */
import { supabase } from '@/services/supabase';
import { nowNZST } from '@/utils/nzst';
import type { ChatAttachment } from '@/services/chat-attachments.service';
import { fetchInChunks } from '@/utils/fetchInChunks';

/** Reacción guardada (chat_message_reactions) */
export interface ReactionRow {
    message_id: string;
    user_id: string;
    emoji: string;
    created_at?: string;
}

/** Aviso en vivo de una reacción (Broadcast desde la base, trigger chat_reaction_broadcast) */
export interface ReactionEvent extends ReactionRow {
    op: 'add' | 'remove';
}

/**
 * Suscripción al canal privado de una conversación («chat:<id>»): llamarla la
 * cierra; sendTyping avisa de que estoy escribiendo (no se guarda en la base).
 */
export type ConversationSubscription = (() => void) & {
    sendTyping: (userId: string) => void;
};

export interface ConversationHandlers {
    onReaction?: (event: ReactionEvent) => void;
    onTyping?: (userId: string) => void;
}

const isReactionEvent = (p: unknown): p is ReactionEvent => {
    const r = p as Partial<ReactionEvent> | null;
    return !!r && (r.op === 'add' || r.op === 'remove')
        && typeof r.message_id === 'string' && typeof r.user_id === 'string' && typeof r.emoji === 'string';
};

/** Persona de una conversación (panel de info del chat) */
export interface ChatParticipant {
    id: string;
    full_name: string | null;
    role: string | null;
    avatar_url: string | null;
    is_active: boolean | null;
}

/** Mensajes que se cargan al abrir una conversación (los más recientes) */
export const CHAT_HISTORY_LIMIT = 300;

export const messagingRepository = {
    /** Send a message */
    async sendMessage(
        conversationId: string,
        senderId: string,
        content: string,
        opts?: { id?: string; createdAt?: string; attachment?: ChatAttachment; replyToId?: string | null }
    ) {
        // id y hora del móvil: un reenvío no duplica y conserva cuándo se escribió
        const { data, error } = await supabase
            .from('chat_messages')
            .insert([{
                conversation_id: conversationId,
                sender_id: senderId,
                content,
                ...(opts?.id ? { id: opts.id } : {}),
                ...(opts?.createdAt ? { created_at: opts.createdAt } : {}),
                ...(opts?.replyToId ? { reply_to_id: opts.replyToId } : {}),
                ...(opts?.attachment ? {
                    attachment_path: opts.attachment.path,
                    attachment_type: opts.attachment.type,
                    attachment_name: opts.attachment.name ?? null,
                    attachment_size: opts.attachment.size,
                    duration_ms: opts.attachment.duration_ms ?? null,
                } : {}),
            }])
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    /** ¿Está ya en el servidor el mensaje con este id? (visible para quien lo envió) */
    async messageExists(id: string): Promise<boolean> {
        const { data, error } = await supabase
            .from('chat_messages')
            .select('id')
            .eq('id', id)
            .maybeSingle();
        if (error) throw error;
        return data !== null;
    },

    /** Get messages with sender join */
    async getMessages(conversationId: string) {
        const { data, error } = await supabase
            .from('chat_messages')
            .select(`*, sender:users(full_name)`)
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    /**
     * Mensajes de una conversación: los CHAT_HISTORY_LIMIT más recientes, en orden.
     * Antes se pedía todo en orden ascendente; PostgREST corta en 1000 filas, así
     * que un grupo de huerto con más de 1000 mensajes (unas 4 semanas de
     * temporada) dejaba de mostrar los nuevos (prueba de carga 2026-10-21).
     */
    async getConversationMessages(conversationId: string) {
        const { data, error } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(CHAT_HISTORY_LIMIT);
        if (error) throw error;
        return (data || []).reverse();
    },

    /**
     * Canal privado de la conversación («chat:<id>», RLS en realtime.messages:
     * solo participantes). Un solo canal por conversación abierta para todo:
     * mensajes nuevos (postgres_changes), reacciones (Broadcast desde la base)
     * y «Escribiendo…» (Broadcast entre móviles, nada se guarda).
     */
    subscribe(conversationId: string, onMessage: (payload: unknown) => void, handlers: ConversationHandlers = {}): ConversationSubscription {
        const channel = supabase
            .channel(`chat:${conversationId}`, { config: { private: true, broadcast: { self: false } } })
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'chat_messages',
                filter: `conversation_id=eq.${conversationId}`
            }, (payload) => onMessage(payload.new))
            .on('broadcast', { event: 'reaction' }, ({ payload }) => {
                if (isReactionEvent(payload)) handlers.onReaction?.(payload);
            })
            .on('broadcast', { event: 'typing' }, ({ payload }) => {
                const userId = (payload as { user_id?: unknown } | null)?.user_id;
                if (typeof userId === 'string') handlers.onTyping?.(userId);
            })
            .subscribe();
        const unsubscribe = (() => { supabase.removeChannel(channel); }) as ConversationSubscription;
        unsubscribe.sendTyping = (userId: string) => {
            // Sin red o sin canal: se pierde, es solo un aviso
            void Promise.resolve(channel.send({ type: 'broadcast', event: 'typing', payload: { user_id: userId } }))
                .catch(() => undefined);
        };
        return unsubscribe;
    },

    /** Reacciones de estos mensajes (en trozos: 300 ids en un .in() da 414) */
    async getReactions(messageIds: string[]): Promise<ReactionRow[]> {
        return fetchInChunks<ReactionRow>(messageIds, (chunk, from, to) =>
            supabase
                .from('chat_message_reactions')
                .select('message_id, user_id, emoji, created_at')
                .in('message_id', chunk)
                .order('message_id')
                .order('user_id')
                .order('emoji')
                .range(from, to)
        );
    },

    /** Poner una reacción mía. Repetirla no falla (reintento de la cola). */
    async addReaction(messageId: string, emoji: string): Promise<void> {
        const { error } = await supabase
            .from('chat_message_reactions')
            .upsert({ message_id: messageId, emoji }, { onConflict: 'message_id,user_id,emoji', ignoreDuplicates: true });
        if (error) throw error;
    },

    /** Quitar una reacción mía (si ya no está, no pasa nada) */
    async removeReaction(messageId: string, userId: string, emoji: string): Promise<void> {
        const { error } = await supabase
            .from('chat_message_reactions')
            .delete()
            .match({ message_id: messageId, user_id: userId, emoji });
        if (error) throw error;
    },

    /** Get conversations for a user */
    async getConversations(userId: string) {
        const { data, error } = await supabase
            .from('conversations')
            .select('*')
            .contains('participant_ids', [userId])
            .order('updated_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    /** Create conversation */
    async createConversation(type: 'direct' | 'group', participantIds: string[], createdBy: string, name?: string) {
        const { data, error } = await supabase
            .from('conversations')
            .insert([{ type, name, participant_ids: participantIds, created_by: createdBy }])
            .select()
            .single();
        if (error) return null;
        return data;
    },

    /** Update conversation timestamp */
    async updateConversationTimestamp(conversationId: string) {
        await supabase.from('conversations').update({ updated_at: nowNZST() }).eq('id', conversationId);
    },

    /** Insert broadcast */
    async insertBroadcast(broadcast: Record<string, unknown>) {
        // Antes se ignoraba el error y el aviso "se enviaba" sin guardarse
        const { error } = await supabase.from('broadcasts').insert([broadcast]);
        if (error) throw new Error(`Broadcast not saved: ${error.message}`);
    },

    /** Find direct conversation with two participants */
    async findDirectConversation(userId: string, participantId: string) {
        const { data } = await supabase
            .from('conversations')
            .select('id')
            .eq('type', 'direct')
            .contains('participant_ids', [userId, participantId])
            .order('updated_at', { ascending: false });
        return data || [];
    },

    /** Create group conversation (returns {data, error} for compat) */
    async createGroupConversation(name: string, participantIds: string[], createdBy: string) {
        const { data, error } = await supabase
            .from('conversations')
            .insert([{ type: 'group', name, participant_ids: participantIds, created_by: createdBy }])
            .select()
            .single();
        return { data, error };
    },

    /** Get broadcasts for an orchard */
    async getBroadcasts(orchardId: string) {
        const { data } = await supabase
            .from('broadcasts')
            .select('*')
            .eq('orchard_id', orchardId)
            .order('created_at', { ascending: false })
            .limit(20);
        return data || [];
    },

    /** Confirmar un aviso (se añade el usuario a acknowledged_by) */
    async acknowledgeBroadcast(broadcastId: string) {
        const { error } = await supabase.rpc('acknowledge_broadcast', { p_broadcast_id: broadcastId });
        if (error) throw error;
    },

    /** Marcar como leídos los mensajes de una conversación */
    async markConversationRead(conversationId: string) {
        const { error } = await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
        if (error) throw error;
    },

    /** Mensajes sin leer por conversación (solo las mías) */
    async getUnreadCounts(): Promise<Record<string, number>> {
        const { data, error } = await supabase.rpc('my_unread_counts');
        if (error) throw error;
        const out: Record<string, number> = {};
        for (const r of (data || []) as Array<{ conversation_id: string; unread: number }>) out[r.conversation_id] = r.unread;
        return out;
    },

    /** Personas de una conversación con su rol y foto (panel de info) */
    async getParticipants(ids: string[]): Promise<ChatParticipant[]> {
        if (ids.length === 0) return [];
        const { data, error } = await supabase
            .from('users')
            .select('id, full_name, role, avatar_url, is_active')
            .in('id', ids)
            .order('full_name');
        if (error) throw error;
        return (data || []) as ChatParticipant[];
    },

    /**
     * Grupo: renombrar y añadir / quitar personas (RPC update_conversation:
     * solo quien lo creó, un manager o un admin). undefined = no tocar.
     */
    async updateConversation(conversationId: string, changes: { name?: string; add?: string[]; remove?: string[] }) {
        const { data, error } = await supabase.rpc('update_conversation', {
            p_conversation_id: conversationId,
            p_name: changes.name ?? null,
            p_add: changes.add && changes.add.length ? changes.add : null,
            p_remove: changes.remove && changes.remove.length ? changes.remove : null,
        });
        if (error) throw error;
        return data as { id: string; name: string | null; type: string; participant_ids: string[]; created_by: string | null };
    },

    /** Silenciar / activar una conversación para mí */
    async setMuted(conversationId: string, muted: boolean): Promise<void> {
        const { error } = await supabase.rpc('set_conversation_muted', { p_conversation_id: conversationId, p_muted: muted });
        if (error) throw error;
    },

    /** Get last messages for conversation IDs */
    /**
     * Último mensaje de cada conversación (una fila por conversación, RPC
     * last_messages). Antes bajaba TODOS los mensajes de todas las conversaciones
     * cada 15 s para quedarse con el primero de cada una.
     */
    async getLastMessages(conversationIds: string[]) {
        const { data, error } = await supabase.rpc('last_messages', { p_conversation_ids: conversationIds });
        if (error) return [];
        return (data || []) as Array<{ conversation_id: string; content: string; created_at: string; attachment_type?: string | null }>;
    },
};
