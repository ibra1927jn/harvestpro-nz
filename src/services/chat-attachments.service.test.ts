/**
 * Adjuntos del chat: qué se admite, tamaño de las fotos, subida idempotente y
 * enlaces firmados.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const upload = vi.fn();
const createSignedUrl = vi.fn();
const from = vi.fn(() => ({ upload, createSignedUrl }));
vi.mock('./supabase', () => ({ supabase: { storage: { from: (b: string) => from(b) } } }));

import {
    attachmentPath,
    baseMime,
    chatAttachmentsService,
    classifyFile,
    fitWithin,
    formatBytes,
    formatDuration,
    IMAGE_MAX_SIDE,
    isNetworkError,
    prepareImage,
} from './chat-attachments.service';

beforeEach(() => {
    upload.mockReset();
    createSignedUrl.mockReset();
    from.mockClear();
    chatAttachmentsService._clearCache();
});

describe('classifyFile', () => {
    it('accepts photos, PDF and recorded audio', () => {
        expect(classifyFile('image/jpeg')).toEqual({ type: 'image', ext: 'jpg' });
        expect(classifyFile('image/png')).toEqual({ type: 'image', ext: 'png' });
        expect(classifyFile('image/webp')).toEqual({ type: 'image', ext: 'webp' });
        expect(classifyFile('application/pdf')).toEqual({ type: 'pdf', ext: 'pdf' });
        expect(classifyFile('audio/webm;codecs=opus')).toEqual({ type: 'audio', ext: 'webm' });
        expect(classifyFile('audio/mp4')).toEqual({ type: 'audio', ext: 'm4a' });
    });

    it('rejects anything else', () => {
        for (const m of ['text/html', 'image/svg+xml', 'application/zip', '', 'image/gif']) expect(classifyFile(m)).toBeNull();
    });

    it('baseMime drops parameters', () => {
        expect(baseMime('Audio/WebM; codecs=opus')).toBe('audio/webm');
    });
});

describe('photo size', () => {
    it('fits the longest side into 1600 px and never enlarges', () => {
        expect(fitWithin(4000, 3000)).toEqual({ width: IMAGE_MAX_SIDE, height: 1200 });
        expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: IMAGE_MAX_SIDE });
        expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    });

    it('sends the original when the browser cannot draw it', async () => {
        const f = new Blob(['x'], { type: 'image/png' });
        expect(await prepareImage(f)).toBe(f);
    });
});

describe('chatAttachmentsService', () => {
    it('path is <conversation>/<message id>.<ext>', () => {
        expect(attachmentPath('c1', 'm1', 'jpg')).toBe('c1/m1.jpg');
    });

    it('uploads to the private bucket with the base content type', async () => {
        upload.mockResolvedValue({ data: { path: 'c1/m1.webm' }, error: null });
        await chatAttachmentsService.upload('c1/m1.webm', new Blob(['a']), 'audio/webm;codecs=opus');
        expect(from).toHaveBeenCalledWith('chat-attachments');
        expect(upload.mock.calls[0][0]).toBe('c1/m1.webm');
        expect(upload.mock.calls[0][2]).toMatchObject({ contentType: 'audio/webm', upsert: false });
    });

    it('a second upload of the same file (lost response) is not an error', async () => {
        upload.mockResolvedValue({ data: null, error: { message: 'The resource already exists', statusCode: '409' } });
        await expect(chatAttachmentsService.upload('c1/m1.jpg', new Blob(['a']), 'image/jpeg')).resolves.toBeUndefined();
    });

    it('other upload errors are thrown', async () => {
        upload.mockResolvedValue({ data: null, error: { message: 'new row violates row-level security policy', statusCode: '403' } });
        await expect(chatAttachmentsService.upload('c1/m1.jpg', new Blob(['a']), 'image/jpeg')).rejects.toMatchObject({ statusCode: '403' });
    });

    it('signed URLs are cached', async () => {
        createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x/signed' }, error: null });
        expect(await chatAttachmentsService.signedUrl('c1/m1.jpg')).toBe('https://x/signed');
        expect(await chatAttachmentsService.signedUrl('c1/m1.jpg')).toBe('https://x/signed');
        expect(createSignedUrl).toHaveBeenCalledTimes(1);
        expect(createSignedUrl).toHaveBeenCalledWith('c1/m1.jpg', 3600);
    });

    it('no signed URL when the server refuses', async () => {
        createSignedUrl.mockResolvedValue({ data: null, error: { message: 'Object not found' } });
        expect(await chatAttachmentsService.signedUrl('c1/x.jpg')).toBeNull();
    });
});

describe('formatting', () => {
    it('sizes and durations', () => {
        expect(formatBytes(350 * 1024)).toBe('350 KB');
        expect(formatBytes(1.25 * 1024 * 1024)).toBe('1.3 MB');
        expect(formatDuration(42_000)).toBe('0:42');
        expect(formatDuration(65_400)).toBe('1:05');
    });

    it('network errors', () => {
        expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
        expect(isNetworkError({ message: 'permission denied' })).toBe(false);
    });
});
