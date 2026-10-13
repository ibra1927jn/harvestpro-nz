/**
 * components/views/manager/VelocityChart.tsx
 * Hourly Bucket Velocity Chart (Pure CSS - No charting dependencies)
 *
 * Modos de operación:
 * - Sin shiftStart/shiftEnd: muestra las últimas 8 horas (comportamiento original).
 * - Con shiftStart + shiftEnd: muestra la ventana completa del turno (07:00–17:00)
 *   y habilita drill-down al hacer click en una barra (requiere onBarClick).
 *
 * Fixes históricos:
 * - Eje X siempre en formato 24h.
 * - Tooltip al hacer hover.
 * - Línea Target con label en el borde derecho.
 * - Leyenda honesta: solo entradas que aparecen en el chart.
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from '@/i18n';
import { analyticsService } from '../../../services/analytics.service';
import { buildShiftSlots } from '@/utils/time';
import { BucketRecord } from '../../../types';

interface VelocityChartProps {
    bucketRecords: BucketRecord[];
    targetVelocity?: number;
    /** Hora de inicio de turno, p.ej. "07:00". Activa el modo shift window. */
    shiftStart?: string;
    /** Hora de fin de turno, p.ej. "17:00". Activa el modo shift window. */
    shiftEnd?: string;
    /** Callback al hacer click en una barra (solo en modo shift window). */
    onBarClick?: (slotStartMs: number, slotEndMs: number, hourLabel: string) => void;
}

interface BarEntry {
    hour24: number;
    count: number;
    slotStartMs: number;
    slotEndMs: number;
    isCurrentHour: boolean;
}

/** Extrae el número de hora (0–23) de la string devuelta por toLocaleTimeString */
function parseHour(hourStr: string): number {
    const lower = hourStr.toLowerCase();
    const isPm = lower.includes('pm');
    const isAm = lower.includes('am');
    const parts = hourStr.replace(/[^0-9:]/g, '').split(':');
    let h = parseInt(parts[0], 10);
    if (isPm && h < 12) h += 12;
    if (isAm && h === 12) h = 0;
    return h;
}

function fmt24(hour: number): string {
    return String(hour).padStart(2, '0');
}

const VelocityChart: React.FC<VelocityChartProps> = ({
    bucketRecords,
    targetVelocity = 50,
    shiftStart,
    shiftEnd,
    onBarClick,
}) => {
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    const { t } = useTranslation();

    // Unificación de ambos modos en un único array de barras
    const bars = useMemo((): BarEntry[] => {
        if (shiftStart && shiftEnd) {
            // Modo shift window: cubre la ventana completa del turno
            const slots = buildShiftSlots(shiftStart, shiftEnd);
            const nowMs = Date.now();
            return slots.map(slot => {
                const count = bucketRecords.filter(r => {
                    const ts = new Date(r.scanned_at || r.created_at || '').getTime();
                    return !isNaN(ts) && ts >= slot.slotStartMs && ts < slot.slotEndMs;
                }).length;
                return {
                    hour24: slot.hour,
                    count,
                    slotStartMs: slot.slotStartMs,
                    slotEndMs: slot.slotEndMs,
                    isCurrentHour: nowMs >= slot.slotStartMs && nowMs < slot.slotEndMs,
                };
            });
        }
        // Modo legacy: últimas 8 horas vía analyticsService
        const hourlyData = analyticsService.groupByHour(bucketRecords, 8);
        const lastIdx = hourlyData.length - 1;
        return hourlyData.map((d, idx) => ({
            hour24: parseHour(d.hour),
            count: d.count,
            slotStartMs: 0,
            slotEndMs: 0,
            isCurrentHour: idx === lastIdx,
        }));
    }, [bucketRecords, shiftStart, shiftEnd]);

    const totalToday = bars.reduce((sum, b) => sum + b.count, 0);
    const hasData = totalToday > 0;

    const maxCount = useMemo(
        () => Math.max(...bars.map(b => b.count), targetVelocity, 10),
        [bars, targetVelocity]
    );

    const showCurrentLegend = bars.some(b => b.isCurrentHour && b.count > 0);
    const hasBelowTarget = bars.some(b => !b.isCurrentHour && b.count > 0 && b.count < targetVelocity);
    const isClickable = onBarClick !== undefined;

    const targetLinePos = maxCount > 0 ? (1 - targetVelocity / maxCount) * 100 : 0;

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden dash-card-enter anim-delay" style={{ '--delay': '200ms' } as React.CSSProperties}>
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                <div>
                    <h3 className="font-bold text-text-main flex items-center gap-2">
                        <span aria-hidden="true" className="material-symbols-outlined text-blue-500">trending_up</span>
                        {t('dashboard.velocity.title')}
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                        {shiftStart && shiftEnd
                            ? `${shiftStart}–${shiftEnd}`
                            : t('dashboard.velocity.subtitle')}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-2xl font-black text-text-main">{totalToday}</p>
                    <p className="text-[10px] text-slate-400">{t('dashboard.velocity.total_buckets')}</p>
                </div>
            </div>

            {/* Chart Area */}
            <div className="p-4">
                {!hasData ? (
                    <div className="h-[180px] flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                            <span aria-hidden="true" className="material-symbols-outlined text-3xl text-slate-300 dash-hourglass">hourglass_empty</span>
                        </div>
                        <p className="text-sm font-bold text-slate-500">{t('dashboard.velocity.awaiting')}</p>
                        <p className="text-xs text-slate-400 mt-1">{t('dashboard.velocity.awaiting_desc')}</p>
                        <div className="flex items-center gap-2 mt-3 text-[10px] text-slate-400">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            {t('dashboard.velocity.live')}
                        </div>
                    </div>
                ) : (
                    <div className="relative">
                        {/* Línea target */}
                        <div
                            className="absolute left-0 right-0 pointer-events-none z-10"
                            style={{ top: `${targetLinePos * 1.4}px` }}
                        >
                            <div className="relative flex items-center">
                                <div className="flex-1 border-t-2 border-dashed border-slate-400" />
                                <span className="text-[9px] font-bold text-slate-500 ml-1 whitespace-nowrap bg-white px-1 rounded">
                                    {t('dashboard.velocity.target_line').replace('{n}', String(targetVelocity))}
                                </span>
                            </div>
                        </div>

                        <div className="h-[180px] flex items-end gap-2">
                            {bars.map((data, idx) => {
                                const height = maxCount > 0 ? (data.count / maxCount) * 100 : 0;
                                const isAboveTarget = data.count >= targetVelocity;
                                const isCurrentHour = data.isCurrentHour;
                                const isHovered = hoveredIdx === idx;
                                const pctVsTarget = targetVelocity > 0
                                    ? Math.round((data.count / targetVelocity) * 100)
                                    : 0;

                                const barColor = isCurrentHour
                                    ? 'bg-gradient-to-t from-blue-600 to-blue-400'
                                    : isAboveTarget
                                        ? 'bg-gradient-to-t from-green-500 to-green-400'
                                        : 'bg-gradient-to-t from-blue-800 to-blue-600';

                                const hourLabel = `${fmt24(data.hour24)}:00–${fmt24(data.hour24 + 1 < 24 ? data.hour24 + 1 : 0)}:00`;

                                return (
                                    <div
                                        key={idx}
                                        className={`flex-1 flex flex-col items-center gap-1 relative group ${isClickable ? 'cursor-pointer' : ''}`}
                                        role={isClickable ? 'button' : undefined}
                                        tabIndex={isClickable ? 0 : undefined}
                                        aria-label={isClickable ? hourLabel : undefined}
                                        onMouseEnter={() => setHoveredIdx(idx)}
                                        onMouseLeave={() => setHoveredIdx(null)}
                                        onClick={() => {
                                            if (isClickable && data.slotStartMs && data.slotEndMs) {
                                                onBarClick(data.slotStartMs, data.slotEndMs, hourLabel);
                                            }
                                        }}
                                        onKeyDown={e => {
                                            if (isClickable && (e.key === 'Enter' || e.key === ' ') && data.slotStartMs && data.slotEndMs) {
                                                onBarClick(data.slotStartMs, data.slotEndMs, hourLabel);
                                            }
                                        }}
                                    >
                                        {/* Tooltip */}
                                        {isHovered && data.count > 0 && (
                                            <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 z-20 bg-slate-900 text-white rounded-xl px-3 py-2 text-[10px] whitespace-nowrap shadow-xl pointer-events-none">
                                                <p className="font-bold">{hourLabel}</p>
                                                <p>
                                                    {t('dashboard.velocity.tooltip_bins').replace('{n}', String(data.count))}
                                                    {' · '}
                                                    {t('dashboard.velocity.tooltip_target_pct').replace('{pct}', String(pctVsTarget))}
                                                </p>
                                                {isClickable && (
                                                    <p className="text-slate-400 mt-0.5">{t('dashboard.velocity.tap_for_details')}</p>
                                                )}
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                                            </div>
                                        )}

                                        {/* Bar */}
                                        <div className="relative w-full h-[140px] flex items-end justify-center">
                                            <div
                                                className={`w-full max-w-[40px] rounded-t-lg transition-all duration-500 ease-out dynamic-bar ${barColor} ${isHovered ? 'opacity-80 scale-x-105' : ''} ${isClickable && isHovered && data.count > 0 ? 'ring-2 ring-blue-300 ring-offset-1' : ''}`}
                                                style={{ '--h': `${height}%`, '--min-h': data.count > 0 ? '8px' : '0' } as React.CSSProperties}
                                            >
                                                {data.count > 0 && (
                                                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-text-sub">
                                                        {data.count}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Eje X — siempre 24h */}
                                        <span className={`text-[10px] font-medium ${isCurrentHour ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>
                                            {fmt24(data.hour24)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Legend */}
            {hasData && (
                <div className="px-4 pb-3 flex items-center justify-center gap-4 text-[10px] text-slate-400 flex-wrap">
                    {showCurrentLegend && (
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-3 rounded bg-blue-500"></span>
                            {t('dashboard.velocity.current_hour')}
                        </span>
                    )}
                    <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded bg-green-500"></span>
                        {t('dashboard.velocity.above_target')}
                    </span>
                    {hasBelowTarget && (
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-3 rounded bg-blue-800"></span>
                            {t('dashboard.velocity.below_target')}
                        </span>
                    )}
                    <span className="flex items-center gap-1">
                        <span className="w-6 border-t-2 border-dashed border-slate-400"></span>
                        {t('dashboard.velocity.target_line').replace('{n}', String(targetVelocity))}
                    </span>
                    {isClickable && (
                        <span className="flex items-center gap-1 text-blue-400">
                            <span aria-hidden="true" className="material-symbols-outlined text-[12px]">touch_app</span>
                            {t('dashboard.velocity.tap_bar_details')}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

export default VelocityChart;
