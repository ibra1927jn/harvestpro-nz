/**
 * RequestLeaveModal — el team leader pide una ausencia para alguien de su
 * equipo desde el móvil (decisión del dueño 23-10). Siempre «solicitada»: la
 * aprueba o rechaza RRHH en su Agenda. Sin red se guarda en la cola y se sube
 * sola al volver la conexión.
 */
import React, { useState } from 'react';
import ModalOverlay from '@/components/ui/ModalOverlay';
import { LEAVE_TYPES } from '@/schemas/zod.schemas';
import type { LeaveType } from '@/services/leave.service';
import { todayNZST } from '@/utils/nzst';
import { logger } from '@/utils/logger';
import { useTranslation } from '@/i18n';

export interface RequestLeaveModalProps {
    picker: { id: string; name: string };
    orchardId: string;
    requestedBy: string;
    onClose: () => void;
    /** Guardada en el servidor ('saved') o en la cola sin red ('queued') */
    onDone: (state: 'saved' | 'queued') => void;
    onError: (message: string) => void;
}

const RequestLeaveModal: React.FC<RequestLeaveModalProps> = ({ picker, orchardId, requestedBy, onClose, onDone, onError }) => {
    const { t } = useTranslation();
    const today = todayNZST();
    const [type, setType] = useState<LeaveType>('sick');
    const [start, setStart] = useState(today);
    const [end, setEnd] = useState(today);
    const [halfDay, setHalfDay] = useState(false);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const submit = async () => {
        if (!start || !end || (!halfDay && end < start)) { setErr(t('hr.agenda.dates_invalid')); return; }
        setErr(null);
        setBusy(true);
        try {
            const { leaveService } = await import('@/services/leave.service');
            const res = await leaveService.requestOfflineFirst({
                orchardId,
                pickerId: picker.id,
                type,
                startDate: start,
                endDate: halfDay ? start : end,
                halfDay,
                reason: reason || null,
                requestedBy,
            });
            onDone(res.state);
        } catch (e) {
            logger.warn('[RequestLeaveModal] not saved:', e);
            onError(t('comms.leave_not_saved', { name: picker.name }));
        } finally {
            setBusy(false);
        }
    };

    const field = 'w-full rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white';
    const label = 'block text-[11px] font-bold text-slate-500';

    return (
        <ModalOverlay onClose={onClose} ariaLabel={t('comms.leave_request_title', { name: picker.name })}>
            <div className="p-5 space-y-3" data-testid="request-leave-modal">
                <h3 className="font-bold text-lg text-slate-800">{t('comms.leave_request_title', { name: picker.name })}</h3>
                <p className="text-xs text-slate-500">{t('comms.leave_request_hint')}</p>
                {err && <div role="alert" className="bg-red-50 border border-red-200 text-red-800 text-sm rounded px-3 py-2">{err}</div>}
                <div className="grid grid-cols-2 gap-2">
                    <label className={label}>{t('hr.type')}
                        <select className={field} value={type} onChange={e => setType(e.target.value as LeaveType)}>
                            {LEAVE_TYPES.map(lt => <option key={lt} value={lt}>{t(`leave.type.${lt}`)}</option>)}
                        </select>
                    </label>
                    <label className={`${label} flex items-end gap-2 pb-2`}>
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
                <div className="flex gap-2 pt-1">
                    <button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-xl bg-white py-2.5 text-sm font-bold text-slate-600 border border-slate-200">{t('common.cancel')}</button>
                    <button type="button" onClick={() => void submit()} disabled={busy} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                        {busy ? t('hr.saving') : t('comms.leave_send')}
                    </button>
                </div>
            </div>
        </ModalOverlay>
    );
};

export default RequestLeaveModal;
