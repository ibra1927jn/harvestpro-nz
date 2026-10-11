/**
 * Payroll tab sub-components
 *   SummaryCard, PayrollDashboard, TimesheetsTab, WageCalculatorTab, ExportTab
 */
import React, { useState, useEffect } from 'react';
import { TableVirtuoso } from 'react-virtuoso';
import { PickerBreakdown } from '@/services/payroll.service';
import { payrollService } from '@/services/payroll.service';
import { attendanceRepository } from '@/repositories/attendance.repository';
import { logger } from '@/utils/logger';
import { exportService, type ExportFormat } from '@/services/export.service';
import { logExportToHistory } from './ExportHistoryTab';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { PayWeekDetail } from './PayWeekDetail';

/* ── Summary Card ── */
export const SummaryCard: React.FC<{ icon: string; iconColor: string; label: string; value: string; highlight?: boolean }> = ({ icon, iconColor, label, value, highlight }) => (
    <div className={`rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border ${highlight ? 'bg-orange-50/90 border-orange-200 backdrop-blur-md' : 'bg-white/80 border-white/60 backdrop-blur-xl'}`}>
        <div className="flex items-center gap-3 mb-2">
            <span className={`material-symbols-outlined text-[20px] ${iconColor}`}>{icon}</span>
            <span className="text-[11px] uppercase tracking-widest text-slate-500 font-bold">{label}</span>
        </div>
        <p className={`text-3xl font-black tracking-tight ${highlight ? 'text-orange-600' : 'text-slate-800'}`}>{value}</p>
    </div>
);

/* ── Dashboard Tab ── */
export const PayrollDashboard: React.FC<{ pickers: PickerBreakdown[]; settings: { bucket_rate: number; min_wage_rate: number } }> = ({ pickers, settings }) => {
    const [detail, setDetail] = useState<PickerBreakdown | null>(null);
    return (
    <div className="space-y-4">
        {detail && <PayWeekDetail picker={detail} onClose={() => setDetail(null)} />}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-50"></div>
            <div className="flex items-center justify-between mb-5">
                <h3 className="font-extrabold text-slate-800 text-lg tracking-tight">Picker Breakdown</h3>
                <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-50/50 rounded-xl border border-slate-100/50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <span>Rate: ${settings.bucket_rate}/b</span>
                    <span className="text-slate-300">•</span>
                    <span>Min: ${settings.min_wage_rate}/h</span>
                </div>
            </div>

            {pickers.length === 0 ? (
                <div className="text-center py-10 text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    <span className="material-symbols-outlined text-5xl mb-3 block opacity-50">payments</span>
                    <p className="font-bold text-slate-500">No payroll data yet</p>
                    <p className="text-[11px] uppercase tracking-widest mt-1">Data will appear when scans are submitted</p>
                </div>
            ) : (
                <div className="overflow-x-auto dynamic-height rounded-2xl border border-slate-100 bg-white" style={{ '--h': `${Math.min(pickers.length * 48 + 52, 600)}px` } as React.CSSProperties}>
                    <TableVirtuoso
                        data={pickers}
                        fixedHeaderContent={() => (
                            <tr className="border-b border-slate-100/80 text-[10px] text-slate-400 font-bold uppercase tracking-widest bg-slate-50/80 backdrop-blur-md">
                                <th className="text-left py-3 px-4 font-bold">Worker</th>
                                <th className="text-right py-3 px-4 font-bold">Buckets</th>
                                <th className="text-right py-3 px-4 font-bold">Hours</th>
                                <th className="text-right py-3 px-4 font-bold">Piece Rate</th>
                                <th className="text-right py-3 px-4 font-bold">Top-Up</th>
                                <th className="text-right py-3 px-4 font-bold">Total</th>
                                <th className="text-center py-3 px-4 font-bold">Status</th>
                            </tr>
                        )}
                        itemContent={(_index, p) => (
                            <>
                                <td className="py-3 px-4 font-extrabold text-slate-700 text-sm">
                                    <button type="button" onClick={() => setDetail(p)} className="text-left hover:text-orange-600 hover:underline" title="Day-by-day detail">
                                        {p.picker_name}
                                    </button>
                                </td>
                                <td className="py-3 px-4 text-right text-slate-600 font-medium">{p.buckets}</td>
                                <td className="py-3 px-4 text-right text-slate-600 font-medium">
                                    {p.hours_worked.toFixed(1)}
                                    {p.hours_holiday && p.hours_holiday > 0 ? (
                                        <span
                                            title="Horas trabajadas en public holiday (Holidays Act 1.5x)"
                                            className="ml-1.5 inline-flex items-center rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-indigo-600"
                                        >
                                            {p.hours_holiday.toFixed(1)}h hol
                                        </span>
                                    ) : null}
                                    {p.alternative_holidays_owed && p.alternative_holidays_owed > 0 ? (
                                        <span
                                            data-testid={`alt-day-pill-${p.picker_id}`}
                                            title="Días alternativos en lieu (Holidays Act s.60)"
                                            className="ml-1.5 inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-violet-700"
                                        >
                                            +{p.alternative_holidays_owed}d alt
                                        </span>
                                    ) : null}
                                </td>
                                <td className="py-3 px-4 text-right text-slate-600 font-medium">${p.piece_rate_earnings.toFixed(0)}</td>
                                <td className={`py-3 px-4 text-right font-bold ${p.top_up_required > 0 ? 'text-amber-500' : 'text-slate-300'}`}>
                                    ${p.top_up_required.toFixed(0)}
                                </td>
                                <td className="py-3 px-4 text-right font-black text-slate-800">${p.total_earnings.toFixed(0)}</td>
                                <td className="py-3 px-4 text-center">
                                    {p.is_below_minimum ? (
                                        <span className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100 uppercase tracking-widest">
                                            <span className="material-symbols-outlined text-[14px]">shield</span> Shield
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase tracking-widest">
                                            <span className="material-symbols-outlined text-[14px]">check</span> OK
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

/* ── Timesheets Tab ── */
export const TimesheetsTab: React.FC<{ orchardId?: string }> = ({ orchardId }) => {
    const [timesheets, setTimesheets] = useState<import('@/services/payroll.service').TimesheetEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const loadTimesheets = async () => {
        if (!orchardId) { setIsLoading(false); return; }
        setIsLoading(true);
        const data = await payrollService.fetchTimesheets(orchardId);
        setTimesheets(data);
        setIsLoading(false);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { loadTimesheets(); }, [orchardId]);

    const handleApprove = async (id: string, name: string) => {
        const entry = timesheets.find(t => t.id === id);
        try {
            await payrollService.approveTimesheet(id, 'current_user', entry?.updated_at);
            setTimesheets(prev => prev.map(t => t.id === id ? { ...t, is_verified: true, verified_by: 'current_user' } : t));
            showToast(`Timesheet approved for ${name}`);
        } catch (err) {
            logger.error('[Payroll] Failed to approve timesheet:', err);
            showToast(`Failed to approve timesheet for ${name}`, 'error');
        }
    };

    const handleReject = async (id: string, name: string) => {
        try {
            await attendanceRepository.update(id, { rejected: true, rejected_at: new Date().toISOString() });
            setTimesheets(prev => prev.filter(t => t.id !== id));
            showToast(`Timesheet rejected for ${name}`, 'error');
        } catch (err) {
            logger.error('[Payroll] Failed to reject timesheet:', err);
            showToast(`Failed to reject timesheet for ${name}`, 'error');
        }
    };

    const pending = timesheets.filter(t => !t.is_verified);
    const approved = timesheets.filter(t => t.is_verified);

    return (
        <div className="space-y-4 relative">
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] text-[13px] font-bold flex items-center gap-2 ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    {toast.message}
                </div>
            )}

            <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-50"></div>
                <div className="flex items-center justify-between mb-5">
                    <h3 className="font-extrabold text-slate-800 text-lg tracking-tight">Pending Approval</h3>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-orange-50 text-orange-600 border border-orange-100 uppercase tracking-widest">{pending.length} Pending</span>
                </div>
                {isLoading ? (
                    <div className="text-center py-8 text-text-muted">
                        <div className="w-8 h-8 border-3 border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-xs">Loading timesheets...</p>
                    </div>
                ) : pending.length === 0 ? (
                    <div className="text-center py-8 text-text-muted">
                        <span className="material-symbols-outlined text-4xl mb-2 block">task_alt</span>
                        <p className="font-medium">All timesheets approved</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {pending.map(t => (
                            <div key={t.id} className="group relative bg-white/60 backdrop-blur-sm rounded-2xl p-5 border border-white hover:bg-white hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-all duration-300">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-bold text-slate-800 text-sm tracking-tight">{t.picker_name}</h4>
                                    <div className="flex items-baseline gap-1 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                                        <span className="text-sm font-black text-slate-700">{t.hours_worked.toFixed(1)}</span>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">HRS</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">
                                    <span>{t.check_in ? new Date(t.check_in).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                                    <span className="text-slate-300">→</span>
                                    <span>{t.check_out ? new Date(t.check_out).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' }) : 'Active'}</span>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleApprove(t.id, t.picker_name)} className="flex-1 py-2.5 rounded-xl bg-emerald-50 text-emerald-600 text-[11px] uppercase tracking-widest font-bold hover:bg-emerald-500 hover:text-white transition-all duration-300 flex items-center justify-center gap-1.5 shadow-sm">
                                        <span className="material-symbols-outlined text-[16px]">check</span>Approve
                                    </button>
                                    <button onClick={() => handleReject(t.id, t.picker_name)} className="flex-1 py-2.5 rounded-xl bg-red-50 text-red-600 text-[11px] uppercase tracking-widest font-bold hover:bg-red-500 hover:text-white transition-all duration-300 flex items-center justify-center gap-1.5 shadow-sm">
                                        <span className="material-symbols-outlined text-[16px]">close</span>Reject
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {approved.length > 0 && (
                <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-50"></div>
                    <h3 className="font-extrabold text-slate-800 text-lg tracking-tight mb-5">Approved <span className="text-slate-400 font-medium ml-1">({approved.length})</span></h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {approved.map(t => (
                            <div key={t.id} className="rounded-2xl p-4 border border-emerald-100/50 bg-emerald-50/40">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-bold text-slate-800 text-sm tracking-tight">{t.picker_name}</h4>
                                    <span className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-100/50 text-emerald-600 uppercase tracking-widest border border-emerald-100">
                                        <span className="material-symbols-outlined text-[14px]">check</span> Verified
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                                    <span className="bg-white px-2 py-0.5 rounded shadow-sm border border-slate-100">{t.hours_worked.toFixed(1)} HRS</span>
                                    <span className="text-slate-300">•</span>
                                    <span>
                                        {t.check_in ? new Date(t.check_in).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' }) : '—'} → {t.check_out ? new Date(t.check_out).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' }) : 'Active'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

/* ── Wage Calculator Tab ── */
export const WageCalculatorTab: React.FC<{ settings: { bucket_rate: number; min_wage_rate: number } }> = ({ settings }) => {
    const [buckets, setBuckets] = useState(0);
    const [hours, setHours] = useState(8);

    const pieceRate = buckets * settings.bucket_rate;
    const minimumRequired = hours * settings.min_wage_rate;
    const topUp = Math.max(0, minimumRequired - pieceRate);
    const total = pieceRate + topUp;

    return (
        <div className="max-w-lg space-y-4">
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-50"></div>
                <h3 className="font-extrabold text-slate-800 text-lg tracking-tight mb-5">Quick Wage Calculator</h3>
                <div className="space-y-4">
                    <div>
                        <label htmlFor="wage-calc-buckets" className="block text-[11px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 ml-1">Buckets Picked</label>
                        <input id="wage-calc-buckets" type="number" value={buckets} onChange={e => setBuckets(Number(e.target.value))} className="w-full px-5 py-3.5 rounded-2xl border border-slate-200/60 bg-white/50 text-slate-800 font-black focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10 outline-none transition-all" />
                    </div>
                    <div>
                        <label htmlFor="wage-calc-hours" className="block text-[11px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 ml-1">Hours Worked</label>
                        <input id="wage-calc-hours" type="number" step="0.5" value={hours} onChange={e => setHours(Number(e.target.value))} className="w-full px-5 py-3.5 rounded-2xl border border-slate-200/60 bg-white/50 text-slate-800 font-black focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10 outline-none transition-all" />
                    </div>
                </div>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden">
                <h3 className="font-extrabold text-slate-800 text-lg tracking-tight mb-4">Result</h3>
                <div className="space-y-3">
                    <div className="flex items-center justify-between py-1">
                        <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">Piece Rate <span className="font-medium normal-case tracking-normal">({buckets} × ${settings.bucket_rate})</span></span>
                        <span className="text-sm font-black text-slate-800">${pieceRate.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                        <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">Minimum Req. <span className="font-medium normal-case tracking-normal">({hours}h × ${settings.min_wage_rate})</span></span>
                        <span className="text-sm font-black text-slate-800">${minimumRequired.toFixed(2)}</span>
                    </div>
                    {topUp > 0 && (
                        <div className="flex justify-between py-1.5 text-amber-500 bg-amber-50/50 -mx-3 px-3 rounded-lg">
                            <span className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[16px]">shield</span>Wage Shield Top-Up
                            </span>
                            <span className="text-sm font-bold">+${topUp.toFixed(2)}</span>
                        </div>
                    )}
                    <div className="border-t border-slate-200/60 pt-4 mt-2 flex justify-between items-center">
                        <span className="text-[13px] font-bold text-slate-800 uppercase tracking-widest">Total Earnings</span>
                        <span className="text-3xl font-black text-orange-500">${total.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ── Export Tab ── */
/* ── Export Tab ── */
const EXPORT_FORMATS: { format: ExportFormat; label: string; desc: string; icon: string }[] = [
    { format: 'csv', label: 'CSV', desc: 'Excel / Google Sheets', icon: 'table_chart' },
    { format: 'xero', label: 'Xero', desc: 'Payroll import file', icon: 'account_balance' },
    { format: 'paysauce', label: 'PaySauce', desc: 'Bulk upload file', icon: 'cloud_upload' },
    { format: 'pdf', label: 'PDF Report', desc: 'Print or save as PDF', icon: 'picture_as_pdf' },
];

/**
 * Exporta la semana de pago seleccionada, con las mismas cifras que el resto
 * de la pantalla (calculate-payroll). Avisa si hay días con horas estimadas.
 */
export const ExportTab: React.FC<{
    pickers: PickerBreakdown[];
    week: { start: string; end: string; closesOn: string };
    isLoading?: boolean;
}> = ({ pickers, week, isLoading = false }) => {
    const crew = useHarvestStore(s => s.crew);
    const [lastExport, setLastExport] = useState<string | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);

    const codeById = new Map(crew.map(p => [p.id, p.picker_id]));
    const data = exportService.preparePayrollData(pickers, { start: week.start, end: week.end }, id => codeById.get(id));
    const toReview = data.crew.filter(p => (p.estimatedDays ?? 0) > 0);
    const disabled = isLoading || data.crew.length === 0;

    const handleExport = (format: ExportFormat) => {
        setExportError(null);
        try {
            const result = exportService.exportPayroll(format, data);
            logExportToHistory({
                format,
                date: data.date,
                filename: result.filename,
                recordCount: result.recordCount,
                totalEarnings: result.totalEarnings,
            });
            setLastExport(result.filename);
        } catch (err) {
            logger.error('[Payroll] Export failed:', err);
            setExportError('No se pudo generar el fichero.');
        }
    };

    return (
        <div className="space-y-4 max-w-2xl">
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60">
                <h3 className="font-extrabold text-slate-800 text-lg tracking-tight">Export pay week</h3>
                <p className="text-[13px] text-slate-500 font-medium mt-1">
                    {week.start} → {week.end} · closes Monday {week.closesOn}
                </p>
                <div className="grid grid-cols-3 gap-3 mt-4 text-center">
                    <div><p className="text-2xl font-black text-slate-800">{data.crew.length}</p><p className="text-[11px] uppercase tracking-widest font-bold text-slate-400">Pickers</p></div>
                    <div><p className="text-2xl font-black text-slate-800">{data.summary.totalHours.toFixed(1)}h</p><p className="text-[11px] uppercase tracking-widest font-bold text-slate-400">Hours</p></div>
                    <div><p className="text-2xl font-black text-orange-600">${data.summary.grandTotal.toFixed(2)}</p><p className="text-[11px] uppercase tracking-widest font-bold text-slate-400">Total pay</p></div>
                </div>
            </div>

            {toReview.length > 0 && (
                <div data-testid="export-estimated-warning" className="bg-amber-50/90 border border-amber-200 rounded-2xl px-5 py-4">
                    <p className="text-sm font-extrabold text-amber-900">
                        {toReview.length} picker{toReview.length === 1 ? '' : 's'} with estimated hours
                    </p>
                    <p className="text-[12px] text-amber-800 mt-1">
                        These shifts were never closed, so their hours are estimated from check-in to the last bucket.
                        Ask the team leader to fix the timesheets before paying: {toReview.slice(0, 6).map(p => p.name).join(', ')}{toReview.length > 6 ? '…' : ''}
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {EXPORT_FORMATS.map(exp => (
                    <button
                        key={exp.format}
                        type="button"
                        disabled={disabled}
                        onClick={() => handleExport(exp.format)}
                        className="group bg-white/80 backdrop-blur-xl rounded-2xl p-5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-white/60 flex items-center gap-4 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:bg-white transition-all duration-300 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="size-12 rounded-xl bg-orange-50 flex items-center justify-center group-hover:bg-orange-100 transition-colors">
                            <span className="material-symbols-outlined text-[24px] text-orange-500">{exp.icon}</span>
                        </div>
                        <div>
                            <h4 className="font-extrabold text-slate-800 text-sm tracking-tight">{exp.label}</h4>
                            <p className="text-[11px] uppercase tracking-widest font-bold text-slate-400 mt-0.5">{exp.desc}</p>
                        </div>
                    </button>
                ))}
            </div>

            {lastExport && (
                <p role="status" className="text-sm font-bold text-emerald-700">Downloaded {lastExport}</p>
            )}
            {exportError && (
                <p role="alert" className="text-sm font-bold text-red-600">{exportError}</p>
            )}
            {!isLoading && data.crew.length === 0 && (
                <p className="text-sm text-slate-500">No hours or buckets recorded in this pay week.</p>
            )}
        </div>
    );
};
