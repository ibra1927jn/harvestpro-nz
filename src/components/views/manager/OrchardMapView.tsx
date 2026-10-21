/**
 * OrchardMapView — Tactical Command Center
 *
 * Refactored architecture:
 *   OrchardMapView.tsx       — Thin orchestrator (~130 lines)
 *   useOrchardMap.ts         — Data hook (store, computations)
 *   orchardMapUtils.ts       — Pure utility functions (colors, labels)
 *   orchard-map/
 *     ├── ProgressRing.tsx   — SVG circular progress
 *     ├── BlockCard.tsx      — Level 1 block card
 *     ├── RowCard.tsx        — Level 2 row card + picker avatars
 *     └── index.ts           — Barrel export
 */
import React from 'react';
import { Picker, BucketRecord } from '@/types';
import { useOrchardMap } from '@/hooks/useOrchardMap';
import { getVarietyStyle } from '@/utils/orchardMapUtils';
import { rowTeamHighlight } from '@/services/harvestMetrics/rowTeams';
import { ProgressRing, BlockCard, RowCard } from './orchard-map';
import { useTranslation } from '@/i18n';

interface OrchardMapViewProps {
    crew: Picker[];
    bucketRecords: BucketRecord[];
    targetBucketsPerRow?: number;
    onRowClick?: (rowNum: number) => void;
    /**
     * Vista del team leader: resalta las filas donde está SU equipo y deja en
     * gris (con el nombre del team leader) las de los otros equipos.
     * Sin la prop (manager) el mapa no cambia.
     */
    highlightTeamLeaderId?: string;
}

export default function OrchardMapView({
    crew,
    bucketRecords,
    targetBucketsPerRow = 50,
    onRowClick,
    highlightTeamLeaderId,
}: OrchardMapViewProps) {
    const map = useOrchardMap(crew, bucketRecords, targetBucketsPerRow);
    const { t } = useTranslation();

    return (
        <div className="flex flex-col gap-4 px-4 pb-4 pt-14 animate-fade-in">
            {/* ═══ FLOATING HUD ═══ */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white/70 backdrop-blur-lg border border-border-light shadow-sm">
                <div className="flex items-center gap-3">
                    <span aria-hidden="true" className="material-symbols-outlined text-xl text-primary material-icon-filled">agriculture</span>
                    <div>
                        <h2 className="text-sm font-black text-text-main tracking-tight">
                            {map.orchardName} — {t('orchardMap.command_center')}
                        </h2>
                        <div className="flex items-center gap-3 text-xs text-text-muted mt-0.5">
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-breathe" />
                                {map.totalActivePickers} {t('orchardMap.active')}
                            </span>
                            <span>·</span>
                            <span>🍒 {map.totalBuckets} {t('orchardMap.buckets')}</span>
                            <span>·</span>
                            <span>{map.orchardBlocks.length} {t('orchardMap.blocks')} · {map.totalRows} {t('orchardMap.rows')}</span>
                        </div>
                    </div>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 border border-red-200 text-xs font-bold text-red-700">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-breathe" />
                    {t('orchardMap.live')}
                </div>
            </div>

            {/* ═══ LEYENDA DE EQUIPOS (vista del team leader) ═══ */}
            {highlightTeamLeaderId && (
                <div className="flex items-center gap-4 px-2 text-xs text-text-muted" data-testid="team-legend">
                    <span className="flex items-center gap-1.5">
                        <span className="w-4 h-2.5 rounded-sm bg-indigo-500" />
                        {t('orchardMap.team.legend_mine')}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-4 h-2.5 rounded-sm bg-slate-400" />
                        {t('orchardMap.team.legend_other')}
                    </span>
                </div>
            )}

            {/* ═══ BREADCRUMB ═══ */}
            {map.selectedBlock && (
                <div className="flex items-center gap-2 px-1 text-xs animate-fade-in">
                    <button onClick={() => map.setSelectedBlock(null)} className="flex items-center gap-1 text-primary hover:text-primary/80 font-bold transition-colors">
                        <span aria-hidden="true" className="material-symbols-outlined text-sm">arrow_back</span>
                        <span>🍒 {map.orchardName}</span>
                    </button>
                    <span className="text-text-muted">›</span>
                    <span className="font-bold text-text-main">{map.selectedBlock.name}</span>
                    <span className="text-text-muted">·</span>
                    <span className="text-text-muted">
                        {map.blockVarieties.length === 1
                            ? t('orchardMap.one_variety').replace('{n}', '1')
                            : t('orchardMap.n_varieties').replace('{n}', String(map.blockVarieties.length))}
                    </span>
                </div>
            )}

            {/* ═══ CONTENT ═══ */}
            <div key={map.selectedBlockId || 'macro-view'} className="animate-scale-in">
                {!map.selectedBlock ? (
                    /* ─── LEVEL 1: Block Cards ─── */
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-20">
                        {map.orchardBlocks.map((block, i) => (
                            <BlockCard
                                key={block.id}
                                block={block}
                                stats={map.blockStats[block.id] || { buckets: 0, activePickers: 0, completedRows: 0, progress: 0 }}
                                varieties={map.blockVarietySummaries[block.id] || []}
                                index={i}
                                onClick={() => map.setSelectedBlock(block.id)}
                            />
                        ))}
                    </div>
                ) : (
                    /* ─── LEVEL 2: Row Grid ─── */
                    <div className="pb-20">
                        {/* Variety Filter */}
                        <div className="flex flex-wrap items-center gap-2 mb-4 px-1">
                            <span className="text-xs font-bold text-text-muted uppercase tracking-wider mr-1">{t('orchardMap.variety_filter')}:</span>
                            <button
                                onClick={() => map.setSelectedVariety('ALL')}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 ${map.selectedVariety === 'ALL' ? 'bg-primary text-white shadow-sm' : 'bg-slate-100 text-text-sub hover:bg-slate-200'}`}
                            >
                                {t('orchardMap.all')} ({map.selectedBlock.totalRows})
                            </button>
                            {map.blockVarieties.map(v => {
                                const vs = getVarietyStyle(v);
                                const count = map.rowData.filter(rd => rd.variety === v).length;
                                return (
                                    <button
                                        key={v}
                                        onClick={() => map.setSelectedVariety(v)}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 variety-filter-btn ${map.selectedVariety === v ? 'shadow-sm ring-2 ring-offset-1' : 'hover:scale-105'}`}
                                        style={{
                                            '--filter-bg': map.selectedVariety === v ? vs.dot : vs.bg,
                                            '--filter-text': map.selectedVariety === v ? '#fff' : vs.text,
                                        } as React.CSSProperties}
                                    >
                                        <span className="w-2 h-2 rounded-full variety-dot" style={{ '--variety-dot': map.selectedVariety === v ? '#fff' : vs.dot } as React.CSSProperties} />
                                        🍒 {v} ({count})
                                    </button>
                                );
                            })}
                        </div>

                        {/* Block Summary Header */}
                        <div className="flex items-center justify-between mb-4 px-2">
                            <div className="flex items-center gap-3">
                                <ProgressRing progress={map.blockStats[map.selectedBlock.id]?.progress || 0} />
                                <div>
                                    <h3 className="text-sm font-bold text-text-main">{map.selectedBlock.name} — {t('orchardMap.row.rows')}</h3>
                                    <div className="text-xs text-text-muted">
                                        {map.blockStats[map.selectedBlock.id]?.completedRows || 0}/{map.selectedBlock.totalRows} {t('orchardMap.row.completed')}
                                        · {map.blockStats[map.selectedBlock.id]?.activePickers || 0} {t('orchardMap.row.active_pickers')}
                                    </div>
                                </div>
                            </div>
                            <div className="hidden sm:flex items-center gap-3 text-xs text-text-muted">
                                {[
                                    { color: 'bg-slate-200', label: t('orchardMap.status.empty') },
                                    { color: 'bg-amber-400', label: t('orchardMap.status.in_progress') },
                                    { color: 'bg-emerald-500', label: t('orchardMap.status.complete') },
                                ].map(l => (
                                    <div key={l.label} className="flex items-center gap-1.5">
                                        <div className={`w-4 h-2.5 rounded-sm ${l.color}`} />
                                        <span>{l.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Row Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                            {(map.selectedVariety === 'ALL'
                                ? map.rowData
                                : map.rowData.filter(rd => rd.variety === map.selectedVariety)
                            ).map((rd, i) => (
                                <RowCard
                                    key={rd.rowNum}
                                    rd={rd}
                                    index={i}
                                    rowAssignments={map.rowAssignments}
                                    onRowClick={onRowClick}
                                    teamHighlight={highlightTeamLeaderId
                                        ? rowTeamHighlight(highlightTeamLeaderId, rd.rowNum, rd.pickers, map.rowAssignments, crew)
                                        : null}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
