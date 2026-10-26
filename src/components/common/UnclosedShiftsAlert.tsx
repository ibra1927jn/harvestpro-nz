/**
 * Aviso: fichajes de días pasados sin hora de salida, y los de hoy abiertos
 * desde hace más de 14 h (salida olvidada).
 * Sus horas son estimadas (como mucho 14 h sin corregir) y la semana de pago
 * no se puede cerrar hasta corregirlos en la hoja de horas.
 */
import React, { useEffect, useState } from 'react';
import { attendanceRepository } from '@/repositories/attendance.repository';
import { todayNZST } from '@/utils/nzst';
import { logger } from '@/utils/logger';
import { useTranslation } from '@/i18n';
import { formatNZDate, formatNZTime } from '@/utils/nzFormat';

type Row = Awaited<ReturnType<typeof attendanceRepository.getUnclosedPastShifts>>[number];

export const UnclosedShiftsAlert: React.FC<{
    /** Solo este huerto (manager) */
    orchardId?: string;
    /** Solo estas personas (team leader: su equipo) */
    pickerIds?: string[];
    /** Qué hacer (texto según el rol) */
    hint?: string;
}> = ({ orchardId, pickerIds, hint }) => {
    const { t } = useTranslation();
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
    const anyLong = rows.some(r => r.long);
    const summaryKey = anyLong
        ? (rows.length === 1 ? 'unclosed.summary_long_one' : 'unclosed.summary_long_other')
        : (rows.length === 1 ? 'unclosed.summary_one' : 'unclosed.summary_other');

    return (
        <div role="alert" data-testid="unclosed-shifts-alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-900">
            <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3 text-left">
                <span className="text-sm font-bold flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">timer_off</span>
                    {t(summaryKey, {
                        n: rows.length,
                        people: t(people === 1 ? 'unclosed.people_one' : 'unclosed.people_other', { n: people }),
                    })}
                </span>
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{open ? 'expand_less' : 'expand_more'}</span>
            </button>
            {open && (
                <div className="mt-2 text-sm">
                    <p className="text-xs mb-1">{hint ?? t('unclosed.hint_default')}</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                        {rows.map(r => (
                            <li key={r.id}>{t(r.long ? 'unclosed.row_long' : 'unclosed.row', { name: r.pickerName, date: formatNZDate(r.date), time: formatNZTime(r.checkIn), orchard: r.orchardName })}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default UnclosedShiftsAlert;
