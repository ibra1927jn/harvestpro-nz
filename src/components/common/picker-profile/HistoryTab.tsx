/**
 * HistoryTab — Tab de historial del picker: TLs, variedades, registros diarios
 * Extraído de PickerProfileDrawer.tsx
 */
import React from 'react';
import { useTranslation } from '@/i18n';
import { PickerHistory } from '@/services/picker-history.service';
import Sparkline from './Sparkline';

interface HistoryTabProps {
    history: PickerHistory;
    dailyBuckets: number[];
}

const HistoryTab: React.FC<HistoryTabProps> = ({ history, dailyBuckets }) => {
    const { t, locale } = useTranslation();

    return (
        <div className="space-y-4">
            {history.teamLeadersWorkedWith.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                    <h4 className="text-xs font-bold text-text-main mb-2 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm text-indigo-500">groups</span>
                        {t('panel.history.tl_worked_with')}
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                        {history.teamLeadersWorkedWith.map(tl => (
                            <span key={tl} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">{tl}</span>
                        ))}
                    </div>
                </div>
            )}
            {history.varietiesPicked.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                    <h4 className="text-xs font-bold text-text-main mb-2 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm text-pink-500">eco</span>
                        {t('panel.history.varieties')}
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                        {history.varietiesPicked.map(v => (
                            <span key={v} className="px-2.5 py-1 bg-pink-50 text-pink-700 rounded-full text-xs font-medium">{v}</span>
                        ))}
                    </div>
                </div>
            )}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <h4 className="text-xs font-bold text-text-main p-4 pb-2 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-emerald-500">calendar_month</span>
                    {t('panel.history.daily_records')}
                </h4>
                {history.dailyRecords.length === 0 ? (
                    <p className="text-center text-text-muted text-xs py-6">{t('panel.no_history')}</p>
                ) : (
                    <div className="overflow-x-auto">
                        {/* Encabezado de columnas */}
                        <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-50 border-b border-border-light text-[9px] font-bold text-text-muted uppercase tracking-wider">
                            <span className="w-16 flex-shrink-0">{t('panel.history.col.date')}</span>
                            <span className="w-20 flex-shrink-0">{t('panel.history.orchard')}</span>
                            <span className="w-16 flex-shrink-0">{t('panel.history.variety')}</span>
                            <span className="w-12 flex-shrink-0">{t('panel.history.col.bins')}</span>
                            <span className="w-10 flex-shrink-0">{t('panel.history.col.hours')}</span>
                            <span className="ml-auto">{t('panel.history.col.earned')}</span>
                        </div>
                        <div className="divide-y divide-border-light">
                            {[...history.dailyRecords].reverse().slice(0, 14).map(r => (
                                <div key={r.date} className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors text-xs">
                                    {/* Fecha */}
                                    <span className="text-text-muted w-16 flex-shrink-0">
                                        {new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(r.date + 'T12:00:00'))}
                                    </span>
                                    {/* Huerto */}
                                    <span className="text-text-muted truncate w-20 flex-shrink-0" title={r.orchard_name ?? '—'}>
                                        {r.orchard_name ?? '—'}
                                    </span>
                                    {/* Variedad */}
                                    <span className="text-text-muted truncate w-16 flex-shrink-0" title={r.variety ?? '—'}>
                                        {r.variety ?? '—'}
                                    </span>
                                    {/* Cubetas */}
                                    <span className="font-bold text-emerald-600 w-12 flex-shrink-0">{r.buckets} {t('panel.history.bins')}</span>
                                    {/* Horas */}
                                    <span
                                        className={`w-10 flex-shrink-0 ${r.estimated ? 'text-amber-600 font-bold' : 'text-text-muted'}`}
                                        title={r.estimated ? 'Estimated: shift not closed — check the timesheet' : undefined}
                                    >
                                        {r.hours.toFixed(1)}h{r.estimated ? '*' : ''}
                                    </span>
                                    {/* Ganado */}
                                    <span className="font-medium text-text-main ml-auto">${r.earnings.toFixed(0)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            {dailyBuckets.length > 1 && (
                <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                    <p className="text-xs text-text-muted mb-2">{t('panel.history.daily_output_title').replace('{n}', String(dailyBuckets.length))}</p>
                    <Sparkline data={dailyBuckets} color="#6366f1" />
                </div>
            )}
        </div>
    );
};

export default HistoryTab;
