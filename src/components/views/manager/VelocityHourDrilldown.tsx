/**
 * components/views/manager/VelocityHourDrilldown.tsx
 * Panel modal de drill-down por hora del gráfico de velocidad.
 *
 * - Tabla de pickers: nombre, bins, tendencia vs hora anterior.
 * - Cierre con ESC o click en backdrop.
 * - Slide-up en mobile, centrado en desktop.
 */
import React, { useRef } from 'react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { useTranslation } from '@/i18n';
import type { DrilldownData, DrilldownPickerRow } from '@/services/harvestMetrics/drilldown';

interface VelocityHourDrilldownProps {
    isOpen: boolean;
    data: DrilldownData | null;
    onClose: () => void;
}

function TrendBadge({ trend }: { trend: number }) {
    if (trend > 0) {
        return (
            <span className="inline-flex items-center gap-0.5 text-green-700 font-semibold">
                <span aria-hidden="true" className="material-symbols-outlined text-[14px]">trending_up</span>
                +{trend}
            </span>
        );
    }
    if (trend < 0) {
        return (
            <span className="inline-flex items-center gap-0.5 text-red-500 font-semibold">
                <span aria-hidden="true" className="material-symbols-outlined text-[14px]">trending_down</span>
                {trend}
            </span>
        );
    }
    return <span className="text-slate-400">—</span>;
}

const VelocityHourDrilldown: React.FC<VelocityHourDrilldownProps> = ({ isOpen, data, onClose }) => {
    const { t } = useTranslation();

    // Escape cierra, Tab atrapado y foco de vuelta al abrir/cerrar
    const panelRef = useRef<HTMLDivElement>(null);
    useDialogA11y(panelRef, { onClose, enabled: isOpen });

    if (!isOpen) return null;

    return (
        /* Backdrop */
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={onClose}
            data-testid="drilldown-backdrop"
        >
            {/* Panel — detener propagación para no cerrar al hacer click dentro */}
            <div
                className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[80vh] overflow-hidden flex flex-col"
                style={{ animation: 'slideUpFade 200ms ease-out' }}
                ref={panelRef}
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={t('dashboard.velocity.drilldown_title')}
                data-testid="drilldown-panel"
            >
                {/* Header */}
                <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="font-bold text-text-main text-sm">
                            {t('dashboard.velocity.drilldown_title')}
                        </h2>
                        {data && (
                            <p className="text-xs text-blue-500 font-medium mt-0.5">{data.hourLabel}</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
                        aria-label={t('common.close')}
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-slate-500 text-[18px]">close</span>
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1">
                    {!data || data.pickers.length === 0 ? (
                        <div className="p-8 text-center">
                            <span aria-hidden="true" className="material-symbols-outlined text-3xl text-slate-300 block mb-2">
                                hourglass_empty
                            </span>
                            <p className="text-sm text-slate-400">
                                {t('dashboard.velocity.drilldown_empty')}
                            </p>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50">
                                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                                        {t('dashboard.velocity.drilldown_picker')}
                                    </th>
                                    <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                                        {t('dashboard.velocity.drilldown_bins')}
                                    </th>
                                    <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                                        {t('dashboard.velocity.drilldown_trend')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.pickers.map((row: DrilldownPickerRow) => (
                                    <tr
                                        key={row.pickerId}
                                        className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                                    >
                                        <td className="px-4 py-3 font-medium text-text-main">
                                            {row.pickerName}
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-blue-700">
                                            {row.bins}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <TrendBadge trend={row.trendVsPrevHour} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-slate-50 border-t border-slate-200">
                                    <td className="px-4 py-2.5 text-xs font-semibold text-slate-500">
                                        {t('mgr.total')}
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-black text-blue-700">
                                        {data.totalBins}
                                    </td>
                                    <td />
                                </tr>
                            </tfoot>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VelocityHourDrilldown;
