/**
 * Bandeja de salida: los mensajes sin enviar salen al volver la conexión, sin duplicar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMessage = vi.fn();
const messageExists = vi.fn();
vi.mock('@/repositories/messaging.repository', () => ({
    messagingRepository: {
        sendMessage: (...a: unknown[]) => sendMessage(...a),
        messageExists: (...a: unknown[]) => messageExists(...a),
    },
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
    messageExists.mockReset();
    messageExists.mockResolvedValue(false);
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

    it('a resend rejected by the server after a lost response is not shown as failed if it already arrived', async () => {
        // 1er intento: llegó pero se perdió la respuesta; 2º: RLS lo rechaza (antes salía "Not sent")
        await messageOutbox.queue(msg('a', '2026-10-13T10:01:00+13:00'));
        sendMessage.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        expect(await messageOutbox.flush()).toBe(0);
        sendMessage.mockRejectedValueOnce({ code: '42501', message: 'new row violates row-level security policy' });
        messageExists.mockResolvedValue(true);

        expect(await messageOutbox.flush()).toBe(1);
        expect(messageExists).toHaveBeenCalledWith('a');
        expect(await messageOutbox.forConversation('conv-1')).toEqual([]);
    });

    it('a rejected message that is not on the server (or cannot be checked) is kept as failed with the reason', async () => {
        await messageOutbox.queue(msg('a', '2026-10-13T10:01:00+13:00'));
        await messageOutbox.queue(msg('b', '2026-10-13T10:02:00+13:00'));
        sendMessage.mockRejectedValue({ code: '42501', message: 'new row violates row-level security policy' });
        messageExists.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('permission denied'));

        expect(await messageOutbox.flush()).toBe(0);
        const shown = await messageOutbox.forConversation('conv-1');
        expect(shown.map(m => [m.id, m.status])).toEqual([['a', 'failed'], ['b', 'failed']]);
        expect(shown[0].failure_reason).toMatch(/row-level security/);
    });
});
