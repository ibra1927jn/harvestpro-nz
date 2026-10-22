/**
 * Messaging Repository — chat_messages + conversations queries
 */
import { supabase } from '@/services/supabase';
import { nowNZST } from '@/utils/nzst';

/** Mensajes que se cargan al abrir una conversación (los más recientes) */
export const CHAT_HISTORY_LIMIT = 300;

export const messagingRepository = {
    /** Send a message */
    async sendMessage(
        conversationId: string,
        senderId: string,
        content: string,
        opts?: { id?: string; createdAt?: string }
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

    /** Subscribe to new messages (realtime) */
    subscribe(conversationId: string, onMessage: (payload: unknown) => void) {
        const channel = supabase
            .channel(`chat:${conversationId}`)
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'chat_messages',
                filter: `conversation_id=eq.${conversationId}`
            }, (payload) => onMessage(payload.new))
            .subscribe();
        return () => { supabase.removeChannel(channel); };
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

    /** Get last messages for conversation IDs */
    /**
     * Último mensaje de cada conversación (una fila por conversación, RPC
     * last_messages). Antes bajaba TODOS los mensajes de todas las conversaciones
     * cada 15 s para quedarse con el primero de cada una.
     */
    async getLastMessages(conversationIds: string[]) {
        const { data, error } = await supabase.rpc('last_messages', { p_conversation_ids: conversationIds });
        if (error) return [];
        return (data || []) as Array<{ conversation_id: string; content: string; created_at: string }>;
    },
};
