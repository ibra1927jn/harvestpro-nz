/**
 * MessagingContext — adjuntos (con y sin red), gestionar un grupo y silenciar.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    sendMessage: vi.fn(),
    updateConversation: vi.fn(),
    setMuted: vi.fn(),
    upload: vi.fn(),
    queue: vi.fn(),
    flush: vi.fn(),
}));

vi.mock('@/services/supabase', () => ({
    supabase: {
        channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
        removeChannel: vi.fn(),
    },
}));
vi.mock('@/repositories/messaging.repository', () => ({
    messagingRepository: {
        sendMessage: mocks.sendMessage,
        updateConversation: mocks.updateConversation,
        setMuted: mocks.setMuted,
        getUnreadCounts: vi.fn().mockResolvedValue({}),
    },
}));
vi.mock('@/services/chat-attachments.service', async importOriginal => ({
    ...(await importOriginal<typeof import('@/services/chat-attachments.service')>()),
    chatAttachmentsService: { upload: mocks.upload },
}));
vi.mock('@/services/message-outbox.service', () => ({
    messageOutbox: {
        queue: mocks.queue,
        flush: mocks.flush,
        forConversation: vi.fn().mockResolvedValue([]),
        retry: vi.fn(),
        subscribe: () => () => undefined,
    },
}));

import { MessagingProvider, useMessaging } from './MessagingContext';
import { db } from '@/services/db';
import { pendingFiles, PENDING_FILES_MAX_BYTES } from '@/services/pending-uploads.service';

const wrapper = ({ children }: { children: React.ReactNode }) => <MessagingProvider>{children}</MessagingProvider>;
const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => v });
const photo = () => ({ blob: new Blob(['jpegbytes'], { type: 'image/jpeg' }), type: 'image' as const, mime: 'image/jpeg', ext: 'jpg', name: 'row 4.jpg' });

beforeEach(async () => {
    Object.values(mocks).forEach(m => m.mockReset());
    mocks.flush.mockResolvedValue(0);
    await db.pending_files.clear();
    setOnline(true);
});

async function ready() {
    const { result } = renderHook(() => useMessaging(), { wrapper });
    act(() => result.current.setUserId('u1'));
    return result;
}

describe('sendAttachment', () => {
    it('online: uploads into the conversation folder and saves the message with the attachment', async () => {
        mocks.upload.mockResolvedValue(undefined);
        mocks.sendMessage.mockImplementation(async (_c, _s, content, opts) => ({ id: opts.id, content, attachment_path: opts.attachment.path }));
        const r = await ready();
        let res: Awaited<ReturnType<typeof r.current.sendAttachment>> | undefined;
        await act(async () => { res = await r.current.sendAttachment('conv-1', { ...photo(), caption: ' look ' }); });

        const path = mocks.upload.mock.calls[0][0] as string;
        expect(path).toMatch(/^conv-1\/[0-9a-f-]{36}\.jpg$/);
        expect(mocks.sendMessage).toHaveBeenCalledWith('conv-1', 'u1', 'look', expect.objectContaining({
            attachment: { path, type: 'image', name: 'row 4.jpg', size: 9 },
        }));
        expect(res?.error).toBeUndefined();
        expect(res?.message?.attachment_path).toBe(path);
        expect(mocks.queue).not.toHaveBeenCalled();
    });

    it('offline: keeps the file encrypted on the phone and queues the message as sending', async () => {
        setOnline(false);
        const r = await ready();
        let res: Awaited<ReturnType<typeof r.current.sendAttachment>> | undefined;
        await act(async () => {
            res = await r.current.sendAttachment('conv-1', { blob: new Blob(['opus'], { type: 'audio/webm' }), type: 'audio', mime: 'audio/webm', ext: 'webm', durationMs: 4200.4 });
        });

        expect(mocks.upload).not.toHaveBeenCalled();
        const id = res!.message!.id;
        expect(res?.message).toMatchObject({ delivery: 'pending', attachment_type: 'audio', duration_ms: 4200, local_file_id: id });
        expect(await pendingFiles.has(id)).toBe(true);
        expect(mocks.queue).toHaveBeenCalledWith(expect.objectContaining({
            id, recipient_id: 'conv-1', content: '',
            upload: expect.objectContaining({ file_id: id, path: `conv-1/${id}.webm`, type: 'audio', mime: 'audio/webm', duration_ms: 4200 }),
        }));
    });

    it('online but the upload fails: queued (with the same id) and retried', async () => {
        mocks.upload.mockRejectedValue(new Error('500 Internal'));
        const r = await ready();
        let res: Awaited<ReturnType<typeof r.current.sendAttachment>> | undefined;
        await act(async () => { res = await r.current.sendAttachment('conv-1', photo()); });
        expect(res?.message?.delivery).toBe('pending');
        expect(mocks.queue).toHaveBeenCalled();
        expect(mocks.flush).toHaveBeenCalled();
    });

    it('says when the offline queue is full instead of losing the file', async () => {
        setOnline(false);
        await db.pending_files.put({ id: 'big', kind: 'chat', mime: 'application/pdf', size: PENDING_FILES_MAX_BYTES, iv: null, data: new ArrayBuffer(1), created_at: 0 });
        const r = await ready();
        let res: Awaited<ReturnType<typeof r.current.sendAttachment>> | undefined;
        await act(async () => { res = await r.current.sendAttachment('conv-1', photo()); });
        expect(res).toEqual({ message: null, error: 'queue_full' });
        expect(mocks.queue).not.toHaveBeenCalled();
    });

    it('refuses files over 10 MB', async () => {
        const r = await ready();
        const blob = new Blob(['x']);
        Object.defineProperty(blob, 'size', { value: 10 * 1024 * 1024 + 1 });
        let res: Awaited<ReturnType<typeof r.current.sendAttachment>> | undefined;
        await act(async () => { res = await r.current.sendAttachment('conv-1', { ...photo(), blob }); });
        expect(res?.error).toBe('too_large');
    });
});

describe('group and mute', () => {
    it('updateConversation calls the RPC and reports failure', async () => {
        mocks.updateConversation.mockResolvedValueOnce({ id: 'g1', name: 'New', type: 'group', participant_ids: ['u1', 'u2'], created_by: 'u1' });
        const r = await ready();
        let ok: boolean | undefined;
        await act(async () => { ok = await r.current.updateConversation('g1', { name: 'New' }); });
        expect(ok).toBe(true);
        expect(mocks.updateConversation).toHaveBeenCalledWith('g1', { name: 'New' });

        mocks.updateConversation.mockRejectedValueOnce({ code: '42501' });
        await act(async () => { ok = await r.current.updateConversation('g1', { remove: ['u2'] }); });
        expect(ok).toBe(false);
    });

    it('setConversationMuted saves it for me', async () => {
        mocks.setMuted.mockResolvedValue(undefined);
        const r = await ready();
        let ok: boolean | undefined;
        await act(async () => { ok = await r.current.setConversationMuted('g1', true); });
        expect(ok).toBe(true);
        expect(mocks.setMuted).toHaveBeenCalledWith('g1', true);
    });
});
