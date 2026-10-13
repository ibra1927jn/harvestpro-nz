/**
 * Aviso al manager: cubetas que el servidor no aceptó (no cuentan para la paga)
 * o que aceptó con la hora dudosa, de cualquier móvil del huerto. Antes solo
 * las veía el runner en su propio móvil.
 */
import React, { useEffect, useState } from 'react';
import { rejectedScansRepository, type RejectedScanRow } from '@/repositories/rejected-scans.repository';
import { logger } from '@/utils/logger';

const nzDateTime = (iso: string | null) =>
    iso
        ? new Intl.DateTimeFormat('en-NZ', {
              timeZone: 'Pacific/Auckland', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
          }).format(new Date(iso))
        : '—';

export const RejectedScansAlert: React.FC<{ orchardId: string; days?: number }> = ({ orchardId, days = 7 }) => {
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
        rejected > 0 ? `${rejected} bucket scan${rejected === 1 ? '' : 's'} rejected (not counted for pay)` : '',
        flagged > 0 ? `${flagged} saved with a doubtful time` : '',
    ].filter(Boolean);

    return (
        <div role="alert" data-testid="rejected-scans-alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
            <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3 text-left">
                <span className="text-sm font-bold flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">report</span>
                    {parts.join(' · ')} — last {days} days
                </span>
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{open ? 'expand_less' : 'expand_more'}</span>
            </button>
            {open && (
                <ul className="mt-2 text-sm list-disc pl-5 space-y-0.5">
                    {rows.map(r => (
                        <li key={r.id}>
                            {r.kind === 'rejected' ? 'Rejected' : 'Check time'}: {r.pickerName ?? r.pickerCode} — scanned {nzDateTime(r.scannedAt)}
                            {r.reportedBy ? ` by ${r.reportedBy}` : ''} — {r.reason}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default RejectedScansAlert;
