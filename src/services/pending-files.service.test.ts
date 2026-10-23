/**
 * Archivos que esperan red (adjuntos del chat, fotos de QC): cifrados en
 * IndexedDB, con tope de tamaño.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { pendingFiles, PENDING_FILES_MAX_BYTES, QueueFullError, blobToArrayBuffer } from './pending-files.service';

const text = async (b: Blob) => new TextDecoder().decode(await blobToArrayBuffer(b));

beforeEach(async () => {
    await db.pending_files.clear();
});

describe('pendingFiles', () => {
    it('stores the file encrypted and gives it back intact', async () => {
        await pendingFiles.put('f1', 'chat', new Blob(['secret photo bytes'], { type: 'image/jpeg' }));

        const row = await db.pending_files.get('f1');
        expect(row?.iv?.length).toBe(12);
        expect(row?.size).toBe(18);
        expect(row?.kind).toBe('chat');
        // En IndexedDB no está el contenido en claro
        expect(new TextDecoder().decode(new Uint8Array(row!.data))).not.toContain('secret photo');

        const back = await pendingFiles.get('f1');
        expect(back?.type).toBe('image/jpeg');
        expect(await text(back!)).toBe('secret photo bytes');
    });

    it('same id replaces (a retry does not count twice)', async () => {
        await pendingFiles.put('f1', 'qc', new Blob(['a'.repeat(10)]));
        await pendingFiles.put('f1', 'qc', new Blob(['b'.repeat(20)]));
        expect(await db.pending_files.count()).toBe(1);
        expect(await pendingFiles.usedBytes()).toBe(20);
    });

    it('refuses a file that does not fit in the queue', async () => {
        await db.pending_files.put({
            id: 'big', kind: 'chat', mime: 'application/pdf', size: PENDING_FILES_MAX_BYTES - 5,
            iv: null, data: new ArrayBuffer(1), created_at: Date.now(),
        });
        await expect(pendingFiles.put('f2', 'chat', new Blob(['0123456789']))).rejects.toBeInstanceOf(QueueFullError);
        expect(await pendingFiles.has('f2')).toBe(false);
        // Lo que cabe, sí
        await pendingFiles.put('f3', 'chat', new Blob(['0123']));
        expect(await pendingFiles.has('f3')).toBe(true);
    });

    it('get returns null for a file that is gone, delete removes it', async () => {
        expect(await pendingFiles.get('nope')).toBeNull();
        await pendingFiles.put('f1', 'chat', new Blob(['x']));
        await pendingFiles.delete('f1');
        expect(await pendingFiles.has('f1')).toBe(false);
    });
});
