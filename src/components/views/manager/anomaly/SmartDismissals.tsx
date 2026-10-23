/**
 * SmartDismissals — anomalías que el manager descartó como falsa alarma.
 * Antes era una lista fija de ejemplos en el código; ahora son los descartes
 * guardados (anomaly_dismissals), con su motivo y la opción de deshacer.
 */
import React, { useState } from 'react';
import { useTranslation } from '@/i18n';
import { formatNZTime } from '@/utils/nzFormat';
import type { AnomalyDismissalRow } from '@/services/fraud-detection.service';

interface SmartDismissalsProps {
    dismissed: AnomalyDismissalRow[];
    onUndo?: (id: string) => void;
}

const SmartDismissals: React.FC<SmartDismissalsProps> = ({ dismissed, onUndo }) => {
    const { t } = useTranslation();
    const [showDismissed, setShowDismissed] = useState(false);

    return (
        <div className="bg-emerald-50/50 rounded-2xl border border-emerald-200/50 overflow-hidden">
            <button
                onClick={() => setShowDismissed(!showDismissed)}
                aria-expanded={showDismissed}
                className="w-full px-6 py-4 flex justify-between items-center hover:bg-emerald-50 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 rounded-lg">
                        <span aria-hidden="true" className="material-symbols-outlined text-emerald-600">verified_user</span>
                    </div>
                    <div className="text-left">
                        <h3 className="font-bold text-emerald-800 text-sm">{t('fraud.dismissed_today')}</h3>
                        <p className="text-xs text-emerald-600">{t('fraud.dismissed_count', { n: dismissed.length })}</p>
                    </div>
                </div>
                <span aria-hidden="true" className={`material-symbols-outlined text-emerald-500 transition-transform ${showDismissed ? 'rotate-180' : ''}`}>
                    expand_more
                </span>
            </button>

            {showDismissed && (
                <div className="px-6 pb-5 space-y-3 animate-fade-in">
                    {dismissed.length === 0 && <p className="text-xs text-emerald-700">{t('fraud.dismissed_none')}</p>}
                    {dismissed.map(d => (
                        <div key={d.id} className="bg-white rounded-xl p-4 border border-emerald-100">
                            <div className="flex items-start gap-3">
                                <span aria-hidden="true" className="material-symbols-outlined text-emerald-500 text-lg mt-0.5 shrink-0">check_circle</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-700 mb-1">{d.picker_name ?? '—'}{d.anomaly_at ? ` · ${formatNZTime(d.anomaly_at)}` : ''}</p>
                                    {d.detail && <p className="text-xs text-slate-500">{d.detail}</p>}
                                    <p className="text-xs text-slate-600 mt-1">{d.reason ? t('fraud.dismissed_reason', { reason: d.reason }) : t('fraud.dismissed_no_reason')}</p>
                                    <span className="inline-block mt-2 px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded">
                                        {t('mgr.rule', { rule: d.anomaly_type })}
                                    </span>
                                </div>
                                {onUndo && (
                                    <button type="button" onClick={() => onUndo(d.id)} className="text-xs font-bold text-slate-500 hover:text-slate-800 underline shrink-0">
                                        {t('fraud.undo_dismiss')}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SmartDismissals;
