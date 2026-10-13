/**
 * SummaryCard — Reusable metric card for page dashboards.
 *
 * Used by: HHRR, Logistics, Admin, Payroll, QC pages.
 * Supports optional highlight color and progress bar.
 */
import React from 'react';

export interface SummaryCardProps {
    /** Material Symbols icon name */
    icon: string;
    /** Tailwind text-color class for the icon, e.g. 'text-emerald-500' */
    iconColor: string;
    /** Short label displayed above the value */
    label: string;
    /** The metric value (pre-formatted string) */
    value: string | number;
    /** Optional: highlight the card (colored background + border) */
    highlight?: boolean;
    /** Optional: Tailwind highlight color theme, defaults to 'orange' */
    highlightColor?: 'orange' | 'red' | 'emerald' | 'amber' | 'indigo';
    /** Optional: progress bar (0–100) */
    progress?: number;
    /** Optional: Tailwind class for progress bar color */
    progressColor?: string;
}

const HIGHLIGHT_STYLES: Record<string, string> = {
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
};

const SummaryCard: React.FC<SummaryCardProps> = ({
    icon,
    iconColor,
    label,
    value,
    highlight,
    highlightColor = 'orange',
    progress,
    progressColor = 'bg-primary',
}) => {
    const hlStyle = highlight ? HIGHLIGHT_STYLES[highlightColor] : '';
    const baseStyle = highlight
        ? `rounded-2xl p-5 shadow-sm border backdrop-blur-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 ${hlStyle}`
        : 'bg-white/80 backdrop-blur-md rounded-2xl p-5 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-white/60 transition-all duration-300 hover:shadow-[0_8px_32px_rgb(0,0,0,0.06)] hover:-translate-y-1 relative overflow-hidden group';

    return (
        <div className={baseStyle}>
            {!highlight && (
                <div className="absolute inset-0 bg-gradient-to-br from-slate-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            )}
            <div className="flex items-center gap-2 mb-2 relative z-10">
                <span aria-hidden="true" className={`material-symbols-outlined text-[20px] ${iconColor}`}>{icon}</span>
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wide">{label}</span>
            </div>
            <p className={`text-3xl font-black relative z-10 tracking-tight ${highlight ? '' : 'text-slate-800'}`}>
                {value}
            </p>
            {progress !== undefined && (
                <div className="mt-2 h-1.5 bg-surface-secondary rounded-full overflow-hidden">
                    <div
                        className={`h-full ${progressColor} rounded-full transition-all duration-300`}
                        style={{ width: `${Math.min(100, progress)}%` }}
                    />
                </div>
            )}
        </div>
    );
};

export default SummaryCard;
