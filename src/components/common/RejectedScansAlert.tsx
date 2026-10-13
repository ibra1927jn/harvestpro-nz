/**
 * Aviso al manager: cubetas que el servidor no aceptó (no cuentan para la paga)
 * o que aceptó con la hora dudosa, de cualquier móvil del huerto. Antes solo
 * las veía el runner en su propio móvil.
 */
import React, { useEffect, useState } from 'react';
import { rejectedScansRepository, type RejectedScanRow } from '@/repositories/rejected-scans.repository';
import { logger } from '@/utils/logger';
import { useTranslation } from '@/i18n';
import { formatNZDate, formatNZTime } from '@/utils/nzFormat';

const nzDateTime = (iso: string | null) =>
    iso ? `${formatNZDate(iso, 'dayMonth')}, ${formatNZTime(iso)}` : '—';

export const RejectedScansAlert: React.FC<{ orchardId: string; days?: number }> = ({ orchardId, days = 7 }) => {
    const { t } = useTranslation();
    const [rows, setRows] = useState<RejectedScanRow[]>([]);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        rejectedScansRepository
            .listRecent(orchardId, days)
            .then(r => { if (!cancelled) setRows(r); })
            .catch(err => logger.warn('[RejectedScans] load failed', err));
        return () => { cancelled = true; };
    }, [orchardId, days]);

    if (rows.length === 0) return null;
    const rejected = rows.filter(r => r.kind === 'rejected').length;
    const flagged = rows.length - rejected;
    const parts = [
        rejected > 0 ? t(rejected === 1 ? 'rejected.summary_one' : 'rejected.summary_other', { n: rejected }) : '',
        flagged > 0 ? t('rejected.flagged_n', { n: flagged }) : '',
    ].filter(Boolean);

    return (
        <div role="alert" data-testid="rejected-scans-alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
            <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3 text-left">
                <span className="text-sm font-bold flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">report</span>
                    {parts.join(' · ')} — {t('rejected.last_days', { n: days })}
                </span>
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{open ? 'expand_less' : 'expand_more'}</span>
            </button>
            {open && (
                <ul className="mt-2 text-sm list-disc pl-5 space-y-0.5">
                    {rows.map(r => (
                        <li key={r.id}>
                            {r.kind === 'rejected' ? t('rejected.kind_rejected') : t('rejected.kind_check')}: {r.pickerName ?? r.pickerCode} — {t('rejected.scanned_at', { time: nzDateTime(r.scannedAt) })}
                            {r.reportedBy ? ` ${t('rejected.by', { name: r.reportedBy })}` : ''} — {r.reason}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default RejectedScansAlert;
