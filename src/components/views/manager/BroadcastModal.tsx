import { logger } from '@/utils/logger';
import React, { useState, useRef } from 'react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { useMessaging } from '../../../context/MessagingContext';
import { useTranslation } from '@/i18n';
import { BroadcastAudiencePicker } from '@/components/common/BroadcastAudiencePicker';
import { rolesForAudiences, type BroadcastAudience } from '@/services/broadcastAudience';


interface BroadcastModalProps {
    onClose: () => void;
}

const BroadcastModal: React.FC<BroadcastModalProps> = ({ onClose }) => {
    const { t } = useTranslation();
    const dialogRef = useRef<HTMLDivElement>(null);
    useDialogA11y(dialogRef, { onClose });

    const { sendBroadcast } = useMessaging();
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>('normal');
    const [isSending, setIsSending] = useState(false);
    const [sendError, setSendError] = useState(false);
    // Destinatarios: por defecto todos
    const [audience, setAudience] = useState<BroadcastAudience[]>(['all']);

    const handleSend = async () => {
        if (!title || !message) return;
        setIsSending(true);
        try {
            setSendError(false);
            const ok = await sendBroadcast(
                title,
                message,
                priority,
                rolesForAudiences(audience)
            );
            // Si no se guardó, la ventana sigue abierta para reintentar
            if (ok === false) setSendError(true);
            else onClose();
        } catch (e) {

            logger.error("Failed to broadcast", e);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('broadcast.dialog_label')} className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl relative border border-border-light">
                <button aria-label={t('common.close')} onClick={onClose} className="absolute right-4 top-4 text-text-muted hover:text-text-main">
                    <span aria-hidden="true" className="material-symbols-outlined">close</span>
                </button>

                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                        <span aria-hidden="true" className="material-symbols-outlined">campaign</span>
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-text-main leading-none">{t('broadcast.alert_title')}</h2>
                        <span className="text-xs text-text-muted">{t(audience.includes('all') ? 'broadcast.push_all' : 'comms.audience_some')}</span>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-text-muted uppercase">{t('broadcast.title_label')}</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full bg-slate-50 border border-border-light rounded-xl px-4 py-3 font-bold outline-none text-text-main"
                            placeholder={t('broadcast.title_example')}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-text-muted uppercase">{t('pd.message')}</label>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="w-full bg-slate-50 border border-border-light rounded-xl px-4 py-3 font-medium outline-none text-text-main min-h-[100px]"
                            placeholder={t('broadcast.message_placeholder_alt')}
                        />
                    </div>

                    <BroadcastAudiencePicker value={audience} onChange={setAudience} />

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-text-muted uppercase">{t('broadcast.priority')}</label>
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            {(['normal', 'high', 'urgent'] as const).map(p => (
                                <button
                                    key={p}
                                    onClick={() => setPriority(p)}
                                    className={`flex-1 py-2 rounded-lg text-xs font-bold capitalize transition-all ${priority === p
                                        ? p === 'urgent' ? 'bg-red-600 text-white shadow' : 'bg-primary text-white shadow'
                                        : 'text-text-muted hover:text-text-sub'}`}
                                >
                                    {t(`chat.priority.${p}`)}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {sendError && (
                    <p role="alert" className="mb-3 text-sm font-medium text-red-600">{t('chat.broadcast_failed')}</p>
                )}
                <button
                    onClick={handleSend}
                    disabled={isSending || !title || !message}
                    className="w-full mt-6 py-4 gradient-primary glow-primary text-white rounded-xl font-bold hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
                >
                    {isSending ? t('broadcast.sending') : (
                        <>
                            <span aria-hidden="true" className="material-symbols-outlined">send</span>
                            {t('broadcast.send')}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default BroadcastModal;