/**
 * QuickMessageView — Inline quick-message composer with templates
 */
import React, { useState } from 'react';
import { RoleAccent } from './roleUtils';

interface QuickMessageViewProps {
    pickerName: string;
    pickerId: string;
    accent: RoleAccent;
    onSendMessage?: (recipientId: string, message: string) => void;
    onBack: () => void;
}

const MESSAGE_TEMPLATES = [
    'Come to the collection point',
    'Take a break',
    'Switch to row ',
    'Good work today!'
];

const QuickMessageView: React.FC<QuickMessageViewProps> = React.memo(({
    pickerName,
    pickerId,
    accent,
    onSendMessage,
    onBack,
}) => {
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
                <button aria-label="Back" onClick={onBack} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">arrow_back</span>
                </button>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Message to {pickerName}
                </p>
            </div>

            {messageSent ? (
                <div className="text-center py-8">
                    <span aria-hidden="true" className="material-symbols-outlined text-emerald-500 text-4xl mb-2">check_circle</span>
                    <p className="text-emerald-700 font-bold">Message Sent!</p>
                    <p className="text-sm text-slate-500 mt-1">Returning to profile...</p>
                </div>
            ) : (
                <>
                    {/* Quick message templates */}
                    <div className="flex flex-wrap gap-2 mb-3">
                        {MESSAGE_TEMPLATES.map(template => (
                            <button
                                key={template}
                                onClick={() => setMessageText(template)}
                                className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-colors"
                            >
                                {template}
                            </button>
                        ))}
                    </div>

                    <textarea
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        placeholder="Type your message..."
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
                        Send Message
                    </button>
                </>
            )}
        </div>
    );
});

QuickMessageView.displayName = 'QuickMessageView';
export default QuickMessageView;
