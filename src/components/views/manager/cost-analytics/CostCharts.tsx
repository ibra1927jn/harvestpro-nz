/**
 * Cost Analytics chart sub-components — DonutChart, HBar, KPICard
 */
import React from 'react';

/* ── Donut Chart ─────────────────────────── */

export const DonutChart: React.FC<{ pieceRate: number; topUp: number; pieceRateLabel?: string }> = ({ pieceRate, topUp, pieceRateLabel = 'Piece Rate' }) => {
    const total = pieceRate + topUp;
    if (total === 0) {
        return (
            <div className="relative w-40 h-40 mx-auto">
                <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="3" strokeDasharray="2 2" className="animate-spin" style={{ animationDuration: '20s', transformOrigin: 'center' } as React.CSSProperties} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span aria-hidden="true" className="material-symbols-outlined text-xl text-slate-300 mb-1">donut_large</span>
                    <span className="text-[10px] text-text-muted font-medium">Awaiting scan data</span>
                </div>
            </div>
        );
    }
    const pieceRatePct = (pieceRate / total) * 100;
    const topUpPct = (topUp / total) * 100;

    return (
        <div className="relative w-40 h-40 mx-auto">
            <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="url(#greenGrad)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${pieceRatePct} ${100 - pieceRatePct}`} strokeDashoffset="0" className="transition-all duration-1000 ease-out" />
                {topUp > 0 && (
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="url(#amberGrad)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${topUpPct} ${100 - topUpPct}`} strokeDashoffset={`-${pieceRatePct}`} className="transition-all duration-1000 ease-out" />
                )}
                <defs>
                    <linearGradient id="greenGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#10b981" /><stop offset="100%" stopColor="#34d399" />
                    </linearGradient>
                    <linearGradient id="amberGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#f59e0b" /><stop offset="100%" stopColor="#fbbf24" />
                    </linearGradient>
                </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-black text-text-main">{pieceRatePct.toFixed(0)}%</span>
                <span className="text-[9px] text-text-muted">{pieceRateLabel}</span>
            </div>
        </div>
    );
};

/* ── Horizontal Bar ──────────────────────── */

export const HBar: React.FC<{ label: string; value: number; max: number; color: string; suffix?: string }> = ({ label, value, max, color, suffix = '' }) => (
    <div className="flex items-center gap-3 mb-3">
        <span className="text-xs font-medium text-text-sub w-28 truncate">{label}</span>
        <div className="flex-1 h-7 rounded-xl bg-slate-100 overflow-hidden relative shadow-inner">
            <div className={`h-full rounded-xl transition-all duration-700 ease-out ${color} hbar-fill`} style={{ '--bar-w': `${Math.min(100, (value / (max || 1)) * 100)}%`, '--bar-min': value > 0 ? '24px' : '0' } as React.CSSProperties} />
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-text-main drop-shadow-sm">
                ${typeof value === 'number' ? value.toFixed(2) : value}{suffix}
            </span>
        </div>
    </div>
);

/* ── KPI Card ────────────────────────────── */

export const KPICard: React.FC<{ icon: string; label: string; value: string; gradient: string; iconColor: string; delay: number }> = (
    { icon, label, value, gradient, iconColor, delay }
) => (
    <div className={`relative overflow-hidden rounded-2xl p-4 shadow-lg shadow-slate-200/50 border border-white/80 ${gradient} dash-card-enter anim-delay`} style={{ '--delay': `${delay}ms` } as React.CSSProperties}>
        <div className="flex items-center gap-2 mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconColor} bg-white/60 shadow-sm`}>
                <span aria-hidden="true" className="material-symbols-outlined text-base">{icon}</span>
            </div>
            <span className="text-[10px] text-text-sub uppercase font-bold tracking-wider">{label}</span>
        </div>
        <p className="text-2xl font-black text-text-main">{value}</p>
    </div>
);
