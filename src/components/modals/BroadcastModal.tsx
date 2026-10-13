/**
 * BroadcastModal - Modal para enviar broadcasts a todo el equipo
 * Extraído de Manager.tsx para reutilización
 */

import React, { useState } from 'react';
import ModalOverlay from '@/components/ui/ModalOverlay';

interface BroadcastModalProps {
    onClose: () => void;
    onSend: (title: string, message: string, priority: 'normal' | 'high' | 'urgent') => void | Promise<void>;
}

const BroadcastModal: React.FC<BroadcastModalProps> = ({ onClose, onSend }) => {
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
                            <h3 className="text-xl font-black text-text-main">New Broadcast</h3>
                            <p className="text-xs text-text-muted">Send to all field staff</p>
                        </div>
                    </div>
                    <button aria-label="Close" onClick={onClose} className="text-text-muted hover:text-text-main transition-colors">
                        <span aria-hidden="true" className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-text-muted uppercase mb-2 block">Title</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Weather Alert"
                            className="w-full bg-slate-50 border border-border-light rounded-xl px-4 py-3 text-text-main focus:border-primary outline-none transition-colors"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-text-muted uppercase mb-2 block">Message</label>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Type your broadcast message..."
                            rows={4}
                            className="w-full bg-slate-50 border border-border-light rounded-xl px-4 py-3 text-text-main focus:border-primary outline-none resize-none transition-colors"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-text-muted uppercase mb-2 block">Priority</label>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { value: 'normal', label: 'Normal', color: 'bg-slate-500' },
                                { value: 'high', label: 'High', color: 'bg-warning' },
                                { value: 'urgent', label: 'Urgent', color: 'bg-danger' },
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
                                ⚠️ Urgent broadcasts will trigger push notifications and audio alerts on all devices.
                            </p>
                        </div>
                    )}
                </div>

                <button
                    onClick={handleSend}
                    disabled={!title.trim() || !message.trim() || isSending}
                    className="w-full mt-6 py-4 gradient-primary glow-primary text-white rounded-xl font-bold uppercase tracking-widest disabled:bg-surface-tertiary disabled:shadow-none active:scale-[0.98] transition-all"
                >
                    {isSending ? 'Sending...' : 'Send Broadcast'}
                </button>
            </div>
        </ModalOverlay>
    );
};

export default BroadcastModal;
