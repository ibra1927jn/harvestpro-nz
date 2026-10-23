/**
 * Pestaña de fichajes: aprobar o rechazar timesheets pendientes.
 * - Un turno abierto (sin salida) no se aprueba: el botón sale deshabilitado
 *   con el motivo y «Aprobar todas» lo salta y lo dice (el servidor también
 *   lo rechaza: SHIFT_OPEN).
 * - Rechazar pide el motivo (3–200 caracteres): vuelve a quien corrige.
 */
import React, { useState, useEffect } from 'react';
import { payrollService } from '@/services/payroll.service';
import { logger } from '@/utils/logger';
import { nzClock } from './payrollTabsLogic';
import { useTranslation } from '@/i18n';
import { useLeaveOnDay } from '@/hooks/useLeave';
import { useAttendanceLiveRefresh } from '@/hooks/useAttendanceLiveRefresh';
import { useHarvestStore } from '@/stores/useHarvestStore';

/* ── Timesheets Tab ── */
export const TimesheetsTab: React.FC<{ orchardId?: string }> = ({ orchardId }) => {
    const [timesheets, setTimesheets] = useState<import('@/services/payroll.service').TimesheetEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { t } = useTranslation();
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    // Ausencias aprobadas de hoy: se marcan (el pago de la ausencia lo hace el programa de nóminas)
    const leaveToday = useLeaveOnDay(orchardId);
    const crew = useHarvestStore(s => s.crew);
    const leaveBadge = (pickerId: string) => {
        const leave = leaveToday.get(pickerId);
        return leave ? (
            <span data-testid={`ts-on-leave-${pickerId}`} className="ml-2 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                {t('comms.on_leave_type', { type: t(`leave.type.${leave.type}`) })}
            </span>
        ) : null;
    };
    const onLeaveNames = [...leaveToday.values()].map(l => ({
        id: l.picker_id,
        type: l.type,
        halfDay: l.half_day,
        name: (Array.isArray(crew) ? crew : []).find(p => p.id === l.picker_id)?.name || timesheets.find(ts => ts.picker_id === l.picker_id)?.picker_name || '—',
    }));
    // Rechazo en curso: id de la hoja y motivo que se está escribiendo
    const [rejecting, setRejecting] = useState<{ id: string; reason: string } | null>(null);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    /** soft: refresco en vivo, sin el indicador de carga (la lista sigue en pantalla) */
    const loadTimesheets = async (soft = false) => {
        if (!orchardId) { setIsLoading(false); return; }
        if (!soft) setIsLoading(true);
        const data = await payrollService.fetchTimesheets(orchardId);
        setTimesheets(data);
        setIsLoading(false);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { loadTimesheets(); }, [orchardId]);
    // En vivo: un fichaje nuevo o corregido (realtime de daily_attendance) o volver a la pestaña
    useAttendanceLiveRefresh(() => { void loadTimesheets(true); }, { enabled: !!orchardId });

    /** Semana de pago cerrada: mensaje propio (si no, el genérico) */
    const failureMessage = (err: unknown, fallbackKey: 'pay.ts.approve_failed' | 'pay.ts.reject_failed', name: string) =>
        err instanceof Error && err.message.includes('PAY_WEEK_CLOSED')
            ? t('pay.ts.week_closed', { name })
            : t(fallbackKey, { name });

    const handleApprove = async (id: string, name: string) => {
        const entry = timesheets.find(ts => ts.id === id);
        try {
            const res = await payrollService.approveTimesheet(id, 'current_user', entry?.updated_at);
            setTimesheets(prev => prev.map(ts => ts.id === id
                ? { ...ts, is_verified: true, is_rejected: false, verified_by: 'current_user', updated_at: res?.updated_at ?? ts.updated_at }
                : ts));
            showToast(t('pay.ts.approved_for', { name }));
        } catch (err) {
            logger.error('[Payroll] Failed to approve timesheet:', err);
            showToast(failureMessage(err, 'pay.ts.approve_failed', name), 'error');
        }
    };

    // Rechazar: en el servidor (approve-timesheet, decision 'reject'). Antes se
    // escribían columnas inexistentes con la sesión del usuario y siempre fallaba.
    const handleReject = async (id: string, name: string, reason: string) => {
        const entry = timesheets.find(ts => ts.id === id);
        try {
            const res = await payrollService.rejectTimesheet(id, entry?.updated_at, reason);
            setRejecting(null);
            setTimesheets(prev => prev.map(ts => ts.id === id
                ? { ...ts, is_verified: false, is_rejected: true, verified_by: null, rejection_reason: reason, updated_at: res?.updated_at ?? ts.updated_at }
                : ts));
            showToast(t('pay.ts.rejected_for', { name }), 'error');
        } catch (err) {
            logger.error('[Payroll] Failed to reject timesheet:', err);
            showToast(failureMessage(err, 'pay.ts.reject_failed', name), 'error');
        }
    };

    const pending = timesheets.filter(ts => !ts.is_verified && !ts.is_rejected);
    // «Aprobar todas»: solo las hojas cerradas (con salida); una por una eran
    // cientos de clics al día con una cuadrilla grande
    const completePending = pending.filter(ts => !!ts.check_out && !ts.long_shift);
    // Turnos abiertos y de más de 14 h sin corregir: no se aprueban todavía
    const openPending = pending.length - completePending.length;
    const [isApprovingAll, setIsApprovingAll] = useState(false);
    const handleApproveAll = async () => {
        if (completePending.length === 0 || isApprovingAll) return;
        const skippedNote = openPending > 0 ? `\n${t('pay.ts.approve_all_skipped', { count: openPending })}` : '';
        if (!window.confirm(t('pay.ts.approve_all_confirm', { count: completePending.length }) + skippedNote)) return;
        setIsApprovingAll(true);
        try {
            const { approved, failed } = await payrollService.approveTimesheets(
                completePending.map(ts => ({ id: ts.id, updated_at: ts.updated_at }))
            );
            const byId = new Map(approved.map(a => [a.id, a.updated_at]));
            setTimesheets(prev => prev.map(ts => byId.has(ts.id)
                ? { ...ts, is_verified: true, is_rejected: false, verified_by: 'current_user', updated_at: byId.get(ts.id) ?? ts.updated_at }
                : ts));
            if (approved.length > 0) {
                const skipped = openPending > 0 ? ` · ${t('pay.ts.approve_all_skipped', { count: openPending })}` : '';
                showToast(t('pay.ts.approved_all', { count: approved.length }) + skipped);
            }
            if (failed.length > 0) showToast(t('pay.ts.approve_all_failed', { count: failed.length }), 'error');
        } catch (err) {
            logger.error('[Payroll] Failed to approve all timesheets:', err);
            showToast(t('pay.ts.approve_all_failed', { count: completePending.length }), 'error');
        } finally {
            setIsApprovingAll(false);
        }
    };
    const approved = timesheets.filter(ts => ts.is_verified);
    const rejected = timesheets.filter(ts => ts.is_rejected);

    return (
        <div className="space-y-4 relative">
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] text-[13px] font-bold flex items-center gap-2 ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{toast.type === 'success' ? 'check_circle' : 'error'}</span>
                    {toast.message}
                </div>
            )}

            {onLeaveNames.length > 0 && (
                <div data-testid="ts-on-leave-today" className="bg-amber-50/80 border border-amber-200/60 rounded-2xl px-5 py-3">
                    <p className="text-sm font-extrabold text-amber-900 flex items-center gap-2">
                        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">event_busy</span>
                        {t('comms.ts_on_leave_title', { n: onLeaveNames.length })}
                    </p>
                    <p className="text-xs text-amber-800 mt-1">
                        {onLeaveNames.map(p => `${p.name} (${t(`leave.type.${p.type}`)}${p.halfDay ? ` · ${t('hr.agenda.half_day')}` : ''})`).join(', ')}
                    </p>
                    <p className="text-[11px] text-amber-700/80 mt-1">{t('comms.ts_on_leave_hint')}</p>
                </div>
            )}

            <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-50"></div>
                <div className="flex items-center justify-between mb-5">
                    <h3 className="font-extrabold text-slate-800 text-lg tracking-tight">{t('pay.ts.pending_approval')}</h3>
                    <div className="flex items-center gap-2">
                        {completePending.length > 1 && openPending > 0 && (
                            <span className="text-[10px] font-bold text-slate-500">{t('pay.ts.approve_all_skipped', { count: openPending })}</span>
                        )}
                        {completePending.length > 1 && (
                            <button
                                onClick={handleApproveAll}
                                disabled={isApprovingAll}
                                className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-emerald-600 text-white uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                            >
                                {t('pay.ts.approve_all', { count: completePending.length })}
                            </button>
                        )}
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-orange-50 text-orange-600 border border-orange-100 uppercase tracking-widest">{t('pay.ts.pending_count', { n: pending.length })}</span>
                    </div>
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
                                    <h4 className="font-bold text-slate-800 text-sm tracking-tight">{ts.picker_name}{leaveBadge(ts.picker_id)}</h4>
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
                                {!ts.check_out ? (
                                    <p id={`open-shift-${ts.id}`} className="mb-3 text-[11px] font-medium text-amber-700">
                                        {t(ts.long_shift ? 'pay.ts.long_open_shift' : 'pay.ts.open_shift_no_approve')}
                                    </p>
                                ) : ts.long_shift ? (
                                    <p id={`open-shift-${ts.id}`} data-testid="ts-long-shift" className="mb-3 text-[11px] font-medium text-red-700">{t('pay.ts.long_shift_no_approve')}</p>
                                ) : null}
                                {rejecting?.id === ts.id ? (
                                    <RejectReasonForm
                                        id={ts.id}
                                        reason={rejecting.reason}
                                        onChange={reason => setRejecting({ id: ts.id, reason })}
                                        onCancel={() => setRejecting(null)}
                                        onConfirm={() => handleReject(ts.id, ts.picker_name, rejecting.reason.trim())}
                                    />
                                ) : (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleApprove(ts.id, ts.picker_name)}
                                        disabled={!ts.check_out || !!ts.long_shift}
                                        aria-describedby={!ts.check_out || ts.long_shift ? `open-shift-${ts.id}` : undefined}
                                        className="flex-1 py-2.5 rounded-xl bg-emerald-50 text-emerald-600 text-[11px] uppercase tracking-widest font-bold hover:bg-emerald-500 hover:text-white transition-all duration-300 flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-50 disabled:hover:text-emerald-600"
                                    >
                                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">check</span>{t('pay.ts.approve')}
                                    </button>
                                    <button onClick={() => setRejecting({ id: ts.id, reason: '' })} className="flex-1 py-2.5 rounded-xl bg-red-50 text-red-600 text-[11px] uppercase tracking-widest font-bold hover:bg-red-500 hover:text-white transition-all duration-300 flex items-center justify-center gap-1.5 shadow-sm">
                                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">close</span>{t('pay.ts.reject')}
                                    </button>
                                </div>
                                )}
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
                                    <h4 className="font-bold text-slate-800 text-sm tracking-tight">{ts.picker_name}{leaveBadge(ts.picker_id)}</h4>
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

            {rejected.length > 0 && (
                <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden">
                    <h3 className="font-extrabold text-slate-800 text-lg tracking-tight mb-5">{t('status.rejected')} <span className="text-slate-400 font-medium ml-1">({rejected.length})</span></h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {rejected.map(ts => (
                            <div key={ts.id} className="rounded-2xl p-4 border border-red-100/50 bg-red-50/40">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-bold text-slate-800 text-sm tracking-tight">{ts.picker_name}{leaveBadge(ts.picker_id)}</h4>
                                    <span className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-red-100/50 text-red-600 uppercase tracking-widest border border-red-100">
                                        <span aria-hidden="true" className="material-symbols-outlined text-[14px]">close</span> {t('status.rejected')}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                                    <span className="bg-white px-2 py-0.5 rounded shadow-sm border border-slate-100">{ts.hours_worked.toFixed(1)} {t('pay.ts.hrs')}</span>
                                    <span className="text-slate-300">•</span>
                                    <span>
                                        {nzClock(ts.check_in, '—')} → {nzClock(ts.check_out, t('common.active'))}
                                    </span>
                                </div>
                                {ts.rejection_reason && <p className="mt-2 text-xs text-slate-600">{ts.rejection_reason}</p>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

/** Motivo del rechazo (obligatorio, 3–200 caracteres): vuelve a quien corrige la hoja */
const REJECT_REASON_MIN = 3;
const REJECT_REASON_MAX = 200;

const RejectReasonForm: React.FC<{
    id: string;
    reason: string;
    onChange: (reason: string) => void;
    onCancel: () => void;
    onConfirm: () => void;
}> = ({ id, reason, onChange, onCancel, onConfirm }) => {
    const { t } = useTranslation();
    const length = reason.trim().length;
    const valid = length >= REJECT_REASON_MIN && length <= REJECT_REASON_MAX;
    return (
        <div className="space-y-2">
            <label htmlFor={`reject-reason-${id}`} className="block text-[11px] font-bold text-slate-600">
                {t('pay.ts.reject_reason_label')}
            </label>
            <textarea
                id={`reject-reason-${id}`}
                value={reason}
                onChange={e => onChange(e.target.value)}
                maxLength={REJECT_REASON_MAX}
                rows={2}
                autoFocus
                placeholder={t('pay.ts.reject_reason_placeholder')}
                aria-describedby={`reject-reason-hint-${id}`}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-200"
            />
            <p id={`reject-reason-hint-${id}`} className={`text-[11px] ${valid || length === 0 ? 'text-slate-400' : 'text-red-600'}`}>
                {t('pay.ts.reject_reason_hint', { n: length, max: REJECT_REASON_MAX })}
            </p>
            <div className="flex gap-2">
                <button onClick={onCancel} className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-600 text-[11px] uppercase tracking-widest font-bold hover:bg-slate-200 transition-colors">
                    {t('common.cancel')}
                </button>
                <button
                    onClick={onConfirm}
                    disabled={!valid}
                    className="flex-1 py-2 rounded-xl bg-red-600 text-white text-[11px] uppercase tracking-widest font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {t('pay.ts.reject_confirm')}
                </button>
            </div>
        </div>
    );
};
