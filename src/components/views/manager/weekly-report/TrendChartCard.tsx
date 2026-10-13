/**
 * TrendChartCard — Wraps TrendLineChart with a styled card for WeeklyReport
 */
import React from 'react';
import { TrendLineChart, TrendDataPoint } from '@/components/charts/TrendLineChart';

type ColorTheme = 'emerald' | 'rose' | 'amber' | 'blue' | 'indigo' | 'slate';

interface TrendChartCardProps {
    title: string;
    subtitle: string;
    icon: string;
    colorTheme: ColorTheme;
    iconBgClass: string;
    iconTextClass: string;
    bgIconClass: string;
    data: TrendDataPoint[];
    targetLine?: number;
    targetLabel?: string;
    valueSuffix: string;
    staggerClass: string;
    onPointClick: (point: TrendDataPoint, index: number) => void;
}

const TrendChartCard: React.FC<TrendChartCardProps> = ({
    title, subtitle, icon, colorTheme, iconBgClass, iconTextClass, bgIconClass,
    data, targetLine, targetLabel, valueSuffix, staggerClass, onPointClick,
}) => (
    <div className={`glass-card card-hover p-5 relative overflow-hidden group section-enter ${staggerClass}`}>
        <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity duration-500">
            <span aria-hidden="true" className={`material-symbols-outlined text-7xl ${bgIconClass}`}>{icon}</span>
        </div>
        <div className="relative z-10">
            <h3 className="font-bold text-text-main mb-1 flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg ${iconBgClass} flex items-center justify-center shadow-sm`}>
                    <span aria-hidden="true" className={`material-symbols-outlined text-base ${iconTextClass}`}>{icon}</span>
                </div>
                {title}
            </h3>
            <p className="text-xs text-text-muted mb-3 ml-10">{subtitle}</p>
            <TrendLineChart
                data={data}
                targetLine={targetLine}
                targetLabel={targetLabel}
                colorTheme={colorTheme}
                valueSuffix={valueSuffix}
                higherIsBetter={true}
                height={200}
                onPointClick={onPointClick}
            />
        </div>
    </div>
);

export default TrendChartCard;
