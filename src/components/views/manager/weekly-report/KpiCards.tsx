/**
 * KpiCards — Summary metric cards for WeeklyReport
 */
import React from 'react';

export interface KpiCardData {
    icon: string;
    label: string;
    value: string;
    gradient: string;
    iconBg: string;
}

const KpiCards: React.FC<{ cards: KpiCardData[] }> = ({ cards }) => (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {cards.map((card, i) => (
            <div
                key={card.label}
                className={`bg-gradient-to-br ${card.gradient} rounded-2xl p-4 shadow-lg shadow-slate-200/50 border border-white/80 dash-card-enter anim-delay`}
                style={{ '--delay': `${i * 50}ms` } as React.CSSProperties}
            >
                <div className="flex items-center gap-2 mb-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.iconBg} shadow-sm`}>
                        <span aria-hidden="true" className="material-symbols-outlined text-base">{card.icon}</span>
                    </div>
                    <span className="text-[10px] text-text-sub uppercase font-bold tracking-wider">{card.label}</span>
                </div>
                <p className="text-2xl font-black text-text-main">{card.value}</p>
            </div>
        ))}
    </div>
);

export default KpiCards;
