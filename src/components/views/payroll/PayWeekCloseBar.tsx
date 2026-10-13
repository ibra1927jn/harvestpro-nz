/**
 * Estado de la semana de pago: abierta, lista para cerrar o cerrada.
 * Cerrar guarda lo que se paga y bloquea los fichajes y cubetas de esos días.
 */
import React, { useState } from 'react';
import type { PayWeekActionResult } from '@/repositories/payroll.repository';
import { useTranslation } from '@/i18n';
import { formatNZDate, formatNZTime } from '@/utils/nzFormat';

const nzDateTime = (iso: string | null | undefined) =>
    iso ? `${formatNZDate(iso, 'weekdayShort')} ${formatNZTime(iso)}` : '';

export interface PayWeekCloseBarProps {
    weekEnd: string;
    closedInfo: { closed_at: string | null; closed_by: string | null } | null;
    canManageWeek: boolean;
    weekFinished: boolean;
    closing: boolean;
    closeResult: PayWeekActionResult | null;
    onClose: () => void;
    onReopen: (reason: string) => void;
}

export const PayWeekCloseBar: React.FC<PayWeekCloseBarProps> = ({
    closedInfo, canManageWeek, weekFinished, closing, closeResult, onClose, onReopen,
}) => {
    const [confirming, setConfirming] = useState(false);
    const [reopening, setReopening] = useState(false);
    const [reason, setReason] = useState('');
    const { t } = useTranslation();

    if (closedInfo) {
        return (
            <div data-testid="pay-week-closed" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 mb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-bold text-emerald-900 flex items-center gap-2">
                        <span aria-hidden="true" className="material-symbols-outlined text-[20px]">lock</span>
                        {t('pay.close.closed', { date: nzDateTime(closedInfo.closed_at) })}
                    </p>
                    {canManageWeek && !reopening && (
                        <button type="button" onClick={() => setReopening(true)} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-800 hover:bg-emerald-100">
                            {t('pay.close.reopen')}
                        </button>
                    )}
                </div>
                {reopening && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <input
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder={t('pay.close.reason_placeholder')}
                            aria-label={t('pay.close.reason_label')}
                            className="flex-1 min-w-[220px] text-sm border border-emerald-300 rounded-lg px-3 py-1.5 bg-white text-slate-800"
                        />
                        <button
                            type="button"
                            disabled={closing || reason.trim().length < 5}
                            onClick={() => onReopen(reason.trim())}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-600 text-white disabled:opacity-40"
                        >
                            {closing ? '…' : t('pay.close.confirm_reopen')}
                        </button>
                        <button type="button" onClick={() => { setReopening(false); setReason(''); }} className="text-xs font-bold px-3 py-1.5 rounded-lg text-slate-600">
                            {t('common.cancel')}
                        </button>
                    </div>
                )}
            </div>
        );
    }

    if (!weekFinished) {
        return (
            <p data-testid="pay-week-open" className="text-xs font-bold text-slate-500 mb-4 flex items-center gap-1.5">
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">schedule</span>
                {t('pay.close.in_progress')}
            </p>
        );
    }

    return (
        <div data-testid="pay-week-ready" className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-3 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-bold text-orange-900 flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">lock_open</span>
                    {t('pay.close.ready')}
                </p>
                {canManageWeek && !confirming && (
                    <button type="button" onClick={() => setConfirming(true)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-orange-600 text-white">
                        {t('pay.close.close')}
                    </button>
                )}
                {canManageWeek && confirming && (
                    <div className="flex items-center gap-2">
                        <button type="button" disabled={closing} onClick={() => { setConfirming(false); onClose(); }} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-orange-600 text-white disabled:opacity-40">
                            {closing ? '…' : t('pay.close.yes')}
                        </button>
                        <button type="button" onClick={() => setConfirming(false)} className="text-xs font-bold px-3 py-1.5 rounded-lg text-slate-600">
                            {t('common.cancel')}
                        </button>
                    </div>
                )}
            </div>
            {closeResult?.reason === 'ESTIMATED_HOURS' && (
                <div role="alert" data-testid="pay-week-pending" className="mt-3 text-sm text-red-800">
                    <p className="font-bold">{t('pay.close.pending')}</p>
                    <ul className="mt-1 list-disc pl-5">
                        {(closeResult.pending ?? []).map(p => (
                            <li key={p.picker_id}>{p.picker_name}: {p.dates.map(d => formatNZDate(d, 'weekdayShort')).join(', ')}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default PayWeekCloseBar;
