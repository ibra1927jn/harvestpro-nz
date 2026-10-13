/**
 * Bandeja de salida de mensajes de chat.
 *
 * Un mensaje que no se pudo enviar (sin red o fallo) se guarda cifrado en el
 * móvil y se envía en cuanto vuelve la conexión. Cada mensaje lleva su id
 * desde el principio: si un envío se corta y se repite, no se duplica.
 */
import { db, type QueuedMessage } from './db';
import { encryptRecord, decryptRecord } from './dbCrypto';
import { messagingRepository } from '@/repositories/messaging.repository';
import { logger } from '@/utils/logger';

const isNetworkError = (e: unknown) => {
    const msg = (e as { message?: string })?.message ?? String(e);
    return /fetch|network|offline|timeout/i.test(msg);
};

let flushing = false;

/** Mensaje propio que aún no llegó: 'pending' (se reintenta solo) o 'failed' (rechazado) */
export type OutboxStatus = 'pending' | 'failed';
export interface OutboxMessage extends QueuedMessage {
    status: OutboxStatus;
}

// Avisos a la pantalla de chat cuando cambia la bandeja (enviado, fallido, reintento)
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => {
    try { fn(); } catch (e) { logger.warn('[Outbox] listener failed', e); }
});

export const messageOutbox = {
    async queue(msg: Omit<QueuedMessage, 'synced'>): Promise<void> {
        const record = { ...msg, synced: 0 };
        try {
            await db.message_queue.put(await encryptRecord('message_queue', record));
        } catch (e) {
            logger.error('[Outbox] Encryption failed, storing unencrypted:', e);
            await db.message_queue.put(record as QueuedMessage);
        }
        notify();
    },

    /** Suscribirse a cambios de la bandeja. Devuelve la función para darse de baja. */
    subscribe(fn: () => void): () => void {
        listeners.add(fn);
        return () => { listeners.delete(fn); };
    },

    /**
     * Mensajes propios de una conversación que aún no están en el servidor
     * (pendientes o rechazados), descifrados y del más antiguo al más nuevo.
     * La conversación los enseña para que quien escribe sepa que no llegaron.
     */
    async forConversation(conversationId: string): Promise<OutboxMessage[]> {
        const rows = await db.message_queue.where('recipient_id').equals(conversationId).toArray();
        const items = (await Promise.all(
            rows.map(r => decryptRecord('message_queue', r as unknown as Record<string, unknown>))
        )) as unknown as QueuedMessage[];
        return items
            .filter(m => m.synced === 0 || m.synced === -1)
            .map(m => ({ ...m, status: (m.synced === -1 ? 'failed' : 'pending') as OutboxStatus }))
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    },

    /**
     * Reintentar un mensaje rechazado (botón "Retry"). Mismo id: si en realidad
     * ya había llegado, el servidor lo reconoce (23505) y no se duplica.
     */
    async retry(id: string): Promise<void> {
        await db.message_queue.update(id, { synced: 0, failure_reason: undefined });
        notify();
        await this.flush();
    },

    async pendingCount(): Promise<number> {
        return db.message_queue.where('synced').equals(0).count();
    },

    /** Envía lo pendiente, del más antiguo al más nuevo. Devuelve cuántos salieron. */
    async flush(): Promise<number> {
        if (flushing || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 0;
        flushing = true;
        let sent = 0;
        try {
            const rows = await db.message_queue.where('synced').equals(0).toArray();
            const items = (await Promise.all(
                rows.map(r => decryptRecord('message_queue', r as unknown as Record<string, unknown>))
            )) as unknown as QueuedMessage[];
            items.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

            for (const m of items) {
                try {
                    await messagingRepository.sendMessage(m.recipient_id, m.sender_id, m.content, {
                        id: m.id,
                        createdAt: m.timestamp,
                    });
                    await db.message_queue.delete(m.id);
                    sent++;
                } catch (e) {
                    const code = (e as { code?: string })?.code;
                    if (code === '23505') {
                        // Ya había llegado en un intento anterior
                        await db.message_queue.delete(m.id);
                        sent++;
                    } else if (isNetworkError(e)) {
                        break; // sin red: se reintenta al volver la conexión
                    } else {
                        logger.error('[Outbox] Message rejected:', e);
                        await db.message_queue.update(m.id, {
                            synced: -1,
                            failure_reason: ((e as { message?: string })?.message ?? String(e)).slice(0, 300),
                        });
                    }
                }
            }
        } finally {
            flushing = false;
            notify();
        }
        return sent;
    },
};
