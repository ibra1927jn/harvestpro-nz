/**
 * Reacciones del chat: con red se guardan al momento; sin red (o si la red
 * falla) van a la cola offline (tipo CHAT_REACTION) y salen solas al volver la
 * conexión. Poner y quitar la misma reacción sin red se anulan en la cola.
 */
import { messagingRepository, type ReactionRow } from '@/repositories/messaging.repository';
import { db } from './db';
import type { ChatReactionPayload } from './sync-processors/types';
import type { ReactionChange } from './chat-reactions.logic';

const isNetworkFailure = (error: unknown, online: boolean): boolean => {
    if (!online) return true;
    const msg = error instanceof Error ? error.message : (error as { message?: string } | null)?.message ?? '';
    return /failed to fetch|network|load failed|fetch failed|timeout/i.test(msg);
};

const sameReaction = (p: ChatReactionPayload, c: Omit<ChatReactionPayload, 'op'>) =>
    p.message_id === c.message_id && p.user_id === c.user_id && p.emoji === c.emoji;

export interface ToggleReactionInput {
    conversationId: string;
    messageId: string;
    userId: string;
    emoji: string;
    /** true = quitarla (la tengo puesta), false = ponerla */
    remove: boolean;
}

export const chatReactionsService = {
    /** Reacciones guardadas de estos mensajes */
    list(messageIds: string[]): Promise<ReactionRow[]> {
        return messagingRepository.getReactions(messageIds);
    },

    /** Cambios míos de esta conversación que siguen en la cola, en orden */
    async pendingFor(conversationId: string): Promise<ReactionChange[]> {
        const { syncService } = await import('./sync.service');
        const queue = await syncService.getQueue();
        return queue
            .filter(item => item.type === 'CHAT_REACTION')
            .map(item => item.payload as unknown as ChatReactionPayload)
            .filter(p => p.conversation_id === conversationId)
            .map(p => ({ op: p.op, message_id: p.message_id, user_id: p.user_id, emoji: p.emoji }));
    },

    /**
     * Poner o quitar una reacción mía. 'saved' = ya está en el servidor;
     * 'queued' = espera en la cola. Lanza si el servidor la rechaza.
     */
    async toggle(input: ToggleReactionInput): Promise<'saved' | 'queued'> {
        const payload: ChatReactionPayload = {
            op: input.remove ? 'remove' : 'add',
            conversation_id: input.conversationId,
            message_id: input.messageId,
            user_id: input.userId,
            emoji: input.emoji,
        };
        const online = typeof navigator === 'undefined' || navigator.onLine !== false;

        // Si ya hay un cambio de esta reacción en la cola (el contrario: si no,
        // no se podría volver a pulsar), se anulan los dos y no sale nada
        const queued = (await db.sync_queue.where('type').equals('CHAT_REACTION').toArray())
            .find(item => sameReaction(item.payload as unknown as ChatReactionPayload, payload));
        if (queued) {
            await db.sync_queue.delete(queued.id);
            return 'queued';
        }

        try {
            if (!online) throw new Error('Offline');
            if (payload.op === 'add') await messagingRepository.addReaction(payload.message_id, payload.emoji);
            else await messagingRepository.removeReaction(payload.message_id, payload.user_id, payload.emoji);
            return 'saved';
        } catch (e) {
            if (!isNetworkFailure(e, online)) throw e;
            const { syncService } = await import('./sync.service');
            await syncService.addToQueue('CHAT_REACTION', payload);
            return 'queued';
        }
    },
};
