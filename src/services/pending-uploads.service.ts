/**
 * Archivos que esperan red: adjuntos del chat (fotos, PDF, notas de voz) y
 * fotos de las inspecciones de QC hechas sin cobertura.
 *
 * Se guardan en IndexedDB (tabla pending_files) cifrados con AES-256-GCM, igual
 * que el resto de la cola, y se borran en cuanto el servidor los tiene.
 * La cola tiene un tope de tamaño: si un archivo no cabe se avisa a quien lo
 * envía (QueueFullError) en vez de llenar el almacenamiento del móvil.
 */
import { db, type PendingFile } from './db';
import { encryptBytes, decryptBytes } from './dbCrypto';
import { logger } from '@/utils/logger';

/** Tope de la cola de archivos en el móvil (unas 5 fotos grandes o 25 notas de voz) */
export const PENDING_FILES_MAX_BYTES = 50 * 1024 * 1024;

/** El archivo no cabe en la cola del móvil */
export class QueueFullError extends Error {
    constructor(public readonly usedBytes: number, public readonly fileBytes: number) {
        super('Offline queue is full');
        this.name = 'QueueFullError';
    }
}

/** Bytes de un Blob (jsdom antiguo no tiene Blob.arrayBuffer) */
export async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
    });
}

export const pendingFiles = {
    /** Bytes que ocupa ahora la cola de archivos */
    async usedBytes(): Promise<number> {
        let total = 0;
        await db.pending_files.each(f => { total += f.size; });
        return total;
    },

    /**
     * Guarda el archivo (cifrado). Mismo id = se sustituye (reintentar no
     * duplica). Lanza QueueFullError si no cabe.
     */
    async put(id: string, kind: PendingFile['kind'], blob: Blob, mime = blob.type): Promise<void> {
        const existing = await db.pending_files.get(id);
        const used = (await this.usedBytes()) - (existing?.size ?? 0);
        if (used + blob.size > PENDING_FILES_MAX_BYTES) throw new QueueFullError(used, blob.size);

        const plain = await blobToArrayBuffer(blob);
        let iv: Uint8Array | null = null;
        let data: ArrayBuffer = plain;
        try {
            const enc = await encryptBytes(plain);
            iv = enc.iv;
            data = enc.data;
        } catch (e) {
            // Como la bandeja de mensajes: mejor guardado sin cifrar que perdido
            logger.error('[PendingFiles] Encryption failed, storing unencrypted:', e);
        }
        await db.pending_files.put({ id, kind, mime, size: blob.size, iv, data, created_at: Date.now() });
    },

    /** El archivo descifrado, o null si ya no está en el móvil */
    async get(id: string): Promise<Blob | null> {
        const row = await db.pending_files.get(id);
        if (!row) return null;
        const bytes = row.iv ? await decryptBytes({ iv: row.iv, data: row.data }) : row.data;
        return new Blob([bytes], { type: row.mime });
    },

    async has(id: string): Promise<boolean> {
        return (await db.pending_files.get(id)) !== undefined;
    },

    async delete(id: string): Promise<void> {
        await db.pending_files.delete(id);
    },
};
