/**
 * StatCard — KPI metric card
 * 
 * Displays a single metric with icon, value, label, and optional trend.
 */
import React from 'react';
import { cn } from '@/utils/cn';

type TrendDirection = 'up' | 'down' | 'flat';

interface StatCardProps {
    /** Material Symbols icon name */
    icon: string;
    /** Metric value (pre-formatted) */
    value: string | number;
    /** Metric label */
    label: string;
    /** Optional trend indicator */
    trend?: {
        direction: TrendDirection;
        value: string; // e.g. "+12%" or "-3%"
    };
    /** Icon background color class */
    iconBg?: string;
    /** Icon color class */
    iconColor?: string;
    /** Extra wrapper classes */
    className?: string;
    /** onClick handler for interactive cards */
    onClick?: () => void;
}

// Static maps for Tailwind JIT safety
const TREND_STYLES: Record<TrendDirection, string> = {
    up: 'text-emerald-600 bg-emerald-50',
    down: 'text-red-600 bg-red-50',
    flat: 'text-slate-500 bg-slate-50',
};

const TREND_ICONS: Record<TrendDirection, string> = {
    up: 'trending_up',
    down: 'trending_down',
    flat: 'trending_flat',
};

const StatCard: React.FC<StatCardProps> = ({
    icon,
    value,
    label,
    trend,
    iconBg = 'bg-violet-50',
    iconColor = 'text-violet-600',
    className,
    onClick,
}) => {
    const handleKeyDown = onClick
        ? (e: React.KeyboardEvent<HTMLDivElement>) => {
              if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onClick();
              }
          }
        : undefined;

    return (
    <div
        className={cn(
            'bg-white border border-slate-200 rounded-xl p-4 shadow-sm',
            'transition-all duration-200',
            onClick && 'cursor-pointer hover:shadow-md hover:border-slate-300 active:scale-[0.98]',
            className,
        )}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label={onClick ? `${label}: ${value}` : undefined}
    >
        <div className="flex items-start justify-between">
            {/* Icon */}
            <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', iconBg)}>
                <span aria-hidden="true" className={cn('material-symbols-outlined text-xl', iconColor)}>{icon}</span>
            </div>

            {/* Trend badge */}
            {trend && (
                <span className={cn(
                    'inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full',
                    TREND_STYLES[trend.direction],
                )}>
                    <span aria-hidden="true" className="material-symbols-outlined text-sm">{TREND_ICONS[trend.direction]}</span>
                    {trend.value}
                </span>
            )}
        </div>

        {/* Value & Label */}
        <div className="mt-3">
            <p className="text-2xl font-bold text-slate-900 tabular-nums leading-none">{value}</p>
            <p className="text-xs text-slate-500 font-medium mt-1">{label}</p>
        </div>
    </div>
    );
};

export default React.memo(StatCard);
