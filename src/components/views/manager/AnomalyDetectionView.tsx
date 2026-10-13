/**
 * AnomalyDetectionView — Intelligent Fraud Shield (Phase 7 v3)
 *
 * Now fetches anomalies from the backend Edge Function (detect-anomalies).
 * Falls back to mock data when offline or Edge Function unavailable.
 *
 * Smart rules implemented server-side:
 * 1. Elapsed-time velocity (not burst — accumulated buckets are normal)
 * 2. Peer comparison within same row (if everyone is fast = good tree)
 * 3. Grace period for shift warmup (first 90 min = no velocity alerts)
 *
 * Sub-components extracted to anomaly/ directory.
 */
import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/utils/logger';
import { fraudDetectionService, Anomaly } from '../../../services/fraud-detection.service';
import { useHarvestStore } from '../../../stores/useHarvestStore';
import ComponentErrorBoundary from '@/components/ui/ComponentErrorBoundary';
import { FILTER_LABELS, type FilterType } from './anomaly/anomaly.constants';
import AnomalyCard from './anomaly/AnomalyCard';
import SmartDismissals from './anomaly/SmartDismissals';

const AnomalyDetectionView: React.FC = () => {
    const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
    const [loading, setLoading] = useState(true);
    const [isLive, setIsLive] = useState(false);
    const [filter, setFilter] = useState<FilterType>('all');
    const openPickerProfile = useHarvestStore(state => state.openPickerProfile);
    const orchard = useHarvestStore(state => state.orchard);
    const dismissed = fraudDetectionService.getDismissedExamples();

    const loadAnomalies = useCallback(async () => {
        setLoading(true);
        try {
            if (orchard?.id) {
                const result = await fraudDetectionService.fetchAnomalies(orchard.id);
                setAnomalies(result);
                setIsLive(result.length > 0);
            } else {
                setAnomalies([]);
                setIsLive(false);
            }
        } catch (err) {
            logger.error('[AnomalyDetection] Failed to load anomalies:', err);
            setAnomalies([]);
            setIsLive(false);
        } finally {
            setLoading(false);
        }
    }, [orchard?.id]);

    useEffect(() => {
        loadAnomalies();
    }, [loadAnomalies]);

    const filtered = filter === 'all' ? anomalies : anomalies.filter(a => a.type === filter);
    const highCount = anomalies.filter(a => a.severity === 'high').length;
    const medCount = anomalies.filter(a => a.severity === 'medium').length;
    const lowCount = anomalies.filter(a => a.severity === 'low').length;

    return (
        <ComponentErrorBoundary componentName="Fraud Detection">
            <div className="space-y-6 animate-fade-in pb-20">
                {/* ─── Header Banner ─── */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                    <span aria-hidden="true" className="material-symbols-outlined absolute -right-8 -top-8 text-[200px] text-white/5 pointer-events-none select-none">
                        shield
                    </span>

                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 relative z-10">
                        <div>
                            <h2 className="text-2xl font-bold flex items-center gap-3 mb-1">
                                <div className="p-2 bg-rose-500/20 rounded-lg border border-rose-500/30">
                                    <span aria-hidden="true" className="material-symbols-outlined text-xl text-rose-400">shield</span>
                                </div>
                                Fraud Shield
                                {isLive && (
                                    <span className="ml-2 px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 rounded-full text-xs font-semibold text-emerald-400 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                                        Live
                                    </span>
                                )}
                                {!isLive && !loading && (
                                    <span className="ml-2 px-2 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded-full text-xs font-semibold text-amber-400">
                                        Demo
                                    </span>
                                )}
                            </h2>
                            <p className="text-slate-400 text-sm">
                                {isLive
                                    ? 'Server-side detection — real-time analysis of scan patterns'
                                    : 'Intelligent detection — understands real orchard workflows'}
                            </p>
                        </div>

                        <div className="flex gap-3">
                            {[
                                { label: 'High', count: highCount, color: 'text-rose-400' },
                                { label: 'Medium', count: medCount, color: 'text-amber-400' },
                                { label: 'Low', count: lowCount, color: 'text-sky-400' },
                                { label: 'Dismissed', count: dismissed.length, color: 'text-emerald-400' },
                            ].map(({ label, count, color }) => (
                                <div key={label} className="text-center bg-slate-800/50 px-4 py-2 rounded-xl border border-slate-700">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
                                    <p className={`text-2xl font-black ${color} tabular-nums`}>{count}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Refresh button */}
                    <button aria-label="Refresh anomalies"
                        onClick={loadAnomalies}
                        disabled={loading}
                        className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white transition-colors disabled:opacity-50 z-20"
                        title="Refresh anomalies"
                    >
                        <span aria-hidden="true" className={`material-symbols-outlined text-xl ${loading ? 'animate-spin' : ''}`}>
                            refresh
                        </span>
                    </button>
                </div>

                {/* ─── Smart Rules Explanation ─── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                        { emoji: '⏱', title: 'Rule 1: Elapsed Time', desc: 'Measures buckets ÷ time since last collection. Accumulated buckets under trees = normal. Impossible after-pickup spike = alert.' },
                        { emoji: '👥', title: 'Rule 2: Peer Check', desc: 'Compares each picker to their row mates. If everyone is fast = good tree. If ONLY one person is racing = suspicious.' },
                        { emoji: '🌅', title: 'Rule 3: Grace Period', desc: 'First 90 min = warmup. Ladders, cold fruit, no tractors yet. System observes silently, only flags impossible velocity.' },
                    ].map(rule => (
                        <div key={rule.title} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">{rule.emoji}</span>
                                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">{rule.title}</span>
                            </div>
                            <p className="text-xs text-slate-500">{rule.desc}</p>
                        </div>
                    ))}
                </div>

                {/* ─── Loading State ─── */}
                {loading && (
                    <div className="flex items-center justify-center py-16">
                        <div className="text-center">
                            <div className="w-10 h-10 border-3 border-slate-300 border-t-slate-700 rounded-full animate-spin mx-auto mb-3" />
                            <p className="text-sm text-slate-500 font-medium">Analyzing scan patterns…</p>
                        </div>
                    </div>
                )}

                {/* ─── Filter Chips ─── */}
                {!loading && (
                    <div className="flex gap-2 overflow-x-auto pb-2 items-center">
                        <span aria-hidden="true" className="material-symbols-outlined text-slate-400 text-xl shrink-0 mr-1">filter_list</span>
                        {(Object.keys(FILTER_LABELS) as FilterType[]).map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${filter === f
                                    ? 'bg-slate-800 text-white shadow-md scale-105'
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                {FILTER_LABELS[f]}
                                {f !== 'all' && (
                                    <span className="ml-1.5 text-xs opacity-60">
                                        ({anomalies.filter(a => a.type === f).length})
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {/* ─── Anomaly Cards ─── */}
                {!loading && (
                    <>
                        {filtered.length === 0 ? (
                            <div className="text-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                <span aria-hidden="true" className="material-symbols-outlined text-5xl text-emerald-400 mb-3 block">verified_user</span>
                                <p className="text-lg font-bold text-slate-700">No anomalies detected</p>
                                <p className="text-sm text-slate-400 mt-1">All scan patterns look normal for this filter</p>
                            </div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2">
                                {filtered.map((anomaly, idx) => (
                                    <AnomalyCard
                                        key={anomaly.id}
                                        anomaly={anomaly}
                                        index={idx}
                                        onViewProfile={openPickerProfile}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* ─── Smart Dismissals ─── */}
                <SmartDismissals dismissed={dismissed} />
            </div>
        </ComponentErrorBoundary>
    );
};

export default AnomalyDetectionView;
