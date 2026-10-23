/**
 * HeatMapView — Premium Grid-Based Heat Map
 *
 * Smart component: reads directly from Zustand (no prop drilling).
 * Displays harvest density per row as a color-coded grid.
 *
 * Design decisions (from field feedback):
 * - Aspect-square cells with internal fill level (no dynamic heights)
 * - Tap-based tooltips via React state (works on iPad with gloves)
 * - Zustand-powered: reads bucketRecords, selectedBlockId, orchardBlocks
 */
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { analyticsService } from '@/services/analytics.service';
import { todayNZST, toNZST } from '@/utils/nzst';
import { logger } from '@/utils/logger';
import { useTranslation } from '@/i18n';
import { blockRowNumbers } from '@/utils/blockRows';

type DateRange = 'today' | 'last7days' | 'last30days';

interface RowDensity {
    row_number: number;
    total_buckets: number;
    unique_pickers: number;
    avg_buckets_per_picker: number;
    density_score: number;
    target_completion: number;
}

/* ── Color helpers ──────────────────────────────────── */
const getHeatColor = (completion: number): string => {
    if (completion >= 100) return 'bg-emerald-500';
    if (completion >= 75) return 'bg-emerald-400/80';
    if (completion >= 50) return 'bg-amber-400';
    if (completion >= 25) return 'bg-orange-400';
    if (completion > 0) return 'bg-red-400';
    return 'bg-slate-200';
};

const getHeatBorder = (completion: number): string => {
    if (completion >= 100) return 'border-emerald-600';
    if (completion >= 75) return 'border-emerald-500';
    if (completion >= 50) return 'border-amber-500';
    if (completion >= 25) return 'border-orange-500';
    if (completion > 0) return 'border-red-500';
    return 'border-slate-300';
};

const getHeatText = (completion: number): string => {
    if (completion >= 100) return 'text-emerald-900';
    if (completion >= 50) return 'text-amber-900';
    if (completion > 0) return 'text-red-900';
    return 'text-slate-400';
};

const getHeatFillBg = (completion: number): string => {
    if (completion >= 100) return 'bg-emerald-400/40';
    if (completion >= 75) return 'bg-emerald-300/35';
    if (completion >= 50) return 'bg-amber-300/35';
    if (completion >= 25) return 'bg-orange-300/35';
    if (completion > 0) return 'bg-red-300/35';
    return 'bg-transparent';
};

// label = clave de traducción
const DATE_OPTIONS: { id: DateRange; label: string; icon: string }[] = [
    { id: 'today', label: 'common.today', icon: 'today' },
    { id: 'last7days', label: 'heatmap.days_7', icon: 'date_range' },
    { id: 'last30days', label: 'heatmap.days_30', icon: 'calendar_month' },
];

/* ══════════════════════════════════════════════════════
   HEAT MAP VIEW COMPONENT
   ══════════════════════════════════════════════════════ */
export const HeatMapView: React.FC = () => {
    const { t } = useTranslation();
    /* ── Zustand (smart component reads its own data) ── */
    const orchard = useHarvestStore(s => s.orchard);
    const orchardBlocks = useHarvestStore(s => s.orchardBlocks);
    const selectedBlockId = useHarvestStore(s => s.selectedBlockId);

    /* ── Local State ─────────────────────────────────── */
    const [dateRange, setDateRange] = useState<DateRange>('today');
    const [rowDensities, setRowDensities] = useState<RowDensity[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTooltip, setActiveTooltip] = useState<number | null>(null);
    const [stats, setStats] = useState({
        totalBuckets: 0,
        rowsHarvested: 0,
        completedRows: 0,
        pendingRows: 0,
    });

    const containerRef = useRef<HTMLDivElement>(null);

    /* ── Derived data ─────────────────────────────────── */
    const selectedBlock = useMemo(
        () => orchardBlocks.find(b => b.id === selectedBlockId) || null,
        [orchardBlocks, selectedBlockId]
    );

    const blockLabel = selectedBlock?.name || t('heatmap.all_blocks');

    /* ── Get date range start ────────────────────────── */
    const getStartDate = useCallback((range: DateRange): string => {
        const today = todayNZST();
        switch (range) {
            case 'today':
                return today;
            case 'last7days':
                return toNZST(new Date(Date.now() - 7 * 86400000)).split('T')[0];
            case 'last30days':
                return toNZST(new Date(Date.now() - 30 * 86400000)).split('T')[0];
        }
    }, []);

    /* ── Load data ────────────────────────────────────── */
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const today = todayNZST();
                const start = getStartDate(dateRange);

                const analytics = await analyticsService.getRowDensity(
                    orchard?.id || '',
                    start,
                    today,
                    100
                );

                // Filter by selected block if one is chosen
                let densities = analytics.density_by_row;
                if (selectedBlock) {
                    // Filas reales del bloque (puede tener huecos)
                    const blockRows = new Set(blockRowNumbers(selectedBlock));
                    densities = densities.filter(d => blockRows.has(d.row_number));
                }

                setRowDensities(densities);
                setStats({
                    totalBuckets: densities.reduce((s, d) => s + d.total_buckets, 0),
                    rowsHarvested: densities.filter(d => d.total_buckets > 0).length,
                    completedRows: densities.filter(d => d.target_completion >= 100).length,
                    pendingRows: densities.filter(d => d.target_completion < 50).length,
                });
            } catch (err) {
                logger.error('[HeatMap] Error loading data:', err);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [dateRange, orchard?.id, selectedBlock, getStartDate]);

    /* ── Close tooltip on outside click ────────────── */
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setActiveTooltip(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    /* ── Toggle tooltip (tap-based) ──────────────────── */
    const handleCellTap = useCallback((rowNum: number) => {
        setActiveTooltip(prev => (prev === rowNum ? null : rowNum));
    }, []);

    /* ── Fill all rows (including empty) for the grid ── */
    const gridData = useMemo(() => {
        if (!selectedBlock) return rowDensities;
        // Create entries for ALL rows in the block, filling missing ones with zeros
        const densityMap = new Map(rowDensities.map(d => [d.row_number, d]));
        const allRows: RowDensity[] = [];
        for (const i of blockRowNumbers(selectedBlock)) {
            allRows.push(densityMap.get(i) || {
                row_number: i,
                total_buckets: 0,
                unique_pickers: 0,
                avg_buckets_per_picker: 0,
                density_score: 0,
                target_completion: 0,
            });
        }
        return allRows;
    }, [selectedBlock, rowDensities]);

    /* ══════════════════════════════════════════════════
       RENDER
       ══════════════════════════════════════════════════ */
    return (
        <div ref={containerRef} className="p-4 pb-24">
            {/* ── Header ─────────────────────────────── */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/20">
                        <span aria-hidden="true" className="material-symbols-outlined text-white text-lg">local_fire_department</span>
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-slate-800 leading-tight">{t('heatmap.title')}</h2>
                        <p className="text-[11px] text-slate-400 font-medium">{blockLabel}</p>
                    </div>
                </div>
            </div>

            {/* ── Date Range Toggle ──────────────────── */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl mb-4">
                {DATE_OPTIONS.map(opt => (
                    <button
                        key={opt.id}
                        onClick={() => { setDateRange(opt.id); setActiveTooltip(null); }}
                        className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold transition-all ${dateRange === opt.id
                                ? 'bg-white text-orange-600 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-sm">{opt.icon}</span>
                        {t(opt.label)}
                    </button>
                ))}
            </div>

            {/* ── Summary Strip ──────────────────────── */}
            <div className="grid grid-cols-4 gap-2 mb-4">
                {[
                    { label: t('tl.home.buckets'), value: stats.totalBuckets, color: 'text-slate-800', bg: 'bg-slate-50', border: 'border-slate-200' },
                    { label: t('heatmap.active'), value: stats.rowsHarvested, color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
                    { label: t('heatmap.complete'), value: stats.completedRows, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
                    { label: t('heatmap.critical'), value: stats.pendingRows, color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
                ].map(stat => (
                    <div key={stat.label} className={`p-2.5 rounded-xl ${stat.bg} border ${stat.border} text-center`}>
                        <p className={`text-lg font-black ${stat.color} tabular-nums`}>{stat.value}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
                    </div>
                ))}
            </div>

            {/* ── Legend ──────────────────────────────── */}
            <div className="flex items-center gap-3 mb-4 px-1">
                {[
                    { color: 'bg-emerald-500', label: '≥100%' },
                    { color: 'bg-amber-400', label: '50-99%' },
                    { color: 'bg-red-400', label: '<50%' },
                    { color: 'bg-slate-200', label: t('heatmap.no_data') },
                ].map(l => (
                    <div key={l.label} className="flex items-center gap-1">
                        <div className={`w-3 h-3 rounded-sm ${l.color}`} />
                        <span className="text-[10px] text-slate-500 font-medium">{l.label}</span>
                    </div>
                ))}
            </div>

            {/* ── Loading ─────────────────────────────── */}
            {loading && (
                <div className="flex flex-col items-center justify-center py-16">
                    <div className="w-10 h-10 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin mb-3" />
                    <p className="text-sm text-slate-400 font-medium">{t('heatmap.loading')}</p>
                </div>
            )}

            {/* ── Grid ────────────────────────────────── */}
            {!loading && gridData.length > 0 && (
                <div className="grid grid-cols-5 sm:grid-cols-5 gap-2">
                    {gridData.map((density, idx) => {
                        const isActive = activeTooltip === density.row_number;
                        const fillHeight = Math.min(100, density.target_completion);
                        const completion = density.target_completion;

                        return (
                            <div
                                key={density.row_number}
                                onClick={() => handleCellTap(density.row_number)}
                                className={`relative aspect-square rounded-xl border-2 overflow-hidden cursor-pointer transition-all duration-300 select-none
                                    ${isActive ? `${getHeatBorder(completion)} ring-2 ring-offset-1 ring-orange-300 scale-105 z-20` : `${getHeatBorder(completion)} hover:scale-[1.03]`}
                                    ${getHeatColor(completion)} section-enter stagger-${Math.min(idx + 1, 8)}`}
                                style={{ animationDelay: `${idx * 30}ms` }}
                            >
                                {/* Fill level — water glass effect from bottom */}
                                <div className="absolute inset-0 flex flex-col justify-end">
                                    <div
                                        className={`${getHeatFillBg(completion)} transition-all duration-700 ease-out rounded-b-lg`}
                                        style={{ height: `${fillHeight}%` }}
                                    />
                                </div>

                                {/* Cell content */}
                                <div className="absolute inset-0 flex flex-col items-center justify-center p-1 z-10">
                                    <span className={`text-[10px] font-bold ${getHeatText(completion)} opacity-70`}>
                                        R{density.row_number}
                                    </span>
                                    <span className={`text-sm font-black ${getHeatText(completion)} tabular-nums leading-none`}>
                                        {completion >= 100 ? '✓' : `${Math.round(completion)}%`}
                                    </span>
                                    <span className={`text-[8px] font-semibold ${getHeatText(completion)} opacity-60 tabular-nums`}>
                                        {density.total_buckets}b
                                    </span>
                                </div>

                                {/* Tooltip — tap-based, fixed position */}
                                {isActive && (
                                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full z-30 w-44 animate-scale-in">
                                        <div className="bg-slate-900 text-white rounded-xl p-3 shadow-xl shadow-black/20 text-left">
                                            <p className="text-xs font-black mb-1.5">{t('runner.row_n', { n: density.row_number })}</p>
                                            <div className="space-y-1">
                                                <div className="flex justify-between">
                                                    <span className="text-[10px] text-slate-400">{t('tl.home.buckets')}</span>
                                                    <span className="text-[10px] font-bold">{density.total_buckets}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-[10px] text-slate-400">{t('pd.pickers')}</span>
                                                    <span className="text-[10px] font-bold">{density.unique_pickers}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-[10px] text-slate-400">{t('pd.avg_picker')}</span>
                                                    <span className="text-[10px] font-bold">{density.avg_buckets_per_picker.toFixed(1)}</span>
                                                </div>
                                                <div className="flex justify-between items-center mt-1 pt-1 border-t border-slate-700">
                                                    <span className="text-[10px] text-slate-400">{t('heatmap.target')}</span>
                                                    <span className={`text-xs font-black ${completion >= 100 ? 'text-emerald-400' : completion >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                                                        {Math.round(completion)}%
                                                    </span>
                                                </div>
                                            </div>
                                            {/* Arrow */}
                                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-slate-900" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Empty State ─────────────────────────── */}
            {!loading && gridData.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <span aria-hidden="true" className="material-symbols-outlined text-5xl text-slate-300 mb-3">grid_off</span>
                    <p className="text-sm font-bold text-slate-500">{t('heatmap.empty')}</p>
                    <p className="text-xs text-slate-400 mt-1">{t('heatmap.empty_desc')}</p>
                </div>
            )}
        </div>
    );
};

export default HeatMapView;
