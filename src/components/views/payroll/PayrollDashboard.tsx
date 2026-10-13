/**
 * Panel de nómina: tarjeta resumen y desglose por picker.
 * (Movido sin cambios de marcado desde PayrollTabs.tsx.)
 */
import React, { useState } from 'react';
import { TableVirtuoso } from 'react-virtuoso';
import type { PickerBreakdown } from '@/services/payroll.service';
import { PayWeekDetail } from './PayWeekDetail';
import { useTranslation } from '@/i18n';
import { formatNZD } from '@/utils/nzFormat';

/* ── Summary Card ── */
export const SummaryCard: React.FC<{ icon: string; iconColor: string; label: string; value: string; highlight?: boolean }> = ({ icon, iconColor, label, value, highlight }) => (
    <div className={`rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border ${highlight ? 'bg-orange-50/90 border-orange-200 backdrop-blur-md' : 'bg-white/80 border-white/60 backdrop-blur-xl'}`}>
        <div className="flex items-center gap-3 mb-2">
            <span aria-hidden="true" className={`material-symbols-outlined text-[20px] ${iconColor}`}>{icon}</span>
            <span className="text-[11px] uppercase tracking-widest text-slate-500 font-bold">{label}</span>
        </div>
        <p className={`text-3xl font-black tracking-tight ${highlight ? 'text-orange-600' : 'text-slate-800'}`}>{value}</p>
    </div>
);

/* ── Dashboard Tab ── */
export const PayrollDashboard: React.FC<{ pickers: PickerBreakdown[]; settings: { bucket_rate: number; min_wage_rate: number } }> = ({ pickers, settings }) => {
    const [detail, setDetail] = useState<PickerBreakdown | null>(null);
    const { t } = useTranslation();
    return (
    <div className="space-y-4">
        {detail && <PayWeekDetail picker={detail} onClose={() => setDetail(null)} />}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-50"></div>
            <div className="flex items-center justify-between mb-5">
                <h3 className="font-extrabold text-slate-800 text-lg tracking-tight">{t('pay.picker_breakdown')}</h3>
                <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-50/50 rounded-xl border border-slate-100/50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <span>{t('pay.rate_per_bucket', { rate: formatNZD(settings.bucket_rate) })}</span>
                    <span className="text-slate-300">•</span>
                    <span>{t('pay.min_per_hour', { rate: formatNZD(settings.min_wage_rate) })}</span>
                </div>
            </div>

            {pickers.length === 0 ? (
                <div className="text-center py-10 text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    <span aria-hidden="true" className="material-symbols-outlined text-5xl mb-3 block opacity-50">payments</span>
                    <p className="font-bold text-slate-500">{t('pay.no_data')}</p>
                    <p className="text-[11px] uppercase tracking-widest mt-1">{t('pay.no_data_hint')}</p>
                </div>
            ) : (
                <div className="overflow-x-auto dynamic-height rounded-2xl border border-slate-100 bg-white" style={{ '--h': `${Math.min(pickers.length * 48 + 52, 600)}px` } as React.CSSProperties}>
                    <TableVirtuoso
                        data={pickers}
                        fixedHeaderContent={() => (
                            <tr className="border-b border-slate-100/80 text-[10px] text-slate-400 font-bold uppercase tracking-widest bg-slate-50/80 backdrop-blur-md">
                                <th className="text-left py-3 px-4 font-bold">{t('pay.col.worker')}</th>
                                <th className="text-right py-3 px-4 font-bold">{t('pay.col.buckets')}</th>
                                <th className="text-right py-3 px-4 font-bold">{t('pay.col.hours')}</th>
                                <th className="text-right py-3 px-4 font-bold">{t('pay.piece_rate')}</th>
                                <th className="text-right py-3 px-4 font-bold">{t('mgr.top_up')}</th>
                                <th className="text-right py-3 px-4 font-bold">{t('hr.pay.total')}</th>
                                <th className="text-center py-3 px-4 font-bold">{t('hr.status')}</th>
                            </tr>
                        )}
                        itemContent={(_index, p) => (
                            <>
                                <td className="py-3 px-4 font-extrabold text-slate-700 text-sm">
                                    <button type="button" onClick={() => setDetail(p)} className="text-left hover:text-orange-600 hover:underline" title={t('pay.day_detail')}>
                                        {p.picker_name}
                                    </button>
                                </td>
                                <td className="py-3 px-4 text-right text-slate-600 font-medium">{p.buckets}</td>
                                <td className="py-3 px-4 text-right text-slate-600 font-medium">
                                    {p.hours_worked.toFixed(1)}
                                    {p.hours_holiday && p.hours_holiday > 0 ? (
                                        <span
                                            title={t('pay.holiday_hours_title')}
                                            className="ml-1.5 inline-flex items-center rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-indigo-600"
                                        >
                                            {t('pay.holiday_hours', { n: p.hours_holiday.toFixed(1) })}
                                        </span>
                                    ) : null}
                                    {p.alternative_holidays_owed && p.alternative_holidays_owed > 0 ? (
                                        <span
                                            data-testid={`alt-day-pill-${p.picker_id}`}
                                            title={t('pay.alt_days_title')}
                                            className="ml-1.5 inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-violet-700"
                                        >
                                            {t('pay.alt_days_pill', { n: p.alternative_holidays_owed })}
                                        </span>
                                    ) : null}
                                </td>
                                <td className="py-3 px-4 text-right text-slate-600 font-medium">{formatNZD(p.piece_rate_earnings, 0)}</td>
                                <td className={`py-3 px-4 text-right font-bold ${p.top_up_required > 0 ? 'text-amber-500' : 'text-slate-300'}`}>
                                    {formatNZD(p.top_up_required, 0)}
                                </td>
                                <td className="py-3 px-4 text-right font-black text-slate-800">{formatNZD(p.total_earnings, 0)}</td>
                                <td className="py-3 px-4 text-center">
                                    {p.is_below_minimum ? (
                                        <span className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100 uppercase tracking-widest">
                                            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">shield</span> {t('pay.shield')}
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase tracking-widest">
                                            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">check</span> OK
                                        </span>
                                    )}
                                </td>
                            </>
                        )}
                    />
                </div>
            )}
        </div>
    </div>
    );
};
