/**
 * Bandeja de salida con adjuntos (fotos, PDF, notas de voz sin cobertura):
 * primero se sube el archivo y luego el mensaje, con el mismo id; el archivo
 * del móvil se borra al llegar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMessage = vi.fn();
const messageExists = vi.fn();
const upload = vi.fn();
vi.mock('@/repositories/messaging.repository', () => ({
    messagingRepository: {
        sendMessage: (...a: unknown[]) => sendMessage(...a),
        messageExists: (...a: unknown[]) => messageExists(...a),
    },
}));
vi.mock('./chat-attachments.service', () => ({
    chatAttachmentsService: { upload: (...a: unknown[]) => upload(...a) },
}));

import { db } from './db';
import { messageOutbox } from './message-outbox.service';
import { pendingFiles } from './pending-uploads.service';

const queued = async (id: string) => {
    await pendingFiles.put(id, 'chat', new Blob(['voice'], { type: 'audio/webm' }));
    await messageOutbox.queue({
        id, channel_type: 'direct', recipient_id: 'conv-1', sender_id: 'u1', content: '',
        timestamp: '2026-10-23T10:00:00+13:00',
        upload: { file_id: id, path: `conv-1/${id}.webm`, type: 'audio', mime: 'audio/webm', size: 5, duration_ms: 4200 },
    });
};

beforeEach(async () => {
    sendMessage.mockReset();
    messageExists.mockReset();
    messageExists.mockResolvedValue(false);
    upload.mockReset();
    await db.message_queue.clear();
    await db.pending_files.clear();
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
});

describe('messageOutbox with attachments', () => {
    it('uploads the file, then sends the message with the attachment, then frees the phone', async () => {
        await queued('m1');
        upload.mockResolvedValue(undefined);
        sendMessage.mockResolvedValue({ id: 'm1' });

        expect(await messageOutbox.flush()).toBe(1);
        expect(upload).toHaveBeenCalledWith('conv-1/m1.webm', expect.any(Blob), 'audio/webm');
        expect(sendMessage).toHaveBeenCalledWith('conv-1', 'u1', '', expect.objectContaining({
            id: 'm1',
            attachment: { path: 'conv-1/m1.webm', type: 'audio', name: undefined, size: 5, duration_ms: 4200 },
        }));
        expect(upload.mock.invocationCallOrder[0]).toBeLessThan(sendMessage.mock.invocationCallOrder[0]);
        expect(await pendingFiles.has('m1')).toBe(false);
        expect(await messageOutbox.pendingCount()).toBe(0);
    });

    it('the attachment details are encrypted in the queue like the text', async () => {
        await queued('m1');
        const raw = await db.message_queue.get('m1');
        expect(typeof raw?.upload).toBe('string');
        expect(String(raw?.upload)).toMatch(/^v2:/);
        const [shown] = await messageOutbox.forConversation('conv-1');
        expect(shown.upload?.path).toBe('conv-1/m1.webm');
    });

    it('no signal while uploading: message and file stay on the phone', async () => {
        await queued('m1');
        upload.mockRejectedValue(new TypeError('Failed to fetch'));

        expect(await messageOutbox.flush()).toBe(0);
        expect(sendMessage).not.toHaveBeenCalled();
        expect(await pendingFiles.has('m1')).toBe(true);
        const [shown] = await messageOutbox.forConversation('conv-1');
        expect(shown.status).toBe('pending');
    });

    it('a file that is no longer on the phone is shown as not sent', async () => {
        await queued('m1');
        await pendingFiles.delete('m1');

        expect(await messageOutbox.flush()).toBe(0);
        const [shown] = await messageOutbox.forConversation('conv-1');
        expect(shown.status).toBe('failed');
        expect(shown.failure_reason).toMatch(/no longer on this device/);
    });

    it('already delivered in an earlier attempt: no second upload needed, file freed', async () => {
        await queued('m1');
        upload.mockResolvedValue(undefined);
        sendMessage.mockRejectedValue({ code: '23505', message: 'duplicate key' });

        expect(await messageOutbox.flush()).toBe(1);
        expect(await pendingFiles.has('m1')).toBe(false);
    });
});
