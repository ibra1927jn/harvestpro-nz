/**
 * Une los mensajes del servidor con los propios que aún están en la bandeja de
 * salida (pendientes o rechazados), para que quien escribe vea cuáles no han
 * llegado. Lógica pura (sin React).
 */
import type { OutboxMessage } from '@/services/message-outbox.service';
import type { DBMessage } from './messaging.types';
import type { MessagePriority } from '../types';

export function outboxToMessage(m: OutboxMessage): DBMessage {
    return {
        id: m.id,
        sender_id: m.sender_id,
        conversation_id: m.recipient_id,
        content: m.content,
        priority: (m.priority as MessagePriority | undefined) ?? 'normal',
        read_by: [],
        created_at: m.timestamp,
        delivery: m.status,
        ...(m.failure_reason ? { failure_reason: m.failure_reason } : {}),
    };
}

/**
 * Mensajes del servidor + los de la bandeja que el servidor aún no tiene, en
 * orden de fecha. Si un mensaje ya está en el servidor (llegó pero la bandeja
 * no se enteró: respuesta perdida) se enseña como entregado: nunca dos veces.
 */
export function mergeOutbox(server: DBMessage[], outbox: OutboxMessage[]): DBMessage[] {
    const onServer = new Set(server.map(m => m.id));
    const extra = outbox.filter(m => !onServer.has(m.id)).map(outboxToMessage);
    if (extra.length === 0) return server;
    return [...server, ...extra].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}
