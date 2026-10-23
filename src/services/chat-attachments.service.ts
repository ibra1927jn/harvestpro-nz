/**
 * Adjuntos del chat: fotos (JPEG/PNG/WebP, reducidas en el móvil a 1600 px),
 * PDF y notas de voz, en el almacén privado "chat-attachments".
 *
 * Ruta: <conversation_id>/<uuid del mensaje>.<ext>. La BD exige que la carpeta
 * sea la de la conversación del mensaje y el almacén deja subir y leer solo a
 * quien participa en ella (migración 20261023050000). Se enseñan con enlaces
 * firmados de una hora.
 */
import { supabase } from './supabase';
import { logger } from '@/utils/logger';

export const CHAT_ATTACHMENTS_BUCKET = 'chat-attachments';
/** Máximo por archivo (igual que el almacén y el CHECK de chat_messages) */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** Lado mayor de una foto tras reducirla en el móvil */
export const IMAGE_MAX_SIDE = 1600;
/** Nota de voz más larga */
export const MAX_VOICE_MS = 2 * 60 * 1000;
const SIGNED_URL_SECONDS = 3600;

export type AttachmentType = 'image' | 'pdf' | 'audio';

/** Adjunto tal como queda en el mensaje */
export interface ChatAttachment {
    path: string;
    type: AttachmentType;
    name?: string;
    size: number;
    duration_ms?: number;
}

const IMAGE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Tipo base sin parámetros: "audio/webm;codecs=opus" → "audio/webm" */
export const baseMime = (mime: string): string => mime.split(';')[0].trim().toLowerCase();

/** ¿Qué se puede adjuntar? Devuelve tipo y extensión, o null si no se admite */
export function classifyFile(mime: string): { type: AttachmentType; ext: string } | null {
    const m = baseMime(mime);
    if (IMAGE_EXT[m]) return { type: 'image', ext: IMAGE_EXT[m] };
    if (m === 'application/pdf') return { type: 'pdf', ext: 'pdf' };
    if (m === 'audio/webm') return { type: 'audio', ext: 'webm' };
    if (m === 'audio/ogg') return { type: 'audio', ext: 'ogg' };
    if (m === 'audio/mp4' || m === 'audio/aac' || m === 'audio/x-m4a') return { type: 'audio', ext: 'm4a' };
    return null;
}

/** Ruta del archivo en el almacén */
export const attachmentPath = (conversationId: string, messageId: string, ext: string): string =>
    `${conversationId}/${messageId}.${ext}`;

/** Medidas finales para que el lado mayor no pase de maxSide (nunca se amplía) */
export function fitWithin(width: number, height: number, maxSide = IMAGE_MAX_SIDE): { width: number; height: number } {
    const longest = Math.max(width, height);
    if (longest <= maxSide || longest === 0) return { width, height };
    const k = maxSide / longest;
    return { width: Math.round(width * k), height: Math.round(height * k) };
}

/**
 * Foto reducida a 1600 px (lado mayor) en JPEG. Si el navegador no puede
 * dibujarla (o ya es pequeña) se envía tal cual.
 */
export async function prepareImage(file: Blob): Promise<Blob> {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
    try {
        const bitmap = await createImageBitmap(file);
        const { width, height } = fitWithin(bitmap.width, bitmap.height);
        if (width === bitmap.width && height === bitmap.height && file.size <= 1024 * 1024) {
            bitmap.close?.();
            return file;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return file;
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close?.();
        const out = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
        return out && out.size > 0 ? out : file;
    } catch (e) {
        logger.warn('[ChatAttachments] Could not resize photo, sending original:', e);
        return file;
    }
}

/** "Ya existe": un intento anterior llegó a subirlo (la respuesta se perdió) */
const isAlreadyThere = (e: { message?: string; statusCode?: string | number } | null): boolean =>
    !!e && (String(e.statusCode) === '409' || /already exists|duplicate/i.test(e.message ?? ''));

/** Error de red (sin cobertura): se reintenta más tarde */
export const isNetworkError = (e: unknown): boolean => {
    const msg = (e as { message?: string })?.message ?? String(e);
    return /fetch|network|offline|timeout|load failed/i.test(msg);
};

const signedCache = new Map<string, { url: string; until: number }>();

export const chatAttachmentsService = {
    /** Sube el archivo. Repetir con la misma ruta no falla (idempotente). */
    async upload(path: string, blob: Blob, mime: string): Promise<void> {
        const { error } = await supabase.storage
            .from(CHAT_ATTACHMENTS_BUCKET)
            .upload(path, blob, { contentType: baseMime(mime), upsert: false, cacheControl: '31536000' });
        if (error && !isAlreadyThere(error as { message?: string; statusCode?: string | number })) throw error;
    },

    /** Enlace firmado (1 h), guardado en memoria hasta 5 min antes de caducar */
    async signedUrl(path: string): Promise<string | null> {
        const hit = signedCache.get(path);
        if (hit && hit.until > Date.now()) return hit.url;
        const { data, error } = await supabase.storage
            .from(CHAT_ATTACHMENTS_BUCKET)
            .createSignedUrl(path, SIGNED_URL_SECONDS);
        if (error || !data?.signedUrl) {
            logger.warn('[ChatAttachments] No signed URL:', error);
            return null;
        }
        signedCache.set(path, { url: data.signedUrl, until: Date.now() + (SIGNED_URL_SECONDS - 300) * 1000 });
        return data.signedUrl;
    },

    /** Solo tests */
    _clearCache(): void {
        signedCache.clear();
    },
};

/** "1,2 MB" / "350 KB" */
export function formatBytes(bytes: number, locale = 'en-NZ'): string {
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
    }
    return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString(locale)} KB`;
}

/** "0:42" / "1:05" */
export function formatDuration(ms: number): string {
    const total = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
