/**
 * CostAnalyticsView — Manager Cost Analytics Dashboard
 *
 * Refactored architecture:
 *   CostAnalyticsView.tsx     — Thin orchestrator (~180 lines)
 *   useCostAnalytics.ts       — Data hook (loading, calculations)
 *   cost-analytics/
 *     ├── CostCharts.tsx      — DonutChart, HBar, KPICard
 *     └── index.ts            — Barrel export
 *   weekly-report/
 *     └── DayDetailPanel.tsx  — Reused for day drill-down
 */
import React from 'react';
import { useTranslation } from '@/i18n';
import { useCostAnalytics } from '@/hooks/useCostAnalytics';
import { TrendLineChart } from '@/components/charts/TrendLineChart';
import { DayDetailPanel } from './weekly-report';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { DonutChart, HBar, KPICard } from './cost-analytics';

const CostAnalyticsView: React.FC = () => {
    const ca = useCostAnalytics();
    const { t } = useTranslation();

    if (ca.isLoading) {
        return (
            <div className="space-y-5 max-w-6xl mx-auto">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><LoadingSkeleton type="metric" count={4} /></div>
                <LoadingSkeleton type="card" count={2} />
            </div>
        );
    }

    return (
        <div className="space-y-5 max-w-6xl mx-auto">
            {/* KPI Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPICard icon="payments" label={t('insights.kpi.cost_per_bin')} value={`$${ca.costPerBin.toFixed(2)}`} gradient="bg-gradient-to-br from-emerald-50 to-teal-50" iconColor="text-emerald-600" delay={0} />
                <KPICard icon="inventory_2" label={t('insights.kpi.total_bins')} value={ca.totalBuckets.toString()} gradient="bg-gradient-to-br from-sky-50 to-blue-50" iconColor="text-sky-600" delay={50} />
                <KPICard icon="account_balance_wallet" label={t('insights.kpi.total_labour')} value={`$${ca.totalEarnings.toFixed(0)}`} gradient="bg-gradient-to-br from-amber-50 to-orange-50" iconColor="text-amber-600" delay={100} />
                <KPICard icon="trending_up" label={t('insights.kpi.min_wage_topup')} value={`$${ca.totalTopUp.toFixed(0)}`} gradient="bg-gradient-to-br from-rose-50 to-pink-50" iconColor="text-rose-600" delay={150} />
            </div>

            {/* Cost Breakdown with Donut */}
            <div className="bg-white rounded-2xl p-5 shadow-lg shadow-slate-200/50 border border-slate-100 dash-card-enter anim-delay" style={{ '--delay': '200ms' } as React.CSSProperties}>
                <h3 className="font-bold text-text-main mb-1 flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-indigo-500">donut_large</span>{t('insights.cost_breakdown.title')}
                </h3>
                <p className="text-xs text-text-muted mb-4">{t('insights.cost_breakdown.subtitle')}</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                    <div className="md:col-span-1"><DonutChart pieceRate={ca.totalPieceRate} topUp={ca.totalTopUp} pieceRateLabel={t('insights.piece_rate.title')} /></div>
                    <div className="md:col-span-2 space-y-4">
                        {[
                            { label: t('insights.piece_rate.title'), desc: t('insights.piece_rate.subtitle'), value: ca.totalPieceRate, color: 'emerald' },
                            { label: t('insights.min_wage.title'), desc: t('insights.min_wage.subtitle'), value: ca.totalTopUp, color: 'amber' },
                        ].map(item => (
                            <div key={item.label} className={`flex items-center gap-3 p-3 rounded-xl bg-${item.color}-50/50`}>
                                <div className={`w-3 h-3 rounded-full bg-gradient-to-r from-${item.color}-500 to-${item.color}-400`} />
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-text-main">{item.label}</p>
                                    <p className="text-xs text-text-muted">{item.desc}</p>
                                </div>
                                <span className={`text-lg font-black text-${item.color}-600`}>${item.value.toFixed(0)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Daily Cost Trend */}
            <div className="glass-card card-hover p-5 relative overflow-hidden group section-enter stagger-3">
                <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity duration-500">
                    <span aria-hidden="true" className="material-symbols-outlined text-7xl text-rose-400">trending_up</span>
                </div>
                <div className="relative z-10">
                    <h3 className="font-bold text-text-main mb-1 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center shadow-sm">
                            <span aria-hidden="true" className="material-symbols-outlined text-base text-rose-500">trending_up</span>
                        </div>
                        {t('insights.trend.title')}
                    </h3>
                    <p className="text-xs text-text-muted mb-3 ml-10">{t('insights.trend.subtitle')}</p>
                    <TrendLineChart
                        data={ca.costTrend}
                        targetLine={ca.breakEven}
                        targetLabel={t('insights.trend.breakeven')}
                        colorTheme="rose"
                        valuePrefix="$"
                        higherIsBetter={false}
                        height={220}
                        onPointClick={(point) => {
                            if (point.meta) {
                                ca.setSelectedDayMeta(prev => prev?.date === point.meta?.date ? null : point.meta!);
                            }
                        }}
                    />
                </div>
                {ca.selectedDayMeta && (
                    <div className="relative z-10 mt-4">
                        <DayDetailPanel meta={ca.selectedDayMeta} onClose={() => ca.setSelectedDayMeta(null)} />
                    </div>
                )}
            </div>

            {/* Cost Per Team */}
            <div className="bg-white rounded-2xl p-5 shadow-lg shadow-slate-200/50 border border-slate-100 dash-card-enter anim-delay" style={{ '--delay': '300ms' } as React.CSSProperties}>
                <h3 className="font-bold text-text-main mb-1 flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-purple-500">groups</span>{t('insights.team_cost.title')}
                </h3>
                <p className="text-xs text-text-muted mb-4">{t('insights.team_cost.subtitle')}</p>
                {ca.teamCosts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 bg-gradient-to-b from-slate-50/50 to-white rounded-xl">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mb-3 shadow-sm">
                            <span aria-hidden="true" className="material-symbols-outlined text-2xl text-indigo-400">analytics</span>
                        </div>
                        <p className="text-sm font-bold text-text-sub">{t('insights.team_cost.empty')}</p>
                        <p className="text-xs text-text-muted mt-1">{t('insights.team_cost.empty_desc')}</p>
                    </div>
                ) : ca.teamCosts.map(team => (
                    <HBar key={team.teamLeader} label={team.teamLeader} value={team.costPerBin} max={ca.maxCostPerBin} color="bg-gradient-to-r from-indigo-500 to-purple-500" suffix="/bin" />
                ))}
            </div>

            {/* Top/Bottom Performers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {[
                    { title: t('insights.efficient.most.title'), subtitle: t('insights.efficient.most.subtitle'), emptyMsg: t('insights.efficient.most.empty'), icon: 'emoji_events', iconColor: 'text-emerald-500', hoverBg: 'hover:bg-emerald-50/30', badgeBg: 'bg-emerald-50', badgeText: 'text-emerald-600', topBg: 'bg-emerald-500', items: ca.sortedByEfficiency.slice(0, 5), delay: 400 },
                    { title: t('insights.efficient.least.title'), subtitle: t('insights.efficient.least.subtitle'), emptyMsg: t('insights.efficient.least.empty'), icon: 'warning', iconColor: 'text-amber-500', hoverBg: 'hover:bg-amber-50/30', badgeBg: 'bg-amber-50', badgeText: 'text-amber-600', topBg: 'bg-amber-500', items: ca.sortedByEfficiency.slice(-5).reverse(), delay: 450 },
                ].map(panel => (
                    <div key={panel.title} className="bg-white rounded-2xl p-5 shadow-lg shadow-slate-200/50 border border-slate-100 dash-card-enter anim-delay" style={{ '--delay': `${panel.delay}ms` } as React.CSSProperties}>
                        <h3 className="font-bold text-text-main mb-1 flex items-center gap-2">
                            <span aria-hidden="true" className={`material-symbols-outlined ${panel.iconColor}`}>{panel.icon}</span>{panel.title}
                        </h3>
                        <p className="text-xs text-text-muted mb-3">{panel.subtitle}</p>
                        {panel.items.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-6">
                                <span aria-hidden="true" className={`material-symbols-outlined text-2xl ${panel.iconColor} opacity-30 mb-1`}>{panel.icon}</span>
                                <p className="text-sm text-text-muted">{panel.emptyMsg}</p>
                            </div>
                        ) : panel.items.map((p, i) => {
                            const costBin = p.total_earnings / p.buckets;
                            return (
                                <button
                                    key={p.picker_id}
                                    type="button"
                                    onClick={() => ca.openProfile(p.picker_id)}
                                    className={`w-full flex items-center justify-between py-2.5 border-b border-border-light last:border-0 ${panel.hoverBg} transition-colors rounded-lg px-2 -mx-2 text-left focus-visible:outline-2 focus-visible:outline-indigo-500`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${i === 0 ? `${panel.topBg} text-white` : 'bg-slate-100 text-text-muted'}`}>{i + 1}</span>
                                        <div>
                                            <p className="text-sm font-semibold text-text-main">{p.picker_name}</p>
                                            <p className="text-[10px] text-text-muted">{p.buckets} {t('insights.bins')} · {p.hours_worked.toFixed(1)}h</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className={`text-xs font-bold ${panel.badgeText} ${panel.badgeBg} px-2 py-0.5 rounded-full`}>
                                            ${costBin.toFixed(2)}{t('insights.per_bin')}
                                        </span>
                                        <span aria-hidden="true" className="material-symbols-outlined text-[14px] text-slate-300">chevron_right</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CostAnalyticsView;
