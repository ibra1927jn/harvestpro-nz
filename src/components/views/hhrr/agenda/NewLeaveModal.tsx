/**
 * NewLeaveModal — alta de una ausencia desde la Agenda de RRHH:
 * persona (buscador sobre la plantilla), tipo, desde, hasta, medio día, motivo.
 */
import React, { useMemo, useState } from 'react';
import ModalOverlay from '@/components/ui/ModalOverlay';
import { LEAVE_TYPES } from '@/schemas/zod.schemas';
import type { Employee } from '@/services/hhrr/hhrr.types';
import type { LeaveType, NewLeaveInput } from '@/services/leave.service';
import { roleLabel } from '@/i18n/roleLabel';
import { useTranslation } from '@/i18n';

export interface NewLeaveModalProps {
    employees: Employee[];
    /** Día por defecto (el que tenga la Agenda) */
    defaultDate: string;
    /** RRHH/admin pueden registrarla ya aprobada */
    canApprove: boolean;
    requestedBy: string | null;
    fallbackOrchardId?: string;
    busy: boolean;
    onClose: () => void;
    onSave: (input: NewLeaveInput, person: Employee) => void;
}

const NewLeaveModal: React.FC<NewLeaveModalProps> = ({ employees, defaultDate, canApprove, requestedBy, fallbackOrchardId, busy, onClose, onSave }) => {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [personId, setPersonId] = useState('');
    const [type, setType] = useState<LeaveType>('annual');
    const [start, setStart] = useState(defaultDate);
    const [end, setEnd] = useState(defaultDate);
    const [halfDay, setHalfDay] = useState(false);
    const [reason, setReason] = useState('');
    const [approveNow, setApproveNow] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // Solo plantilla (pickers, team leaders, runners) en alta: leave_requests
    // apunta a pickers(id); las cuentas solo de oficina no tienen fila ahí
    const candidates = useMemo(() => {
        const q = query.trim().toLowerCase();
        return employees
            .filter(e => e.source !== 'office' && e.status !== 'terminated')
            .filter(e => !q || e.full_name.toLowerCase().includes(q))
            .slice(0, 8);
    }, [employees, query]);
    const person = employees.find(e => e.id === personId);

    const submit = () => {
        if (!person) { setErr(t('hr.agenda.person_required')); return; }
        const orchardId = person.orchard_id || fallbackOrchardId;
        if (!orchardId) { setErr(t('hr.contracts.no_orchard')); return; }
        if (!start || !end || end < start) { setErr(t('hr.agenda.dates_invalid')); return; }
        setErr(null);
        onSave({
            orchardId,
            pickerId: person.id,
            type,
            startDate: start,
            endDate: halfDay ? start : end,
            halfDay,
            reason: reason || null,
            requestedBy,
            status: canApprove && approveNow ? 'approved' : 'requested',
        }, person);
    };

    const field = 'w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white';
    const label = 'block text-[11px] font-bold text-slate-500';

    return (
        <ModalOverlay onClose={onClose} ariaLabel={t('hr.agenda.new_leave')}>
            <div className="p-5 space-y-3" data-testid="new-leave-modal">
                <h3 className="font-bold text-lg text-slate-800">{t('hr.agenda.new_leave')}</h3>
                {err && <div role="alert" className="bg-red-50 border border-red-200 text-red-800 text-sm rounded px-3 py-2">{err}</div>}

                {/* Persona */}
                <label className={label}>{t('hr.agenda.person')}
                    {person ? (
                        <div className="mt-0.5 flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-sm font-bold text-indigo-800">
                            {person.full_name}
                            <button type="button" onClick={() => { setPersonId(''); setQuery(''); }} className="text-indigo-500 hover:text-indigo-700" aria-label={t('common.cancel')}>
                                <span aria-hidden="true" className="material-symbols-outlined text-base">close</span>
                            </button>
                        </div>
                    ) : (
                        <input className={field} type="search" placeholder={t('hr.agenda.search_person')} value={query} onChange={e => setQuery(e.target.value)} autoFocus />
                    )}
                </label>
                {!person && (
                    <ul className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100" data-testid="person-results">
                        {candidates.map(c => (
                            <li key={c.id}>
                                <button type="button" onClick={() => setPersonId(c.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50">
                                    <span className="font-bold text-slate-700">{c.full_name}</span>
                                    <span className="ml-2 text-xs text-slate-400">{roleLabel(t, c.role)}</span>
                                </button>
                            </li>
                        ))}
                        {candidates.length === 0 && <li className="px-3 py-2 text-xs text-slate-400">{t('hr.no_employees')}</li>}
                    </ul>
                )}

                <div className="grid grid-cols-2 gap-2">
                    <label className={label}>{t('hr.type')}
                        <select className={field} value={type} onChange={e => setType(e.target.value as LeaveType)}>
                            {LEAVE_TYPES.map(lt => <option key={lt} value={lt}>{t(`leave.type.${lt}`)}</option>)}
                        </select>
                    </label>
                    <label className={`${label} flex items-end gap-2 pb-1.5`}>
                        <input type="checkbox" checked={halfDay} onChange={e => setHalfDay(e.target.checked)} />
                        {t('hr.agenda.half_day')}
                    </label>
                    <label className={label}>{t('hr.agenda.from')}
                        <input className={field} type="date" value={start} onChange={e => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} />
                    </label>
                    <label className={label}>{t('hr.agenda.to')}
                        <input className={field} type="date" value={halfDay ? start : end} min={start} disabled={halfDay} onChange={e => setEnd(e.target.value)} />
                    </label>
                </div>
                <label className={label}>{t('hr.agenda.reason')}
                    <textarea className={field} rows={2} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
                </label>
                {canApprove && (
                    <label className={`${label} flex items-center gap-2`}>
                        <input type="checkbox" checked={approveNow} onChange={e => setApproveNow(e.target.checked)} />
                        {t('hr.agenda.register_approved')}
                    </label>
                )}

                <div className="flex gap-2 pt-1">
                    <button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-xl bg-white py-2 text-xs font-bold text-slate-600 border border-slate-200">{t('common.cancel')}</button>
                    <button type="button" onClick={submit} disabled={busy} className="flex-1 rounded-xl bg-indigo-600 py-2 text-xs font-bold text-white disabled:opacity-50">
                        {busy ? t('hr.saving') : t('hr.agenda.save')}
                    </button>
                </div>
            </div>
        </ModalOverlay>
    );
};

export default NewLeaveModal;
