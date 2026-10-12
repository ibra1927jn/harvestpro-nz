/**
 * Messaging Repository — chat_messages + conversations queries
 */
import { supabase } from '@/services/supabase';
import { nowNZST } from '@/utils/nzst';

export const messagingRepository = {
    /** Send a message */
    async sendMessage(conversationId: string, senderId: string, content: string) {
        const { data, error } = await supabase
            .from('chat_messages')
            .insert([{ conversation_id: conversationId, sender_id: senderId, content }])
            .select()
            .single();
        if (error) throw error;
        return data;
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

    /** Get conversation messages (plain, no join) */
    async getConversationMessages(conversationId: string) {
        const { data, error } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data || [];
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

    /** Get last messages for conversation IDs */
    async getLastMessages(conversationIds: string[]) {
        const { data } = await supabase
            .from('chat_messages')
            .select('conversation_id, content, created_at')
            .in('conversation_id', conversationIds)
            .order('created_at', { ascending: false });
        return data || [];
    },
};
