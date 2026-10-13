/**
 * Aviso: fichajes de días pasados sin hora de salida.
 * Sus horas son estimadas (no se paga lo real) y la semana de pago no se puede
 * cerrar hasta corregirlos en la hoja de horas.
 */
import React, { useEffect, useState } from 'react';
import { attendanceRepository } from '@/repositories/attendance.repository';
import { todayNZST } from '@/utils/nzst';
import { logger } from '@/utils/logger';

type Row = Awaited<ReturnType<typeof attendanceRepository.getUnclosedPastShifts>>[number];

const nzTime = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '';

export const UnclosedShiftsAlert: React.FC<{
    /** Solo este huerto (manager) */
    orchardId?: string;
    /** Solo estas personas (team leader: su equipo) */
    pickerIds?: string[];
    /** Qué hacer (texto según el rol) */
    hint?: string;
}> = ({ orchardId, pickerIds, hint = 'Fix the check-out time in the timesheets.' }) => {
    const [rows, setRows] = useState<Row[]>([]);
    const [open, setOpen] = useState(false);
    const idsKey = pickerIds?.slice().sort().join(',');

    useEffect(() => {
        let cancelled = false;
        attendanceRepository
            .getUnclosedPastShifts(todayNZST(), { orchardId, pickerIds })
            .then(r => { if (!cancelled) setRows(r); })
            .catch(err => logger.warn('[UnclosedShifts] load failed', err));
        return () => { cancelled = true; };
        // pickerIds se compara por contenido (idsKey)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orchardId, idsKey]);

    if (rows.length === 0) return null;
    const people = new Set(rows.map(r => r.pickerId)).size;

    return (
        <div role="alert" data-testid="unclosed-shifts-alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-900">
            <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3 text-left">
                <span className="text-sm font-bold flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">timer_off</span>
                    {rows.length} shift{rows.length === 1 ? '' : 's'} from past days with no check-out ({people} {people === 1 ? 'person' : 'people'}). Hours are estimated until fixed.
                </span>
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{open ? 'expand_less' : 'expand_more'}</span>
            </button>
            {open && (
                <div className="mt-2 text-sm">
                    <p className="text-xs mb-1">{hint}</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                        {rows.map(r => (
                            <li key={r.id}>{r.pickerName} — {r.date} (in {nzTime(r.checkIn)}, {r.orchardName})</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default UnclosedShiftsAlert;
