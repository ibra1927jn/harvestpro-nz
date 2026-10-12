/**
 * Bandeja de salida: los mensajes sin enviar salen al volver la conexión, sin duplicar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMessage = vi.fn();
vi.mock('@/repositories/messaging.repository', () => ({
    messagingRepository: { sendMessage: (...a: unknown[]) => sendMessage(...a) },
}));
vi.mock('./dbCrypto', () => ({
    encryptRecord: async (_t: string, r: unknown) => r,
    decryptRecord: async (_t: string, r: unknown) => r,
}));

import { db } from './db';
import { messageOutbox } from './message-outbox.service';

const msg = (id: string, ts: string) => ({
    id, channel_type: 'direct' as const, recipient_id: 'conv-1', sender_id: 'u1', content: `m${id}`, timestamp: ts,
});

beforeEach(async () => {
    sendMessage.mockReset();
    await db.message_queue.clear();
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
});

describe('messageOutbox', () => {
    it('sends queued messages oldest first with their own id and time', async () => {
        await messageOutbox.queue(msg('b', '2026-10-13T10:02:00+13:00'));
        await messageOutbox.queue(msg('a', '2026-10-13T10:01:00+13:00'));
        sendMessage.mockResolvedValue({});

        expect(await messageOutbox.flush()).toBe(2);
        expect(sendMessage.mock.calls.map(c => c[3].id)).toEqual(['a', 'b']);
        expect(sendMessage.mock.calls[0][3].createdAt).toBe('2026-10-13T10:01:00+13:00');
        expect(await messageOutbox.pendingCount()).toBe(0);
    });

    it('treats an already-delivered message as sent (no duplicate)', async () => {
        await messageOutbox.queue(msg('a', '2026-10-13T10:01:00+13:00'));
        sendMessage.mockRejectedValue({ code: '23505', message: 'duplicate key' });
        expect(await messageOutbox.flush()).toBe(1);
        expect(await messageOutbox.pendingCount()).toBe(0);
    });

    it('keeps messages when there is no network', async () => {
        await messageOutbox.queue(msg('a', '2026-10-13T10:01:00+13:00'));
        sendMessage.mockRejectedValue(new TypeError('Failed to fetch'));
        expect(await messageOutbox.flush()).toBe(0);
        expect(await messageOutbox.pendingCount()).toBe(1);
    });
});
