/**
 * DayDetailPanel — Expanded view of a single day's metrics
 * Shown when clicking a data point on the trend chart.
 */
import React from 'react';
import { DayMeta } from '@/components/charts/TrendLineChart';

interface DayDetailPanelProps {
    meta: DayMeta;
    onClose: () => void;
}

const DayDetailPanel: React.FC<DayDetailPanelProps> = ({ meta, onClose }) => {
    const kpis = [
        { label: 'Pickers', value: String(meta.totalPickers ?? '—') },
        { label: 'Buckets', value: String(meta.totalBuckets ?? '—') },
        { label: 'Tons', value: meta.totalTons?.toFixed(1) ?? '—' },
        { label: 'Cost/Bin', value: meta.costPerBin != null ? `$${meta.costPerBin.toFixed(2)}` : '—' },
        { label: 'Top-Up', value: `$${(meta.topUpCost || 0).toFixed(0)}`, isNegative: (meta.topUpCost || 0) > 0 },
    ];

    return (
        <div className="relative bg-gradient-to-br from-slate-50 to-white rounded-2xl border border-slate-200 p-5 animate-fade-in shadow-sm">
            <button aria-label="Close"
                onClick={onClose}
                className="absolute top-3 right-3 w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
            >
                <span aria-hidden="true" className="material-symbols-outlined text-sm text-slate-500">close</span>
            </button>

            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                    <span aria-hidden="true" className="material-symbols-outlined text-base text-indigo-500">calendar_today</span>
                </div>
                <div>
                    <h4 className="font-bold text-slate-800">
                        {meta.date
                            ? new Date(meta.date + 'T00:00:00').toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'short' })
                            : 'Day Detail'}
                    </h4>
                    <p className="text-xs text-slate-500">{meta.orchardName || 'Orchard'}</p>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                {kpis.map(kpi => (
                    <div key={kpi.label} className="bg-white rounded-lg p-3 border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">{kpi.label}</p>
                        <p className={`text-lg font-black ${kpi.isNegative ? 'text-rose-600' : 'text-slate-800'}`}>{kpi.value}</p>
                    </div>
                ))}
            </div>

            {/* Team bars */}
            {meta.teams && meta.teams.length > 0 && (
                <div>
                    <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <span aria-hidden="true" className="material-symbols-outlined text-sm">groups</span> Teams on Site
                    </h5>
                    <div className="space-y-2">
                        {meta.teams.map((team, idx) => {
                            const maxBuckets = Math.max(...(meta.teams?.map(t => t.buckets) || [1]));
                            return (
                                <div key={idx} className="flex items-center gap-3">
                                    <span className="text-sm font-semibold text-slate-700 w-28 truncate">{team.name}</span>
                                    <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                                        <div
                                            className="bg-indigo-400 h-full rounded-full transition-all duration-500 dynamic-width"
                                            style={{ '--w': `${(team.buckets / maxBuckets) * 100}%` } as React.CSSProperties}
                                        />
                                    </div>
                                    <span className="text-xs font-bold text-slate-500 w-20 text-right">
                                        {team.pickers}p / {team.buckets}b
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DayDetailPanel;
