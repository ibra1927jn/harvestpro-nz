/**
 * ChatAttachmentView — el adjunto dentro de la burbuja del mensaje.
 *
 * - Foto: miniatura (enlace firmado) que se abre a pantalla completa.
 * - PDF: icono, nombre y tamaño; se abre en otra pestaña.
 * - Nota de voz: reproductor con la duración.
 * Mientras el archivo está aún en el móvil (sin cobertura) se enseña desde ahí.
 */
import React, { useEffect, useRef, useState } from 'react';
import { chatAttachmentsService, formatBytes, formatDuration } from '@/services/chat-attachments.service';
import { pendingFiles } from '@/services/pending-uploads.service';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { useTranslation } from '@/i18n';
import type { DBMessage } from '@/context/messaging.types';

/** Enlace para enseñar el archivo: el local (object URL) o uno firmado */
export function useAttachmentUrl(path: string | null | undefined, localFileId?: string): string | null {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        let objectUrl: string | null = null;
        setUrl(null);
        (async () => {
            if (localFileId) {
                const blob = await pendingFiles.get(localFileId).catch(() => null);
                if (blob && !cancelled && typeof URL.createObjectURL === 'function') {
                    objectUrl = URL.createObjectURL(blob);
                    setUrl(objectUrl);
                    return;
                }
            }
            if (path) {
                const signed = await chatAttachmentsService.signedUrl(path).catch(() => null);
                if (!cancelled) setUrl(signed);
            }
        })();
        return () => {
            cancelled = true;
            if (objectUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(objectUrl);
        };
    }, [path, localFileId]);
    return url;
}

const PhotoViewer: React.FC<{ url: string; name: string; onClose: () => void }> = ({ url, name, onClose }) => {
    const { t } = useTranslation();
    const ref = useRef<HTMLDivElement>(null);
    useDialogA11y(ref, { onClose });
    return (
        <div ref={ref} role="dialog" aria-modal="true" aria-label={name} className="fixed inset-0 z-[60] bg-slate-950/90 flex items-center justify-center p-4" onClick={onClose}>
            <button type="button" onClick={onClose} aria-label={t('common.close')} className="absolute top-4 right-4 size-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20">
                <span aria-hidden="true" className="material-symbols-outlined">close</span>
            </button>
            <img src={url} alt={name} className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
    );
};

interface Props {
    message: Pick<DBMessage, 'attachment_path' | 'attachment_type' | 'attachment_name' | 'attachment_size' | 'duration_ms' | 'local_file_id' | 'delivery'>;
    isMe: boolean;
}

const ChatAttachmentView: React.FC<Props> = ({ message, isMe }) => {
    const { t } = useTranslation();
    const url = useAttachmentUrl(message.attachment_path, message.local_file_id);
    const [viewing, setViewing] = useState(false);
    const type = message.attachment_type;
    const name = message.attachment_name || t(`chat.file_kind.${type ?? 'image'}`);
    const sending = message.delivery === 'pending' && (
        <p className={`mt-1 text-[10px] font-bold ${isMe ? 'text-white/80' : 'text-slate-500'}`}>{t('chat.attachment_sending')}</p>
    );

    if (type === 'image') {
        return (
            <div>
                <button type="button" onClick={() => url && setViewing(true)} disabled={!url} aria-label={t('chat.view_photo', { name })}
                    className="block rounded-xl overflow-hidden bg-black/10 min-w-[8rem] min-h-[6rem]">
                    {url
                        ? <img src={url} alt={name} className="max-w-[14rem] max-h-[14rem] object-cover" loading="lazy" />
                        : <span aria-hidden="true" className="material-symbols-outlined text-4xl opacity-60 p-8">image</span>}
                </button>
                {sending}
                {viewing && url && <PhotoViewer url={url} name={name} onClose={() => setViewing(false)} />}
            </div>
        );
    }

    if (type === 'pdf') {
        return (
            <div>
                <a href={url ?? undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!url}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 ${isMe ? 'bg-white/15' : 'bg-slate-50 border border-slate-100'} ${url ? '' : 'pointer-events-none opacity-70'}`}>
                    <span aria-hidden="true" className={`material-symbols-outlined text-3xl ${isMe ? 'text-white' : 'text-red-500'}`}>picture_as_pdf</span>
                    <span className="min-w-0">
                        <span className="block truncate font-bold text-xs">{name}</span>
                        <span className={`block text-[10px] ${isMe ? 'text-white/70' : 'text-slate-400'}`}>
                            {message.attachment_size ? formatBytes(message.attachment_size) : ''} · {t('chat.open_pdf')}
                        </span>
                    </span>
                </a>
                {sending}
            </div>
        );
    }

    if (type === 'audio') {
        return (
            <div className="min-w-[12rem]">
                <div className="flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-xl">mic</span>
                    {url
                        ? <audio controls preload="metadata" src={url} className="h-9 max-w-[13rem]" aria-label={t('chat.voice_note_of', { d: formatDuration(message.duration_ms ?? 0) })} />
                        : <span className="text-xs opacity-70">{t('chat.loading_audio')}</span>}
                    <span className={`text-[10px] font-bold tabular-nums ${isMe ? 'text-white/80' : 'text-slate-500'}`}>{formatDuration(message.duration_ms ?? 0)}</span>
                </div>
                {sending}
            </div>
        );
    }
    return null;
};

export default ChatAttachmentView;
