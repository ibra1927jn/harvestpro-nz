/**
 * Pestaña de fichajes: aprobar o rechazar timesheets pendientes.
 * (Movido sin cambios de marcado desde PayrollTabs.tsx.)
 */
import React, { useState, useEffect } from 'react';
import { payrollService } from '@/services/payroll.service';
import { attendanceRepository } from '@/repositories/attendance.repository';
import { logger } from '@/utils/logger';
import { nzClock } from './payrollTabsLogic';
import { useTranslation } from '@/i18n';

/* ── Timesheets Tab ── */
export const TimesheetsTab: React.FC<{ orchardId?: string }> = ({ orchardId }) => {
    const [timesheets, setTimesheets] = useState<import('@/services/payroll.service').TimesheetEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { t } = useTranslation();
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
        const entry = timesheets.find(ts => ts.id === id);
        try {
            await payrollService.approveTimesheet(id, 'current_user', entry?.updated_at);
            setTimesheets(prev => prev.map(ts => ts.id === id ? { ...ts, is_verified: true, verified_by: 'current_user' } : ts));
            showToast(t('pay.ts.approved_for', { name }));
        } catch (err) {
            logger.error('[Payroll] Failed to approve timesheet:', err);
            showToast(t('pay.ts.approve_failed', { name }), 'error');
        }
    };

    const handleReject = async (id: string, name: string) => {
        try {
            await attendanceRepository.update(id, { rejected: true, rejected_at: new Date().toISOString() });
            setTimesheets(prev => prev.filter(ts => ts.id !== id));
            showToast(t('pay.ts.rejected_for', { name }), 'error');
        } catch (err) {
            logger.error('[Payroll] Failed to reject timesheet:', err);
            showToast(t('pay.ts.reject_failed', { name }), 'error');
        }
    };

    const pending = timesheets.filter(ts => !ts.is_verified);
    const approved = timesheets.filter(ts => ts.is_verified);

    return (
        <div className="space-y-4 relative">
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] text-[13px] font-bold flex items-center gap-2 ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px]">check_circle</span>
                    {toast.message}
                </div>
            )}

            <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-50"></div>
                <div className="flex items-center justify-between mb-5">
                    <h3 className="font-extrabold text-slate-800 text-lg tracking-tight">{t('pay.ts.pending_approval')}</h3>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-orange-50 text-orange-600 border border-orange-100 uppercase tracking-widest">{t('pay.ts.pending_count', { n: pending.length })}</span>
                </div>
                {isLoading ? (
                    <div className="text-center py-8 text-text-muted">
                        <div className="w-8 h-8 border-3 border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-xs">{t('pay.ts.loading')}</p>
                    </div>
                ) : pending.length === 0 ? (
                    <div className="text-center py-8 text-text-muted">
                        <span aria-hidden="true" className="material-symbols-outlined text-4xl mb-2 block">task_alt</span>
                        <p className="font-medium">{t('pay.ts.all_approved')}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {pending.map(ts => (
                            <div key={ts.id} className="group relative bg-white/60 backdrop-blur-sm rounded-2xl p-5 border border-white hover:bg-white hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-all duration-300">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-bold text-slate-800 text-sm tracking-tight">{ts.picker_name}</h4>
                                    <div className="flex items-baseline gap-1 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                                        <span className="text-sm font-black text-slate-700">{ts.hours_worked.toFixed(1)}</span>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('pay.ts.hrs')}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">
                                    <span>{nzClock(ts.check_in, '—')}</span>
                                    <span className="text-slate-300">→</span>
                                    <span>{nzClock(ts.check_out, t('common.active'))}</span>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleApprove(ts.id, ts.picker_name)} className="flex-1 py-2.5 rounded-xl bg-emerald-50 text-emerald-600 text-[11px] uppercase tracking-widest font-bold hover:bg-emerald-500 hover:text-white transition-all duration-300 flex items-center justify-center gap-1.5 shadow-sm">
                                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">check</span>{t('pay.ts.approve')}
                                    </button>
                                    <button onClick={() => handleReject(ts.id, ts.picker_name)} className="flex-1 py-2.5 rounded-xl bg-red-50 text-red-600 text-[11px] uppercase tracking-widest font-bold hover:bg-red-500 hover:text-white transition-all duration-300 flex items-center justify-center gap-1.5 shadow-sm">
                                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">close</span>{t('pay.ts.reject')}
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
                    <h3 className="font-extrabold text-slate-800 text-lg tracking-tight mb-5">{t('status.approved')} <span className="text-slate-400 font-medium ml-1">({approved.length})</span></h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {approved.map(ts => (
                            <div key={ts.id} className="rounded-2xl p-4 border border-emerald-100/50 bg-emerald-50/40">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-bold text-slate-800 text-sm tracking-tight">{ts.picker_name}</h4>
                                    <span className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-100/50 text-emerald-600 uppercase tracking-widest border border-emerald-100">
                                        <span aria-hidden="true" className="material-symbols-outlined text-[14px]">check</span> {t('pay.ts.verified')}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                                    <span className="bg-white px-2 py-0.5 rounded shadow-sm border border-slate-100">{ts.hours_worked.toFixed(1)} {t('pay.ts.hrs')}</span>
                                    <span className="text-slate-300">•</span>
                                    <span>
                                        {nzClock(ts.check_in, '—')} → {nzClock(ts.check_out, t('common.active'))}
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
