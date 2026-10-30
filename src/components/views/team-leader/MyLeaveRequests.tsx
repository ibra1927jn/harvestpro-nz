/**
 * «Ausencias que he pedido» (pase de lista del team leader): estado de cada
 * petición — pendiente de subir (sin red), pendiente de RRHH, aprobada o
 * rechazada (con la nota de RRHH).
 */
import React from 'react';
import type { MyLeaveRequest } from '@/hooks/useLeave';
import { formatNZDate } from '@/utils/nzFormat';
import { useTranslation } from '@/i18n';

const STATUS_STYLE: Record<string, { cls: string; icon: string; key: string }> = {
    queued: { cls: 'bg-slate-100 text-slate-600', icon: 'cloud_off', key: 'comms.leave_status_queued' },
    requested: { cls: 'bg-amber-100 text-amber-800', icon: 'pending', key: 'comms.leave_status_requested' },
    approved: { cls: 'bg-emerald-100 text-emerald-700', icon: 'check_circle', key: 'comms.leave_status_approved' },
    rejected: { cls: 'bg-red-100 text-red-700', icon: 'cancel', key: 'comms.leave_status_rejected' },
    cancelled: { cls: 'bg-slate-100 text-slate-500', icon: 'block', key: 'comms.leave_status_cancelled' },
};

export const MyLeaveRequests: React.FC<{ items: MyLeaveRequest[]; names: Map<string, string> }> = ({ items, names }) => {
    const { t } = useTranslation();
    if (items.length === 0) return null;
    return (
        <section data-testid="my-leave-requests" className="bg-white rounded-xl border border-slate-200 p-4">
            <h2 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                <span aria-hidden="true" className="material-symbols-outlined text-blue-600">event_busy</span>
                {t('comms.my_leave_title')}
            </h2>
            <ul className="divide-y divide-slate-100">
                {items.map(item => {
                    const l = item.leave;
                    const status = item.kind === 'queued' ? 'queued' : item.leave.status;
                    const st = STATUS_STYLE[status] ?? STATUS_STYLE.requested;
                    const dates = l.start_date === l.end_date
                        ? formatNZDate(l.start_date, 'dayMonth')
                        : `${formatNZDate(l.start_date, 'dayMonth')} – ${formatNZDate(l.end_date, 'dayMonth')}`;
                    const note = item.kind === 'server' ? item.leave.decision_note : null;
                    return (
                        <li key={l.id} className="py-2 flex items-start justify-between gap-3" data-testid={`my-leave-${l.id}`}>
                            <span className="min-w-0">
                                <span className="block text-sm font-bold text-slate-800 truncate">{names.get(l.picker_id) || '—'}</span>
                                <span className="block text-xs text-slate-500">
                                    {t(`leave.type.${l.type}`)} · {dates}{l.half_day ? ` · ${t('hr.agenda.half_day')}` : ''}
                                </span>
                                {note && <span className="block text-xs text-slate-500 italic">“{note}”</span>}
                            </span>
                            <span className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg ${st.cls}`}>
                                <span aria-hidden="true" className="material-symbols-outlined text-sm">{st.icon}</span>
                                {t(st.key)}
                            </span>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};

export default MyLeaveRequests;
