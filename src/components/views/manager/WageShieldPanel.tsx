/**
 * components/views/manager/WageShieldPanel.tsx
 * Wage Bleeding Dashboard — Phase 6
 *
 * Upgraded from compliance-only view to a $$$ focused panel:
 * - Total bleed KPI (how much money being lost today to min-wage top-ups)
 * - Team bleed breakdown (which TL's team costs the most)
 * - 7-day bleed trend sparkline
 * - Critical pickers list (clickable → drawer)
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { Picker } from '../../../types';
import { analyticsService } from '../../../services/analytics.service';
import { ComplianceViolation } from '../../../services/compliance.service';
import { TrendLineChart, TrendDataPoint } from '../../charts/TrendLineChart';
import { useHarvestStore } from '../../../stores/useHarvestStore';
import { PAY_RULES, computePerPicker } from '@/services/harvestMetrics';

interface WageShieldPanelProps {
    crew: Picker[];
    teamLeaders: Picker[];
    settings: { piece_rate: number; min_wage_rate: number };
    alerts?: ComplianceViolation[];
    onUserSelect?: (user: Picker) => void;
}

const WageShieldPanel: React.FC<WageShieldPanelProps> = ({
    crew,
    teamLeaders,
    settings,
    alerts = [],
    onUserSelect: _onUserSelect
}) => {
    const { t, locale } = useTranslation();
    const { piece_rate, min_wage_rate } = settings;
    const orchardId = useHarvestStore(state => state.orchard?.id);
    const openPickerProfile = useHarvestStore(state => state.openPickerProfile);
    const [bleedTrend, setBleedTrend] = useState<TrendDataPoint[]>([]);

    // Fetch 7-day bleed trend desde bucket_records (estimado con SHIFT_HOURS=8h)
    useEffect(() => {
        const bcp47 = locale === 'es' ? 'es-NZ' : 'en-NZ';
        analyticsService.getDailyBleed(orchardId, 7, bcp47, { piece_rate, min_wage_rate }).then(data => {
            setBleedTrend(data.map(d => d.label === 'Today' ? { ...d, label: t('dashboard.wage.today') } : d));
        });
    }, [orchardId, locale, t, piece_rate, min_wage_rate]);

    // Estado salarial de cada picker: MISMO cálculo que Análisis, Informe y Payroll
    // (harvestMetrics/pay.ts). Antes usaba p.hours, que nadie rellena, y por eso
    // siempre daba "0 perdido, 100% cumple".
    const bucketRecords = useHarvestStore(state => state.bucketRecords);
    const perPicker = useMemo(
        () => computePerPicker(crew, bucketRecords ?? [], { piece_rate, min_wage_rate, shift_start_time: undefined }),
        [crew, bucketRecords, piece_rate, min_wage_rate],
    );
    const analysisResults = useMemo(() => {
        const minWage = Math.max(min_wage_rate || 0, PAY_RULES.minWageFloor);
        const crewById = new Map(crew.map(p => [p.id, p]));

        return perPicker.flatMap(m => {
            const p = crewById.get(m.pickerId);
            if (!p) return [];
            const earnings = m.pieceRateEarnings;
            const minWageEarnings = m.hoursWorked * minWage;
            const percentage = minWageEarnings > 0 ? (earnings / minWageEarnings) * 100 : 100;
            const baseStatus: 'safe' | 'at_risk' | 'below_minimum' =
                percentage >= 100 ? 'safe' : percentage >= 80 ? 'at_risk' : 'below_minimum';

            // El estado salarial sale SOLO del cálculo de pago; las alertas de
            // descanso u horas se muestran aparte y no marcan "por debajo del mínimo".
            const pickerAlerts = alerts.filter(a => a.details?.pickerId === p.id);
            const teamLeader = teamLeaders.find(l => l.id === p.team_leader_id);

            return [{
                picker: p,
                status: baseStatus,
                earnings,
                minWageEarnings,
                deficit: m.topUp,
                teamLeaderName: teamLeader?.name || 'Unassigned',
                pace: m.hoursWorked > 0 ? Math.round(m.bins / m.hoursWorked) : m.bins,
                alerts: pickerAlerts,
            }];
        }).sort((a, b) => {
            const statusOrder = { below_minimum: 0, at_risk: 1, safe: 2 };
            if (statusOrder[a.status] !== statusOrder[b.status]) {
                return statusOrder[a.status] - statusOrder[b.status];
            }
            return b.deficit - a.deficit;
        });
    }, [perPicker, crew, teamLeaders, min_wage_rate, alerts]);

    // Aggregate metrics
    const totalBleed = useMemo(() =>
        analysisResults.reduce((sum, r) => sum + r.deficit, 0),
        [analysisResults]
    );

    const counts = useMemo(() => ({
        safe: analysisResults.filter(r => r.status === 'safe').length,
        at_risk: analysisResults.filter(r => r.status === 'at_risk').length,
        below_minimum: analysisResults.filter(r => r.status === 'below_minimum').length,
        total: analysisResults.length,
    }), [analysisResults]);

    const complianceRate = counts.total > 0
        ? Math.round((counts.safe / counts.total) * 100)
        : 100;

    // Team bleed breakdown
    const teamBleed = useMemo(() => {
        const teams: Record<string, number> = {};
        analysisResults.forEach(r => {
            teams[r.teamLeaderName] = (teams[r.teamLeaderName] || 0) + r.deficit;
        });
        return Object.entries(teams)
            .map(([team, deficit]) => ({ team, deficit }))
            .filter(t => t.deficit > 0)
            .sort((a, b) => b.deficit - a.deficit);
    }, [analysisResults]);

    const maxTeamBleed = teamBleed.length > 0 ? Math.max(...teamBleed.map(t => t.deficit)) : 1;

    const criticalPickers = analysisResults.filter(r => r.status !== 'safe').slice(0, 5);
    const hasCritical = criticalPickers.length > 0;

    return (
        <div className="bg-white rounded-2xl border border-rose-100 shadow-sm overflow-hidden flex flex-col animate-fade-in">
            {/* ─── HEADER & BLEED KPI ─── */}
            <div className="p-5 bg-gradient-to-br from-rose-50 to-white border-b border-rose-100">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${hasCritical ? 'bg-rose-100' : 'bg-emerald-100'}`}>
                            <span aria-hidden="true" className={`material-symbols-outlined text-xl ${hasCritical ? 'text-rose-600' : 'text-emerald-600'}`}>
                                {hasCritical ? 'shield' : 'verified_user'}
                            </span>
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800">{t('dashboard.wage_bleeding')}</h3>
                            <p className="text-xs text-slate-500 font-medium">{t('dashboard.wage.subtitle')}</p>
                        </div>
                    </div>
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-full border shadow-sm ${complianceRate >= 90
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : complianceRate >= 70
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                        {t('dashboard.wage.compliant').replace('{n}', String(complianceRate))}
                    </span>
                </div>

                <div className="flex items-end gap-3">
                    <p className="text-4xl font-black text-rose-600 tracking-tight tabular-nums">
                        ${totalBleed.toFixed(2)}
                    </p>
                    <p className="text-sm font-semibold text-rose-500 pb-1">{t('dashboard.wage.lost_today')}</p>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                    {t('dashboard.wage.min_wage_rate').replace('{n}', String(min_wage_rate))} • {t('dashboard.wage.piece_rate').replace('{n}', String(piece_rate))}
                </p>
            </div>

            {/* ─── SCROLLABLE CONTENT ─── */}
            <div className="p-5 overflow-y-auto space-y-6 max-h-[500px]">

                {/* 7-Day Bleed Trend */}
                <div className="section-enter stagger-1">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <span aria-hidden="true" className="material-symbols-outlined text-sm">trending_down</span>
                        {t('dashboard.wage.trend_title')}
                    </h4>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <TrendLineChart
                            data={bleedTrend}
                            height={140}
                            colorTheme="rose"
                            valuePrefix="$"
                            higherIsBetter={false}
                        />
                    </div>
                </div>

                {/* Team Bleed Breakdown */}
                {teamBleed.length > 0 && (
                    <div className="section-enter stagger-2">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <span aria-hidden="true" className="material-symbols-outlined text-sm">groups</span>
                            {t('dashboard.wage.bleed_by_team')}
                        </h4>
                        <div className="space-y-3">
                            {teamBleed.map((team, idx) => (
                                <div key={idx}>
                                    <div className="flex justify-between text-sm font-semibold mb-1">
                                        <span className="text-slate-700">{team.team}</span>
                                        <span className="text-rose-600 tabular-nums">-${team.deficit.toFixed(2)}</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                        <div
                                            className="bg-rose-400 h-full rounded-full transition-all duration-700"
                                            style={{ width: `${(team.deficit / maxTeamBleed) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Critical Pickers */}
                <div className="section-enter stagger-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <span aria-hidden="true" className="material-symbols-outlined text-sm">attach_money</span>
                        {hasCritical ? t('dashboard.wage.critical') : t('dashboard.wage.all_safe')}
                    </h4>

                    {!hasCritical ? (
                        <div className="p-6 text-center bg-emerald-50 rounded-xl border border-emerald-100">
                            <span aria-hidden="true" className="material-symbols-outlined text-4xl text-emerald-500 mb-2">check_circle</span>
                            <p className="text-sm font-bold text-emerald-700">
                                {t('dashboard.wage.all_safe_msg').replace('{n}', String(counts.safe))}
                            </p>
                            <p className="text-xs text-emerald-600/60 mt-1">{t('dashboard.wage.no_issues')}</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {criticalPickers.map((result) => (
                                <div
                                    key={result.picker.id}
                                    onClick={() => {
                                        openPickerProfile(result.picker.id || result.picker.picker_id);
                                    }}
                                    className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white hover:border-rose-300 hover:bg-rose-50 cursor-pointer transition-colors group shadow-sm"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${result.status === 'below_minimum'
                                            ? 'bg-red-100 text-red-600'
                                            : 'bg-yellow-100 text-yellow-600'
                                            }`}>
                                            {result.picker.name?.charAt(0) || '?'}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-slate-800 group-hover:text-rose-700 transition-colors truncate">
                                                {result.picker.name}
                                            </p>
                                            <p className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                                                <span aria-hidden="true" className="material-symbols-outlined text-xs">supervisor_account</span>
                                                {result.teamLeaderName}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-rose-600 tabular-nums">-${result.deficit.toFixed(2)}</p>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase">{result.pace} b/hr</p>
                                        </div>
                                        <span aria-hidden="true" className="material-symbols-outlined text-slate-300 group-hover:text-rose-500 text-lg">
                                            chevron_right
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WageShieldPanel;
