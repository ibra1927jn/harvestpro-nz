/**
 * QuickMessageView — Inline quick-message composer with templates
 */
import React, { useState } from 'react';
import { RoleAccent } from './roleUtils';
import { useTranslation } from '@/i18n';

interface QuickMessageViewProps {
    pickerName: string;
    pickerId: string;
    accent: RoleAccent;
    onSendMessage?: (recipientId: string, message: string) => void;
    onBack: () => void;
}

// Plantillas en el idioma de quien escribe (claves; 'switch_row' acaba en espacio para el número)
const MESSAGE_TEMPLATES = ['pd.tpl.collection_point', 'pd.tpl.take_break', 'pd.tpl.switch_row', 'pd.tpl.good_work'];

const QuickMessageView: React.FC<QuickMessageViewProps> = React.memo(({
    pickerName,
    pickerId,
    accent,
    onSendMessage,
    onBack,
}) => {
    const { t } = useTranslation();
    const [messageText, setMessageText] = useState('');
    const [messageSent, setMessageSent] = useState(false);

    const handleSendMessage = () => {
        if (!messageText.trim()) return;
        if (onSendMessage) {
            onSendMessage(pickerId, messageText.trim());
        }
        setMessageSent(true);
        setMessageText('');
        setTimeout(() => {
            setMessageSent(false);
            onBack();
        }, 2000);
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-5">
            <div className="flex items-center gap-2 mb-4">
                <button aria-label={t('common.back')} onClick={onBack} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">arrow_back</span>
                </button>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {t('pd.message_to', { name: pickerName })}
                </p>
            </div>

            {messageSent ? (
                <div className="text-center py-8">
                    <span aria-hidden="true" className="material-symbols-outlined text-emerald-500 text-4xl mb-2">check_circle</span>
                    <p className="text-emerald-700 font-bold">{t('pd.message_sent')}</p>
                    <p className="text-sm text-slate-500 mt-1">{t('pd.returning')}</p>
                </div>
            ) : (
                <>
                    {/* Quick message templates */}
                    <div className="flex flex-wrap gap-2 mb-3">
                        {MESSAGE_TEMPLATES.map(template => (
                            <button
                                key={template}
                                onClick={() => setMessageText(template === 'pd.tpl.switch_row' ? `${t(template)} ` : t(template))}
                                className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-colors"
                            >
                                {t(template)}
                            </button>
                        ))}
                    </div>

                    <textarea
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        placeholder={t('pd.type_message')}
                        className={`w-full px-4 py-3 rounded-xl border border-slate-200 ${accent.focus} focus:ring-2 outline-none resize-none text-slate-900 transition-all`}
                        rows={3}
                        autoFocus
                    />

                    <button
                        onClick={handleSendMessage}
                        disabled={!messageText.trim()}
                        className={`w-full mt-3 py-3 ${accent.btn} text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-40`}
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-[20px]">send</span>
                        {t('pd.send_message')}
                    </button>
                </>
            )}
        </div>
    );
});

QuickMessageView.displayName = 'QuickMessageView';
export default QuickMessageView;
