/**
 * PickerDrawerToday — Tab "Hoy" del PickerDrawer.
 * Props vienen de usePickerDrawerData — misma fuente que Dashboard Top 10.
 */
import React from 'react';
import { useTranslation } from '@/i18n';
import type { Picker } from '@/types';
import type { PickerTodayData } from './usePickerDrawerData';
import PickerDrawerHours from './PickerDrawerHours';
import PickerDrawerBins from './PickerDrawerBins';

interface PickerDrawerTodayProps {
    today: PickerTodayData;
    picker: Picker | undefined;
    crew: Picker[];
    minWage: number;
    pieceRate: number;
}

const PickerDrawerToday: React.FC<PickerDrawerTodayProps> = ({
    today,
    picker,
    crew,
    minWage,
    pieceRate,
}) => {
    const { t } = useTranslation();

    // Empty state: picker sin scans hoy
    if (today.empty) {
        return (
            <div className="flex flex-col items-center justify-center py-10 space-y-2">
                <span aria-hidden="true" className="material-symbols-outlined text-5xl text-slate-300">hourglass_empty</span>
                <p className="text-sm text-text-muted">{t('panel.no_data')}</p>
            </div>
        );
    }

    const binsPerHour = today.hoursWorked > 0
        ? today.bins / today.hoursWorked
        : null;

    // Effective hourly rate
    const hourlyRate = today.hoursWorked > 0 ? today.earned / today.hoursWorked : null;
    const isAboveMinimum = hourlyRate !== null && hourlyRate >= minWage;
    const minWageLabel = t('panel.picker.min_wage_label').replace('{n}', String(minWage));

    return (
        <div className="space-y-4">
            {/* Bins + earnings breakdown */}
            <PickerDrawerBins
                bins={today.bins}
                earned={today.earned}
                pieceRateEarnings={today.pieceRateEarnings}
                topUp={today.topUp}
                minWage={minWage}
                pieceRate={pieceRate}
            />

            {/* Hours + bins/hr */}
            <PickerDrawerHours
                hoursWorked={today.hoursWorked}
                binsPerHour={binsPerHour}
            />

            {/* Effective Rate — ocultar si horas = 0 */}
            {hourlyRate !== null ? (
                <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-text-muted">{t('panel.picker.effective_rate')}</span>
                        <span className={`text-base font-bold ${isAboveMinimum ? 'text-emerald-600' : 'text-red-500'}`}>
                            ${hourlyRate.toFixed(2)}{t('common.per_hour')}
                        </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-700 ${isAboveMinimum ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-red-300 to-red-400'}`}
                            style={{ width: `${Math.min(100, (hourlyRate / (minWage * 1.5)) * 100)}%` }}
                        />
                    </div>
                    <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-slate-400">$0</span>
                        <span className={`text-[10px] font-medium ${isAboveMinimum ? 'text-slate-400' : 'text-red-500'}`}>
                            {minWageLabel}{!isAboveMinimum && ` ${t('panel.picker.below_min')}`}
                        </span>
                    </div>
                </div>
            ) : today.bins > 0 ? (
                /* Bins escaneados pero aún no se registró check_in */
                <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 shadow-sm text-center">
                    <span aria-hidden="true" className="material-symbols-outlined text-slate-400 text-2xl block mb-1">schedule</span>
                    <p className="text-xs font-bold text-slate-500">{t('panel.picker.not_started')}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{t('panel.picker.not_started_desc')}</p>
                </div>
            ) : null}

            {/* Details del picker */}
            {picker && (
                <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">{t('panel.picker.details')}</p>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-50 rounded-lg p-2">
                            <p className="text-[10px] text-slate-400 mb-0.5">{t('panel.picker.current_row')}</p>
                            <p className="text-xs font-bold text-slate-900">
                                {picker.current_row ? t('panel.picker.row').replace('{n}', String(picker.current_row)) : t('panel.picker.unassigned')}
                            </p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2">
                            <p className="text-[10px] text-slate-400 mb-0.5">{t('panel.picker.harness')}</p>
                            <p className={`text-xs font-bold ${picker.harness_id ? 'text-slate-900' : 'text-amber-600'}`}>
                                {picker.harness_id || t('panel.picker.not_assigned')}
                            </p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2">
                            <p className="text-[10px] text-slate-400 mb-0.5">{t('panel.picker.team')}</p>
                            <p className="text-xs font-bold text-slate-900">
                                {picker.team_leader_id
                                    ? (crew.find(c => c.id === picker.team_leader_id)?.name || t('pd.assigned'))
                                    : t('panel.picker.no_team')}
                            </p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2">
                            <p className="text-[10px] text-slate-400 mb-0.5">{t('panel.picker.hours_today')}</p>
                            <p className="text-xs font-bold text-slate-900">{today.hoursWorked.toFixed(1)}h</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Acciones de picker */}
            <div className="flex gap-2">
                <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/80 border border-slate-100 text-xs font-bold text-indigo-700 hover:bg-indigo-50 transition-colors shadow-sm">
                    <span aria-hidden="true" className="material-symbols-outlined text-sm">chat</span>
                    {t('panel.picker.message_tl')}
                </button>
                <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/80 border border-slate-100 text-xs font-bold text-amber-700 hover:bg-amber-50 transition-colors shadow-sm">
                    <span aria-hidden="true" className="material-symbols-outlined text-sm">flag</span>
                    {t('panel.picker.flag_qc')}
                </button>
            </div>
        </div>
    );
};

export default PickerDrawerToday;
