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

export const messageOutbox = {
    async queue(msg: Omit<QueuedMessage, 'synced'>): Promise<void> {
        const record = { ...msg, synced: 0 };
        try {
            await db.message_queue.put(await encryptRecord('message_queue', record));
        } catch (e) {
            logger.error('[Outbox] Encryption failed, storing unencrypted:', e);
            await db.message_queue.put(record as QueuedMessage);
        }
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
        }
        return sent;
    },
};
