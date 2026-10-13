/**
 * PickerDrawerBins — Tarjeta presentacional de bins y ganancias de hoy.
 * Muestra el desglose: piece rate + top-up.
 */
import React from 'react';
import { useTranslation } from '@/i18n';

interface PickerDrawerBinsProps {
    bins: number;
    earned: number;
    pieceRateEarnings: number;
    topUp: number;
    minWage: number;
    pieceRate: number;
}

const PickerDrawerBins: React.FC<PickerDrawerBinsProps> = ({
    bins,
    earned,
    pieceRateEarnings,
    topUp,
    minWage,
    pieceRate,
}) => {
    const { t } = useTranslation();

    const minWageLabel = t('panel.picker.min_wage_label').replace('{n}', String(minWage));

    return (
        <div className="space-y-3">
            {/* KPI Grid: bins + earned */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-black text-emerald-700">{bins}</p>
                    <p className="text-[10px] text-emerald-600 font-bold">{t('panel.picker.bins')}</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-black text-amber-700">${earned.toFixed(0)}</p>
                    <p className="text-[10px] text-amber-600 font-bold">{t('panel.picker.earned')}</p>
                </div>
            </div>

            {/* Desglose: piece rate + top-up */}
            <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm space-y-1.5">
                <div className="flex justify-between text-xs">
                    <span className="text-text-muted">
                        {t('panel.picker.piece_rate_label').replace('{bins}', String(bins)).replace('{rate}', pieceRate.toFixed(2))}
                    </span>
                    <span className="font-bold text-emerald-700">${pieceRateEarnings.toFixed(2)}</span>
                </div>
                {topUp > 0 && (
                    <div className="flex justify-between text-xs">
                        <span className="text-text-muted">
                            {t('panel.picker.topup_label').replace('{label}', minWageLabel)}
                        </span>
                        <span className="font-bold text-sky-700">+${topUp.toFixed(2)}</span>
                    </div>
                )}
                <div className="border-t border-slate-100 pt-1.5 flex justify-between text-xs">
                    <span className="font-bold text-text-main">{t('mgr.total')}</span>
                    <span className="font-black text-text-main">${earned.toFixed(2)}</span>
                </div>
            </div>
        </div>
    );
};

export default PickerDrawerBins;
