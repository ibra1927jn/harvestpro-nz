/**
 * BroadcastModal - Modal para enviar broadcasts a todo el equipo
 * Extraído de Manager.tsx para reutilización
 */

import React, { useState } from 'react';
import ModalOverlay from '@/components/ui/ModalOverlay';
import { useTranslation } from '@/i18n';

interface BroadcastModalProps {
    onClose: () => void;
    onSend: (title: string, message: string, priority: 'normal' | 'high' | 'urgent') => void | Promise<void>;
}

const BroadcastModal: React.FC<BroadcastModalProps> = ({ onClose, onSend }) => {
    const { t } = useTranslation();
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>('normal');
    const [isSending, setIsSending] = useState(false);

    const handleSend = async () => {
        if (!title.trim() || !message.trim()) return;
        setIsSending(true);
        try {
            await onSend(title, message, priority);
            onClose();
        } catch {
            // No se envió: el modal sigue abierto y la pantalla muestra el motivo
        } finally {
            setIsSending(false);
        }
    };

    return (
        <ModalOverlay onClose={onClose}>
            <div className="p-6 max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center">
                            <span aria-hidden="true" className="material-symbols-outlined text-primary text-2xl">campaign</span>
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-text-main">{t('broadcast.new')}</h3>
                            <p className="text-xs text-text-muted">{t('broadcast.to_all_field')}</p>
                        </div>
                    </div>
                    <button aria-label={t('common.close')} onClick={onClose} className="text-text-muted hover:text-text-main transition-colors">
                        <span aria-hidden="true" className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-text-muted uppercase mb-2 block">{t('broadcast.title_label')}</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder={t('broadcast.title_example')}
                            className="w-full bg-slate-50 border border-border-light rounded-xl px-4 py-3 text-text-main focus:border-primary outline-none transition-colors"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-text-muted uppercase mb-2 block">{t('pd.message')}</label>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder={t('broadcast.message_placeholder')}
                            rows={4}
                            className="w-full bg-slate-50 border border-border-light rounded-xl px-4 py-3 text-text-main focus:border-primary outline-none resize-none transition-colors"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-text-muted uppercase mb-2 block">{t('broadcast.priority')}</label>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { value: 'normal', label: t('chat.priority.normal'), color: 'bg-slate-500' },
                                { value: 'high', label: t('chat.priority.high'), color: 'bg-warning' },
                                { value: 'urgent', label: t('chat.priority.urgent'), color: 'bg-danger' },
                            ].map((p) => (
                                <button
                                    key={p.value}
                                    onClick={() => setPriority(p.value as 'normal' | 'high' | 'urgent')}
                                    className={`py-2 px-3 rounded-lg text-xs font-bold uppercase transition-all flex items-center justify-center gap-2 ${priority === p.value
                                        ? `${p.color} text-white`
                                        : 'bg-slate-50 text-text-muted border border-border-light'
                                        }`}
                                >
                                    <span className={`size-2 rounded-full ${p.color}`}></span>
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {priority === 'urgent' && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                            <p className="text-xs text-danger">
                                ⚠️ {t('broadcast.urgent_warning')}
                            </p>
                        </div>
                    )}
                </div>

                <button
                    onClick={handleSend}
                    disabled={!title.trim() || !message.trim() || isSending}
                    className="w-full mt-6 py-4 gradient-primary glow-primary text-white rounded-xl font-bold uppercase tracking-widest disabled:bg-surface-tertiary disabled:shadow-none active:scale-[0.98] transition-all"
                >
                    {isSending ? t('broadcast.sending') : t('broadcast.send')}
                </button>
            </div>
        </ModalOverlay>
    );
};

export default BroadcastModal;
