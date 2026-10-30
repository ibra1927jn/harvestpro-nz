/**
 * useConversationLive — lo que llega en vivo a la conversación abierta, por su
 * único canal privado «chat:<id>» (no se abre ninguno más):
 * - mensajes nuevos de los demás (se pasan a onIncomingMessage)
 * - reacciones (Broadcast desde la base) y las mías, también sin red (cola)
 * - «Escribiendo…» (Broadcast entre móviles, como mucho uno cada 3 s; se apaga
 *   a los 5 s sin avisos o cuando llega el mensaje de esa persona)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DBMessage } from '@/context/messaging.types';
import { simpleMessagingService, type ChatMessage } from '@/services/simple-messaging.service';
import { chatReactionsService } from '@/services/chat-reactions.service';
import {
    applyReactionChange,
    hasReaction,
    summarizeReactions,
    withPendingChanges,
    type ReactionChange,
    type ReactionKey,
    type ReactionSummary,
} from '@/services/chat-reactions.logic';
import { createTypingSender, createTypingWatcher } from '@/services/chat-typing';
import { logger } from '@/utils/logger';

interface Params {
    conversationId: string | null;
    me: string;
    messages: DBMessage[];
    onIncomingMessage: (msg: ChatMessage) => void;
}

export interface ConversationLive {
    reactions: Record<string, ReactionSummary[]>;
    /** Poner o quitar mi reacción. false = no se pudo (ni guardar ni dejar en la cola). */
    toggleReaction: (messageId: string, emoji: string) => Promise<boolean>;
    /** Quién está escribiendo ahora (sin mí) */
    typingUserIds: string[];
    /** Cada cambio del texto que escribo */
    notifyTyping: (text: string) => void;
    /** Acabo de enviar: la próxima tecla vuelve a avisar */
    resetTyping: () => void;
}

export function useConversationLive({ conversationId, me, messages, onIncomingMessage }: Params): ConversationLive {
    const [rows, setRows] = useState<ReactionKey[]>([]);
    const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
    const rowsRef = useRef<ReactionKey[]>([]);
    const meRef = useRef(me);
    const convRef = useRef(conversationId);
    const onIncomingRef = useRef(onIncomingMessage);
    const senderRef = useRef<ReturnType<typeof createTypingSender> | null>(null);
    /** Mensajes cuyas reacciones ya se pidieron (o llegan por el canal) */
    const fetchedRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        rowsRef.current = rows;
    }, [rows]);
    useEffect(() => {
        meRef.current = me;
        onIncomingRef.current = onIncomingMessage;
    }, [me, onIncomingMessage]);

    // Canal de la conversación
    useEffect(() => {
        convRef.current = conversationId;
        fetchedRef.current = new Set();
        if (!conversationId) return;
        const watcher = createTypingWatcher(setTypingUserIds);
        const sub = simpleMessagingService.subscribeToConversation(
            conversationId,
            msg => {
                watcher.stop(msg.sender_id);
                onIncomingRef.current(msg);
            },
            {
                onReaction: ev => setRows(prev => applyReactionChange(prev, ev)),
                onTyping: userId => {
                    if (userId !== meRef.current) watcher.seen(userId);
                },
            }
        );
        senderRef.current = createTypingSender(() => sub.sendTyping(meRef.current));
        return () => {
            sub();
            watcher.clear();
            senderRef.current = null;
            setRows([]);
        };
    }, [conversationId]);

    // Reacciones guardadas + las mías que siguen en la cola de este móvil
    const load = useCallback(async (convId: string, ids: string[]) => {
        const [server, pending] = await Promise.all([
            chatReactionsService.list(ids),
            chatReactionsService.pendingFor(convId).catch((): ReactionChange[] => []),
        ]);
        if (convRef.current !== convId) return;
        const loaded = new Set(ids);
        setRows(prev => withPendingChanges(
            [...prev.filter(r => !loaded.has(r.message_id)), ...server],
            pending
        ));
    }, []);

    // Solo mensajes ya entregados de ESTA conversación (al cambiar de chat, la
    // lista anterior sigue un momento en pantalla)
    const deliveredIds = useMemo(
        () => messages.filter(m => !m.delivery && m.conversation_id === conversationId).map(m => m.id),
        [messages, conversationId]
    );

    useEffect(() => {
        if (!conversationId) return;
        const fresh = deliveredIds.filter(id => !fetchedRef.current.has(id));
        if (fresh.length === 0) return;
        const first = fetchedRef.current.size === 0;
        fresh.forEach(id => fetchedRef.current.add(id));
        // Lo que llega después (en vivo o enviado por mí) aún no tiene
        // reacciones: las que reciba llegan por el canal. Sin consultas extra.
        if (!first) return;
        load(conversationId, fresh).catch(e => logger.warn('[Chat] Reactions not loaded:', e));
    }, [conversationId, deliveredIds, load]);

    // Al volver la red: lo que pasó mientras el canal estaba cortado
    useEffect(() => {
        if (!conversationId) return;
        const onOnline = () => {
            const ids = [...fetchedRef.current];
            if (ids.length > 0) load(conversationId, ids).catch(e => logger.warn('[Chat] Reactions not reloaded:', e));
        };
        window.addEventListener('online', onOnline);
        return () => window.removeEventListener('online', onOnline);
    }, [conversationId, load]);

    const toggleReaction = useCallback(async (messageId: string, emoji: string): Promise<boolean> => {
        const convId = convRef.current;
        const userId = meRef.current;
        if (!convId || !userId) return false;
        const remove = hasReaction(rowsRef.current, messageId, userId, emoji);
        const change: ReactionChange = { op: remove ? 'remove' : 'add', message_id: messageId, user_id: userId, emoji };
        const next = applyReactionChange(rowsRef.current, change);
        rowsRef.current = next;
        setRows(next);
        try {
            await chatReactionsService.toggle({ conversationId: convId, messageId, userId, emoji, remove });
            return true;
        } catch (e) {
            logger.warn('[Chat] Reaction rejected:', e);
            setRows(prev => applyReactionChange(prev, { ...change, op: remove ? 'add' : 'remove' }));
            return false;
        }
    }, []);

    const notifyTyping = useCallback((text: string) => senderRef.current?.onInput(text), []);
    const resetTyping = useCallback(() => senderRef.current?.reset(), []);

    const reactions = useMemo(() => summarizeReactions(rows, me), [rows, me]);

    return { reactions, toggleReaction, typingUserIds, notifyTyping, resetTyping };
}
