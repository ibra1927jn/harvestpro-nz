/**
 * DashboardStatCard — Executive KPI card with animated values
 */
import React from 'react';
import { useTranslation } from '@/i18n';

export interface StatCardProps {
    title: string;
    value: string | number;
    unit?: string;
    trend?: number;
    icon: string;
    iconBg?: string;
    iconColor?: string;
    onClick?: () => void;
    /** Stagger index for entrance animation (0-3) */
    staggerIndex?: number;
}

const DashboardStatCard: React.FC<StatCardProps> = React.memo(({
    title, value, unit, trend, icon,
    iconBg = 'bg-blue-50', iconColor = 'text-blue-600',
    onClick, staggerIndex = 0,
}) => {
    const { t } = useTranslation();
    return (
    <div
        onClick={onClick}
        className={`bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col card-hover section-enter stagger-${Math.min(staggerIndex + 1, 8)} ${onClick ? 'cursor-pointer' : ''}`}
    >
        <div className="flex justify-between items-start mb-2">
            <span className="text-sm text-slate-500 font-medium uppercase tracking-wider">
                {title}
            </span>
            <div className={`${iconBg} p-1.5 rounded-lg ${iconColor} transition-transform duration-300 group-hover:scale-110`}>
                <span aria-hidden="true" className="material-symbols-outlined text-[20px]">{icon}</span>
            </div>
        </div>

        <div className="flex items-baseline gap-1.5">
            <h3 className="text-3xl font-bold text-slate-900 tabular-nums">{value}</h3>
            {unit && <span className="text-sm text-slate-400 font-normal">{unit}</span>}
        </div>

        {trend !== undefined && trend !== 0 ? (
            <div className={`flex items-center gap-1 mt-3 text-sm font-medium self-start px-2 py-0.5 rounded-full animate-slide-up stagger-${Math.min(staggerIndex + 1, 8)} ${trend > 0
                ? 'text-emerald-600 bg-emerald-50'
                : 'text-red-600 bg-red-50'
                }`}
            >
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                    {trend > 0 ? 'trending_up' : 'trending_down'}
                </span>
                <span>{t('mgr.vs_yesterday', { pct: `${trend > 0 ? '+' : ''}${trend}` })}</span>
            </div>
        ) : null}
    </div>
);
});

export default DashboardStatCard;
