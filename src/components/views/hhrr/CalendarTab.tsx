/**
 * CalendarTab.tsx — Agenda de RRHH
 *
 * Calendario de la plantilla por mes (cuadrícula) y por semana (lista):
 * ausencias y permisos (leave_requests: solicitadas en ámbar, aprobadas con
 * color por tipo), vencimientos de visado y de contrato (de los datos que ya
 * carga useHHRR) y festivos NZ. Botón «Nueva ausencia» y, en cada ausencia,
 * aprobar / rechazar (con nota) y cancelar.
 *
 * El antiguo «Horario de hoy» (descansos calculados entre inicio y fin de
 * turno del huerto) se quitó: no hay hora de fin de turno, cada persona ficha
 * su salida (revisión 21-10, punto 5). Queda un recordatorio legal fijo.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { leaveService, type LeaveRequest, type NewLeaveInput } from '@/services/leave.service';
import type { Employee } from '@/services/hhrr/hhrr.types';
import {
    NZ_REST_BREAK_INTERVAL_HOURS,
    NZ_REST_BREAK_DURATION_MINUTES,
    NZ_MEAL_BREAK_INTERVAL_HOURS,
    NZ_MEAL_BREAK_DURATION_MINUTES,
    isPublicHoliday,
} from '@/constants/nz-law';
import { todayNZST, addDaysYMD } from '@/utils/nzst';
import { formatNZDate, NZ_LOCALE } from '@/utils/nzFormat';
import { logger } from '@/utils/logger';
import { statusLabel } from '@/i18n/statusLabel';
import type { TFunction } from '@/i18n';
import { useTranslation } from '@/i18n';
import NewLeaveModal from './agenda/NewLeaveModal';
import Toast from '@/components/ui/Toast';
import { useToast } from '@/hooks/useToast';
import {
    addMonths, buildAgendaEvents, eventsOn, firstOfMonth, monthGrid, monthOf, shownInGrid,
    visibleRange, weekOf, type AgendaEvent, type AgendaView,
} from './agenda/agendaLogic';

/** Color por tipo de ausencia aprobada; las solicitadas van en ámbar */
const LEAVE_COLORS: Record<LeaveRequest['type'], string> = {
    annual: 'bg-sky-100 text-sky-800 border-sky-200',
    sick: 'bg-rose-100 text-rose-800 border-rose-200',
    bereavement: 'bg-slate-200 text-slate-800 border-slate-300',
    family_violence: 'bg-purple-100 text-purple-800 border-purple-200',
    unpaid: 'bg-stone-100 text-stone-700 border-stone-200',
    day_off: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    other: 'bg-indigo-100 text-indigo-800 border-indigo-200',
};
const REQUESTED_COLOR = 'bg-amber-100 text-amber-800 border-amber-300 border-dashed';
const DECIDED_AGAINST_COLOR = 'bg-slate-50 text-slate-400 border-slate-200 line-through';

function leaveColor(l: LeaveRequest): string {
    if (l.status === 'requested') return REQUESTED_COLOR;
    if (l.status === 'approved') return LEAVE_COLORS[l.type];
    return DECIDED_AGAINST_COLOR;
}

function eventChip(t: TFunction, ev: AgendaEvent): { text: string; className: string; icon: string } {
    switch (ev.kind) {
        case 'leave':
            return { text: `${ev.personName} · ${t(`leave.type.${ev.leave.type}`)}`, className: leaveColor(ev.leave), icon: 'event_available' };
        case 'visa':
            return { text: t('hr.agenda.visa_expires', { name: ev.personName }), className: 'bg-red-50 text-red-700 border-red-200', icon: 'flight' };
        case 'contract':
            return { text: t('hr.agenda.contract_ends', { name: ev.personName }), className: 'bg-orange-50 text-orange-700 border-orange-200', icon: 'description' };
        case 'holiday':
            return { text: t('hr.agenda.public_holiday'), className: 'bg-violet-50 text-violet-700 border-violet-200', icon: 'flag' };
    }
}

/** Cabeceras lunes…domingo en formato NZ (como el resto de fechas de la app) */
const WEEKDAY_HEADERS = weekOf('2026-01-05').map(d =>
    new Intl.DateTimeFormat(NZ_LOCALE, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`)));

interface CalendarTabProps {
    employees: Employee[];
    /** Tras crear / decidir una ausencia (RRHH recarga la plantilla: on_leave) */
    onChanged?: () => void;
}

const CalendarTab: React.FC<CalendarTabProps> = ({ employees, onChanged }) => {
    const { t } = useTranslation();
    const { appUser } = useAuth();
    const storeOrchardId = useHarvestStore(s => s.orchard?.id);
    const today = todayNZST();
    const [view, setView] = useState<AgendaView>('month');
    const [cursor, setCursor] = useState(today);
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showNew, setShowNew] = useState(false);
    const [busy, setBusy] = useState(false);
    const [deciding, setDeciding] = useState<{ id: string; action: 'approved' | 'rejected' } | null>(null);
    const [note, setNote] = useState('');

    const canDecide = appUser?.role === 'hr_admin' || appUser?.role === 'admin' || appUser?.role === 'manager';
    const canRegisterApproved = appUser?.role === 'hr_admin' || appUser?.role === 'admin';

    const range = useMemo(() => visibleRange(view, cursor), [view, cursor]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setLeaves(await leaveService.listInRange(range.from, range.to));
            setError(null);
        } catch (e) {
            logger.warn('[Agenda] load failed:', e);
            setError(t('hr.agenda.load_failed'));
        } finally {
            setLoading(false);
        }
    }, [range.from, range.to, t]);

    useEffect(() => { void load(); }, [load]);

    const events = useMemo(() => buildAgendaEvents(employees, leaves, range.from, range.to), [employees, leaves, range]);

    // Guardado / decisión: toast arriba (antes una línea dentro de la Agenda que no se veía)
    const { toast, showToast, hideToast } = useToast();
    const flash = (message: string) => showToast(message, 'success');

    const goPrev = () => setCursor(view === 'month' ? firstOfMonth(addMonths(monthOf(cursor), -1)) : addDaysYMD(cursor, -7));
    const goNext = () => setCursor(view === 'month' ? firstOfMonth(addMonths(monthOf(cursor), 1)) : addDaysYMD(cursor, 7));

    const handleCreate = async (input: NewLeaveInput, person: Employee) => {
        setBusy(true);
        try {
            await leaveService.create(input);
            setShowNew(false);
            flash(t('hr.agenda.saved', { name: person.full_name }));
            await load();
            onChanged?.();
        } catch (e) {
            // Toast encima de todo (también del formulario abierto) y el aviso en la Agenda
            setError(e instanceof Error ? e.message : t('hr.agenda.not_saved'));
            showToast(t('hr.agenda.not_saved'), 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleDecision = async (id: string, action: 'approved' | 'rejected' | 'cancelled', decisionNote?: string) => {
        setBusy(true);
        try {
            const by = appUser?.id ?? null;
            if (action === 'approved') await leaveService.approve(id, by, decisionNote);
            else if (action === 'rejected') await leaveService.reject(id, by, decisionNote);
            else await leaveService.cancel(id, by, decisionNote);
            setDeciding(null);
            setNote('');
            flash(t(`hr.agenda.${action}`));
            await load();
            onChanged?.();
        } catch (e) {
            // Toast encima de todo (también del formulario abierto) y el aviso en la Agenda
            setError(e instanceof Error ? e.message : t('hr.agenda.not_saved'));
            showToast(t('hr.agenda.not_saved'), 'error');
        } finally {
            setBusy(false);
        }
    };

    const title = view === 'month'
        ? formatNZDate(firstOfMonth(monthOf(cursor)), 'monthYear')
        : `${formatNZDate(range.from, 'dayMonth')} – ${formatNZDate(range.to, 'medium')}`;

    return (
        <div className="space-y-4" data-testid="hr-agenda">
            {/* Barra: navegación, vista, nueva ausencia */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                    <button type="button" onClick={goPrev} aria-label={t('hr.agenda.prev')} className="size-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center">
                        <span aria-hidden="true" className="material-symbols-outlined text-lg">chevron_left</span>
                    </button>
                    <button type="button" onClick={() => setCursor(today)} className="px-3 h-9 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50">
                        {t('hr.agenda.today')}
                    </button>
                    <button type="button" onClick={goNext} aria-label={t('hr.agenda.next')} className="size-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center">
                        <span aria-hidden="true" className="material-symbols-outlined text-lg">chevron_right</span>
                    </button>
                </div>
                <h3 className="text-sm font-extrabold text-slate-800 tracking-tight ml-1" data-testid="agenda-title">{title}</h3>
                <div className="ml-auto flex items-center gap-2">
                    <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 text-xs font-bold">
                        {(['month', 'week'] as AgendaView[]).map(v => (
                            <button
                                key={v}
                                type="button"
                                onClick={() => setView(v)}
                                aria-pressed={view === v}
                                className={`px-3 py-1.5 rounded-lg ${view === v ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                                {t(`hr.agenda.${v}`)}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowNew(true)}
                        className="px-4 h-9 rounded-xl bg-indigo-600 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-700"
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-base">add</span>
                        {t('hr.agenda.new_leave')}
                    </button>
                </div>
            </div>

            {error && <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">{error}</div>}
            {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

            {/* Vista mes */}
            {view === 'month' && (
                <div className="bg-white rounded-2xl border border-border-light shadow-sm overflow-hidden" data-testid="agenda-month">
                    <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/60">
                        {WEEKDAY_HEADERS.map(h => (
                            <div key={h} className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">{h}</div>
                        ))}
                    </div>
                    {monthGrid(monthOf(cursor)).map((row, i) => (
                        <div key={i} className="grid grid-cols-7 border-b border-slate-100 last:border-0">
                            {row.map(day => {
                                const dayEvents = eventsOn(events, day).filter(shownInGrid);
                                const inMonth = monthOf(day) === monthOf(cursor);
                                const holiday = isPublicHoliday(day);
                                return (
                                    <button
                                        type="button"
                                        key={day}
                                        data-testid={`agenda-day-${day}`}
                                        onClick={() => { setCursor(day); setView('week'); }}
                                        className={`min-h-[84px] border-r border-slate-100 last:border-0 p-1.5 text-left align-top hover:bg-indigo-50/40 transition-colors
                                            ${inMonth ? '' : 'bg-slate-50/50 text-slate-300'} ${holiday ? 'bg-violet-50/40' : ''}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className={`text-xs font-bold ${day === today ? 'size-6 rounded-full bg-indigo-600 text-white flex items-center justify-center' : inMonth ? 'text-slate-700' : 'text-slate-300'}`}>
                                                {Number(day.slice(8, 10))}
                                            </span>
                                            {holiday && <span aria-hidden="true" className="material-symbols-outlined text-[14px] text-violet-500">flag</span>}
                                        </div>
                                        <div className="mt-1 space-y-0.5">
                                            {dayEvents.filter(e => e.kind !== 'holiday').slice(0, 3).map(ev => {
                                                const chip = eventChip(t, ev);
                                                return (
                                                    <div key={ev.id} className={`truncate rounded-md border px-1 py-0.5 text-[10px] font-bold ${chip.className}`} title={chip.text}>
                                                        {chip.text}
                                                    </div>
                                                );
                                            })}
                                            {dayEvents.filter(e => e.kind !== 'holiday').length > 3 && (
                                                <div className="text-[10px] font-bold text-slate-400">{t('hr.agenda.more', { n: dayEvents.filter(e => e.kind !== 'holiday').length - 3 })}</div>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}

            {/* Vista semana */}
            {view === 'week' && (
                <div className="space-y-2" data-testid="agenda-week">
                    {weekOf(cursor).map((day, _dayIndex, days) => {
                        const dayEvents = eventsOn(events, day);
                        const holiday = isPublicHoliday(day);
                        // Los botones salen una vez por ausencia: en su primer día visible de la semana
                        const firstVisibleDay = (ev: AgendaEvent) => (ev.date < days[0] ? days[0] : ev.date) === day;
                        return (
                            <div key={day} data-testid={`agenda-week-day-${day}`} className={`bg-white rounded-2xl border shadow-sm p-3 ${day === today ? 'border-indigo-200' : 'border-border-light'}`}>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`text-xs font-extrabold ${day === today ? 'text-indigo-700' : 'text-slate-700'}`}>{formatNZDate(day, 'weekdayDay')}</span>
                                    {holiday && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200">{t('hr.agenda.public_holiday')}</span>
                                    )}
                                </div>
                                {dayEvents.filter(e => e.kind !== 'holiday').length === 0 ? (
                                    <p className="text-xs text-slate-400">{t('hr.agenda.nothing_this_day')}</p>
                                ) : (
                                    <ul className="space-y-1.5">
                                        {dayEvents.filter(e => e.kind !== 'holiday').map(ev => {
                                            const chip = eventChip(t, ev);
                                            const leave = ev.kind === 'leave' ? ev.leave : null;
                                            return (
                                                <li key={ev.id} className={`rounded-xl border px-3 py-2 text-xs ${chip.className.replace('line-through', '')}`}>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">{chip.icon}</span>
                                                        <span className={`font-bold ${leave && (leave.status === 'rejected' || leave.status === 'cancelled') ? 'line-through' : ''}`}>{chip.text}</span>
                                                        {leave && (
                                                            <>
                                                                <span className="px-1.5 py-0.5 rounded-md bg-white/70 border border-black/10 text-[10px] font-bold uppercase tracking-wider">{statusLabel(t, leave.status)}</span>
                                                                <span className="text-[10px] font-medium opacity-80">
                                                                    {leave.half_day ? t('hr.agenda.half_day') : `${formatNZDate(leave.start_date, 'dayMonth')} – ${formatNZDate(leave.end_date, 'dayMonth')}`}
                                                                </span>
                                                                {leave.reason && <span className="text-[10px] italic opacity-80">· {leave.reason}</span>}
                                                                {leave.decision_note && <span className="text-[10px] opacity-80">· {leave.decision_note}</span>}
                                                            </>
                                                        )}
                                                        {leave && canDecide && firstVisibleDay(ev) && (leave.status === 'requested' || leave.status === 'approved') && (
                                                            <span className="ml-auto flex items-center gap-1">
                                                                {leave.status === 'requested' && (
                                                                    <>
                                                                        <button type="button" disabled={busy} onClick={() => { setDeciding({ id: leave.id, action: 'approved' }); setNote(''); }} className="px-2 py-1 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700">{t('hr.agenda.approve')}</button>
                                                                        <button type="button" disabled={busy} onClick={() => { setDeciding({ id: leave.id, action: 'rejected' }); setNote(''); }} className="px-2 py-1 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700">{t('hr.agenda.reject')}</button>
                                                                    </>
                                                                )}
                                                                <button type="button" disabled={busy} onClick={() => handleDecision(leave.id, 'cancelled')} className="px-2 py-1 rounded-lg bg-white border border-black/20 font-bold hover:bg-slate-50">{t('hr.agenda.cancel_leave')}</button>
                                                            </span>
                                                        )}
                                                    </div>
                                                    {leave && deciding?.id === leave.id && firstVisibleDay(ev) && (
                                                        <div className="mt-2 flex flex-wrap items-center gap-2" data-testid={`decision-${leave.id}`}>
                                                            <input
                                                                className="flex-1 min-w-[160px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                                                                placeholder={t('hr.agenda.decision_note')}
                                                                value={note}
                                                                maxLength={500}
                                                                onChange={e => setNote(e.target.value)}
                                                            />
                                                            <button type="button" disabled={busy} onClick={() => handleDecision(leave.id, deciding.action, note)} className={`px-3 py-1 rounded-lg text-white font-bold ${deciding.action === 'approved' ? 'bg-emerald-600' : 'bg-red-600'}`}>
                                                                {t('hr.contracts.confirm')}
                                                            </button>
                                                            <button type="button" onClick={() => setDeciding(null)} className="px-3 py-1 rounded-lg bg-white border border-slate-200 font-bold text-slate-600">{t('common.cancel')}</button>
                                                        </div>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {loading && <p className="text-xs text-slate-400" data-testid="agenda-loading">{t('common.loading')}</p>}

            {/* Recordatorio legal fijo (sin horas calculadas: no hay fin de turno) */}
            <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 flex items-center gap-2" data-testid="breaks-reminder">
                <span aria-hidden="true" className="material-symbols-outlined text-base text-slate-400">coffee</span>
                {t('hr.agenda.breaks_reminder', {
                    rest: NZ_REST_BREAK_DURATION_MINUTES,
                    restEvery: NZ_REST_BREAK_INTERVAL_HOURS,
                    meal: NZ_MEAL_BREAK_DURATION_MINUTES,
                    mealAt: NZ_MEAL_BREAK_INTERVAL_HOURS,
                })}
            </p>

            {showNew && (
                <NewLeaveModal
                    employees={employees}
                    defaultDate={view === 'week' ? cursor : (monthOf(cursor) === monthOf(today) ? today : firstOfMonth(monthOf(cursor)))}
                    canApprove={canRegisterApproved}
                    requestedBy={appUser?.id ?? null}
                    fallbackOrchardId={storeOrchardId}
                    busy={busy}
                    onClose={() => setShowNew(false)}
                    onSave={handleCreate}
                />
            )}
        </div>
    );
};

export default CalendarTab;
