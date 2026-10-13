/**
 * TrendLineChart — Reusable SVG Line Chart with Target Lines
 * 
 * Zero-dependency (no Chart.js/Recharts), pure SVG + React.
 * Features: smooth curve, gradient area fill, target threshold line,
 * color-coded dots (green = above target, red = below), hover tooltips,
 * responsive via viewBox, clickable data points with day detail.
 */
import React, { useId, useState } from 'react';
import { useTranslation } from '@/i18n';

export interface DayMeta {
    date?: string;
    orchardName?: string;
    teams?: { name: string; pickers: number; buckets: number }[];
    totalPickers?: number;
    totalBuckets?: number;
    totalTons?: number;
    costPerBin?: number;
    topUpCost?: number;
}

export interface TrendDataPoint {
    label: string;   // e.g. 'Mon', 'Tue', '10/02'
    value: number;   // e.g. 150, 42.5
    meta?: DayMeta;  // Optional rich metadata for click-to-inspect
}

interface TrendLineChartProps {
    data: TrendDataPoint[];
    targetLine?: number;         // Dashed horizontal threshold
    targetLabel?: string;        // e.g. 'Break-even', 'Meta'
    colorTheme?: 'emerald' | 'rose' | 'amber' | 'blue' | 'indigo' | 'slate';
    valuePrefix?: string;        // e.g. '$'
    valueSuffix?: string;        // e.g. ' bins'
    higherIsBetter?: boolean;    // Above target = green, below = red (or inverse)
    height?: number;
    onPointClick?: (point: TrendDataPoint, index: number) => void;
}

const THEMES = {
    emerald: { stroke: '#10b981', fillStart: 'rgba(16, 185, 129, 0.25)', fillEnd: 'rgba(16, 185, 129, 0)' },
    rose: { stroke: '#f43f5e', fillStart: 'rgba(244, 63, 94, 0.25)', fillEnd: 'rgba(244, 63, 94, 0)' },
    amber: { stroke: '#f59e0b', fillStart: 'rgba(245, 158, 11, 0.25)', fillEnd: 'rgba(245, 158, 11, 0)' },
    blue: { stroke: '#3b82f6', fillStart: 'rgba(59, 130, 246, 0.25)', fillEnd: 'rgba(59, 130, 246, 0)' },
    indigo: { stroke: '#6366f1', fillStart: 'rgba(99, 102, 241, 0.25)', fillEnd: 'rgba(99, 102, 241, 0)' },
    slate: { stroke: '#64748b', fillStart: 'rgba(100, 116, 139, 0.25)', fillEnd: 'rgba(100, 116, 139, 0)' },
};

export const TrendLineChart: React.FC<TrendLineChartProps> = ({
    data,
    targetLine,
    targetLabel = 'Target',
    colorTheme = 'emerald',
    valuePrefix = '',
    valueSuffix = '',
    higherIsBetter = true,
    height = 220,
    onPointClick,
}) => {
    const { t } = useTranslation();
    const uniqueId = useId().replace(/:/g, '');
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const isCompact = height < 140;

    if (!data || data.length === 0) {
        return (
            <div className="w-full flex items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-sm font-medium"
                style={{ height }}>
                <div className="text-center">
                    <span aria-hidden="true" className="material-symbols-outlined text-3xl text-slate-300 block mb-1">show_chart</span>
                    <span>{t('mgr.no_trend')}</span>
                </div>
            </div>
        );
    }

    // --- Dimensions ---
    const W = 800;
    const PAD = { top: isCompact ? 15 : 30, right: 20, bottom: isCompact ? 25 : 35, left: 20 };
    const gW = W - PAD.left - PAD.right;
    const gH = height - PAD.top - PAD.bottom;

    // --- Scales ---
    const vals = data.map(d => d.value);
    const all = targetLine !== undefined ? [...vals, targetLine] : vals;
    const rawMin = Math.min(...all);
    const rawMax = Math.max(...all);
    const yPad = (rawMax - rawMin) * 0.15 || 10;
    const minV = Math.max(0, rawMin - yPad);
    const maxV = rawMax + yPad;
    const range = maxV - minV || 1;

    const x = (i: number) => PAD.left + (i / Math.max(1, data.length - 1)) * gW;
    const y = (v: number) => PAD.top + gH - ((v - minV) / range) * gH;

    // --- Paths ---
    const lineD = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.value)}`).join(' ');
    const areaD = `${lineD} L ${x(data.length - 1)} ${PAD.top + gH} L ${x(0)} ${PAD.top + gH} Z`;

    const theme = THEMES[colorTheme];
    const isClickable = !!onPointClick;

    const dotColor = (v: number) => {
        if (targetLine === undefined) return theme.stroke;
        return (higherIsBetter ? v >= targetLine : v <= targetLine) ? '#10b981' : '#f43f5e';
    };

    const targetY = targetLine !== undefined ? y(targetLine) : null;

    const handlePointClick = (point: TrendDataPoint, index: number) => {
        if (!onPointClick) return;
        setActiveIndex(prev => prev === index ? null : index);
        onPointClick(point, index);
    };

    return (
        <div className="w-full relative group" style={{ height }}>
            <svg className="w-full h-full" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="xMidYMid meet">
                <defs>
                    <linearGradient id={`grad-${uniqueId}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={theme.fillStart} />
                        <stop offset="100%" stopColor={theme.fillEnd} />
                    </linearGradient>
                </defs>

                {/* Y-axis baseline */}
                <line x1={PAD.left} y1={PAD.top + gH} x2={PAD.left + gW} y2={PAD.top + gH}
                    stroke="#e2e8f0" strokeWidth="1" />

                {/* Target Line */}
                {targetLine !== undefined && targetY !== null && (
                    <g>
                        <line x1={PAD.left} y1={targetY} x2={PAD.left + gW} y2={targetY}
                            stroke="#94a3b8" strokeWidth="2" strokeDasharray="8 6" />
                        <rect x={PAD.left + gW - 140} y={targetY - 22} width="140" height="20" rx="4"
                            fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" />
                        <text x={PAD.left + gW - 70} y={targetY - 8} textAnchor="middle"
                            className="text-[11px] font-bold" fill="#64748b">
                            {targetLabel}: {valuePrefix}{targetLine.toFixed(targetLine % 1 ? 2 : 0)}{valueSuffix}
                        </text>
                    </g>
                )}

                {/* Area fill */}
                <path d={areaD} fill={`url(#grad-${uniqueId})`} />

                {/* Main trend line */}
                <path d={lineD} fill="none" stroke={theme.stroke} strokeWidth="3"
                    strokeLinecap="round" strokeLinejoin="round" />

                {/* Data points + labels */}
                {data.map((d, i) => {
                    const cx = x(i);
                    const cy = y(d.value);
                    const dc = dotColor(d.value);
                    const isActive = activeIndex === i;

                    return (
                        <g key={i}
                            onClick={() => handlePointClick(d, i)}
                            className={isClickable ? 'cursor-pointer' : ''}
                        >
                            {/* Vertical guide on hover */}
                            <line x1={cx} y1={cy + 6} x2={cx} y2={PAD.top + gH}
                                stroke={isActive ? dc : '#e2e8f0'} strokeWidth={isActive ? '2' : '1'} strokeDasharray="3 3"
                                className={isActive ? 'opacity-80' : 'opacity-0 group-hover:opacity-60 transition-opacity'} />

                            {/* Value label (hover or active — always hidden in compact) */}
                            <text x={cx} y={cy - (isCompact ? 10 : 14)} textAnchor="middle"
                                className={`text-[${isCompact ? '10' : '12'}px] font-black transition-opacity ${isActive ? 'opacity-100' : isCompact ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}
                                fill="#334155">
                                {valuePrefix}{typeof d.value === 'number' ? d.value.toFixed(d.value % 1 ? 1 : 0) : d.value}{valueSuffix}
                            </text>

                            {/* Hit area (invisible larger circle for easier clicking) */}
                            {isClickable && (
                                <circle cx={cx} cy={cy} r="20" fill="transparent" />
                            )}

                            {/* Dot — outer ring + filled center */}
                            <circle cx={cx} cy={cy} r={isActive ? 9 : isCompact ? 4 : 6} fill="white" stroke={dc}
                                strokeWidth={isActive ? 3 : isCompact ? 2 : 2.5}
                                className="transition-all duration-200" />
                            <circle cx={cx} cy={cy} r={isActive ? 5 : isCompact ? 2 : 3} fill={dc}
                                className="transition-all duration-200" />

                            {/* Active pulse ring */}
                            {isActive && (
                                <circle cx={cx} cy={cy} r="14" fill="none" stroke={dc}
                                    strokeWidth="2" opacity="0.3"
                                    className="animate-ping" />
                            )}

                            {/* "Click to inspect" hint on clickable dots */}
                            {isClickable && !isActive && d.meta && (
                                <text x={cx} y={cy + 22} textAnchor="middle"
                                    className="text-[9px] font-bold opacity-0 group-hover:opacity-40 transition-opacity"
                                    fill="#64748b">
                                    {t('mgr.chart_click')}
                                </text>
                            )}

                            <text x={cx} y={height - (isCompact ? 4 : 8)} textAnchor="middle"
                                className={`text-[${isCompact ? '9' : '11'}px] font-semibold`}
                                fill={isActive ? '#334155' : '#94a3b8'}>
                                {d.label}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};

export default TrendLineChart;
