/**
 * MyTimesheetView — «Mi hoja»: los tramos de la persona que ha iniciado sesión.
 *
 * Antes la pestaña Timesheet del runner era el editor del manager (todo el
 * huerto, un fichaje por fila, botón «Editar» que acababa en 403). Ahora:
 *   - solo los tramos propios, por semana de pago (lunes–domingo NZ);
 *   - horas, descanso y estado (abierto / cerrado / aprobado / rechazado);
 *   - «Pedir corrección»: mensaje al manager del huerto con lo que propone la
 *     persona; nadie se corrige a sí mismo.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/i18n';
import { myTimesheetService, payWeekAt, type MyShift } from '@/services/my-timesheet.service';
import { formatNZDate, formatNZTime } from '@/utils/nzFormat';
import { logger } from '@/utils/logger';
import { useToast } from '@/hooks/useToast';
import Toast from '@/components/ui/Toast';
import EmptyState from '@/components/ui/EmptyState';

const STATUS_STYLE: Record<MyShift['status'], { key: string; className: string; icon: string }> = {
    open: { key: 'runner.myts.status_open', className: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: 'radio_button_checked' },
    closed: { key: 'runner.myts.status_closed', className: 'bg-slate-100 text-slate-600 border-slate-200', icon: 'check' },
    approved: { key: 'runner.myts.status_approved', className: 'bg-indigo-50 text-indigo-700 border-indigo-100', icon: 'verified' },
    rejected: { key: 'runner.myts.status_rejected', className: 'bg-red-50 text-red-700 border-red-100', icon: 'block' },
};

function fmtHours(h: number): string {
    return `${Math.round(h * 100) / 100}`;
}

interface CorrectionFormProps {
    shift: MyShift;
    onCancel: () => void;
    onSend: (text: string) => Promise<void>;
}

/** Formulario de «Pedir corrección» de un tramo */
const CorrectionForm: React.FC<CorrectionFormProps> = ({ shift, onCancel, onSend }) => {
    const { t } = useTranslation();
    const [checkIn, setCheckIn] = useState(shift.checkIn ? formatNZTime(shift.checkIn) : '');
    const [checkOut, setCheckOut] = useState(shift.checkOut ? formatNZTime(shift.checkOut) : '');
    const [breakMinutes, setBreakMinutes] = useState(shift.breakMinutes != null ? String(shift.breakMinutes) : '');
    const [reason, setReason] = useState('');
    const [sending, setSending] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reason.trim()) return;
        setSending(true);
        try {
            const lines = [
                t('runner.myts.msg_title', { date: formatNZDate(shift.date, 'medium') }),
                t('runner.myts.msg_current', {
                    in: shift.checkIn ? formatNZTime(shift.checkIn) : '—',
                    out: shift.checkOut ? formatNZTime(shift.checkOut) : '—',
                    brk: shift.breakMinutes ?? 0,
                }),
                t('runner.myts.msg_proposed', { in: checkIn || '—', out: checkOut || '—', brk: breakMinutes || '0' }),
                t('runner.myts.msg_reason', { reason: reason.trim() }),
                t('runner.myts.msg_ref', { id: shift.id }),
            ];
            await onSend(lines.join('\n'));
        } finally {
            setSending(false);
        }
    };

    const field = 'w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-text-main focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none';

    return (
        <form onSubmit={submit} className="mt-3 border-t border-slate-100 pt-3 space-y-3" aria-label={t('runner.myts.request_correction')}>
            <div className="grid grid-cols-3 gap-2">
                <label className="text-[11px] font-bold text-slate-500">{t('runner.myts.check_in')}
                    <input type="time" className={field} value={checkIn} onChange={e => setCheckIn(e.target.value)} />
                </label>
                <label className="text-[11px] font-bold text-slate-500">{t('runner.myts.check_out')}
                    <input type="time" className={field} value={checkOut} onChange={e => setCheckOut(e.target.value)} />
                </label>
                <label className="text-[11px] font-bold text-slate-500">{t('runner.myts.break_min')}
                    <input type="number" min={0} max={180} step={5} className={field} value={breakMinutes} onChange={e => setBreakMinutes(e.target.value)} />
                </label>
            </div>
            <label className="block text-[11px] font-bold text-slate-500">{t('runner.myts.reason')}
                <textarea className={field} rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder={t('runner.myts.reason_placeholder')} required />
            </label>
            <div className="flex gap-2 justify-end">
                <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 min-h-[44px]">
                    {t('common.cancel')}
                </button>
                <button type="submit" disabled={sending || !reason.trim()} className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-primary disabled:opacity-50 min-h-[44px] flex items-center gap-1.5">
                    <span aria-hidden="true" className="material-symbols-outlined text-base">send</span>
                    {sending ? t('runner.myts.sending') : t('runner.myts.send_request')}
                </button>
            </div>
        </form>
    );
};

const MyTimesheetView: React.FC = () => {
    const { t } = useTranslation();
    const { appUser } = useAuth();
    const { toast, showToast, hideToast } = useToast();
    const [weekOffset, setWeekOffset] = useState(0);
    const [shifts, setShifts] = useState<MyShift[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const week = useMemo(() => payWeekAt(weekOffset), [weekOffset]);

    const load = useCallback(async () => {
        if (!appUser?.id) return;
        setLoading(true);
        setFailed(false);
        try {
            setShifts(await myTimesheetService.fetchMyShifts(appUser.id, week.start, week.end));
        } catch (e) {
            logger.error('[MyTimesheet] load failed', e);
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [appUser?.id, week.start, week.end]);

    useEffect(() => { void load(); }, [load]);

    const totalHours = useMemo(() => shifts.reduce((s, x) => s + x.hours, 0), [shifts]);
    const daysWorked = useMemo(() => new Set(shifts.filter(s => s.hours > 0).map(s => s.date)).size, [shifts]);

    const sendCorrection = async (text: string) => {
        if (!appUser?.id || !appUser.orchard_id) return;
        // La solicitud busca al manager y abre el chat en el servidor: sin red no
        // se puede encolar; se avisa claro y el formulario se queda relleno.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            showToast(t('runner.myts.needs_network'), 'warning');
            return;
        }
        try {
            const sent = await myTimesheetService.requestCorrection({ userId: appUser.id, orchardId: appUser.orchard_id, content: text });
            if (sent > 0) {
                showToast(t('runner.myts.request_sent'), 'success');
                setEditingId(null);
            } else {
                showToast(t('runner.myts.no_manager'), 'warning');
            }
        } catch (e) {
            logger.error('[MyTimesheet] correction request failed', e);
            const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
            if (offline) showToast(t('runner.myts.needs_network'), 'error');
            else showToast(t('runner.myts.request_failed'), 'error');
        }
    };

    return (
        <div className="p-4 space-y-4 pb-24">
            {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
            {/* Cabecera: semana de pago */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-center justify-between gap-2">
                    <button type="button" aria-label={t('runner.myts.prev_week')} onClick={() => setWeekOffset(w => w - 1)} className="size-11 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 active:scale-95">
                        <span aria-hidden="true" className="material-symbols-outlined">chevron_left</span>
                    </button>
                    <div className="text-center">
                        <h2 className="text-base font-black text-text-main">{t('runner.myts.title')}</h2>
                        <p className="text-xs text-text-sub font-medium">
                            {weekOffset === 0 ? t('runner.myts.this_week') : `${formatNZDate(week.start, 'medium')} – ${formatNZDate(week.end, 'medium')}`}
                        </p>
                    </div>
                    <button type="button" aria-label={t('runner.myts.next_week')} disabled={weekOffset >= 0} onClick={() => setWeekOffset(w => w + 1)} className="size-11 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 active:scale-95 disabled:opacity-30">
                        <span aria-hidden="true" className="material-symbols-outlined">chevron_right</span>
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="rounded-xl bg-slate-50 p-3 text-center">
                        <p className="text-2xl font-black text-text-main tabular-nums">{fmtHours(totalHours)}</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('runner.myts.hours_week')}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 text-center">
                        <p className="text-2xl font-black text-text-main tabular-nums">{daysWorked}</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('runner.myts.days_worked')}</p>
                    </div>
                </div>
                <p className="text-[11px] text-text-muted mt-3">{t('runner.myts.self_note')}</p>
            </div>

            {/* Tramos */}
            {loading ? (
                <div className="flex justify-center py-10" role="status" aria-busy="true">
                    <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
                </div>
            ) : failed ? (
                <EmptyState icon="cloud_off" title={t('runner.myts.load_failed')} subtitle="" action={{ label: t('common.retry'), onClick: () => { void load(); }, icon: 'refresh' }} />
            ) : shifts.length === 0 ? (
                <EmptyState icon="event_busy" title={t('runner.myts.empty_title')} subtitle={t('runner.myts.empty_desc')} iconColor="text-slate-400" />
            ) : (
                <ul className="space-y-3" aria-label={t('runner.myts.title')}>
                    {shifts.map(shift => {
                        const st = STATUS_STYLE[shift.status];
                        return (
                            <li key={shift.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4" data-testid="my-shift">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-black text-text-main">{formatNZDate(shift.date, 'weekdayShort')}</p>
                                        <p className="text-xs text-text-sub mt-0.5 tabular-nums">
                                            {shift.checkIn ? formatNZTime(shift.checkIn) : '—'} → {shift.checkOut ? formatNZTime(shift.checkOut) : t('runner.myts.still_in')}
                                            {shift.breakMinutes ? ` · ${t('runner.myts.break_n', { n: shift.breakMinutes })}` : ''}
                                        </p>
                                        {shift.correctedAt && (
                                            <p className="text-[11px] text-amber-700 mt-1">{t('runner.myts.corrected', { reason: shift.correctionReason ?? '' })}</p>
                                        )}
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-lg font-black text-text-main tabular-nums">{fmtHours(shift.hours)} h</p>
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${st.className}`}>
                                            <span aria-hidden="true" className="material-symbols-outlined text-[12px]">{st.icon}</span>
                                            {t(st.key)}
                                        </span>
                                    </div>
                                </div>
                                {editingId === shift.id ? (
                                    <CorrectionForm shift={shift} onCancel={() => setEditingId(null)} onSend={sendCorrection} />
                                ) : (
                                    <button type="button" onClick={() => setEditingId(shift.id)} className="mt-3 text-xs font-bold text-primary flex items-center gap-1 min-h-[44px]">
                                        <span aria-hidden="true" className="material-symbols-outlined text-base">edit_note</span>
                                        {t('runner.myts.request_correction')}
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default MyTimesheetView;
