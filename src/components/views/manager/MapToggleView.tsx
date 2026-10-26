/**
 * MapToggleView — Consolidated map view with toggle.
 * Allows the manager to switch between:
 *   1. Tactical Map (OrchardMapView) — THE Director
 *   2. Heat Map (HeatMapView)
 *   3. Row List (RowListView)
 *
 * The tactical map's selectedBlockId filters all 3 views.
 */
import { selectPresentPickers } from '@/services/harvestMetrics/roster';
import React, { useState } from 'react';
import { Picker, BucketRecord, Tab } from '@/types';
import OrchardMapView from './OrchardMapView';
import { HeatMapView } from './HeatMapView';
import RowListView from './RowListView';
import ComponentErrorBoundary from '@/components/ui/ComponentErrorBoundary';
import { useTranslation } from '@/i18n';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { blockRowNumbers } from '@/utils/blockRows';

type MapMode = 'tactical' | 'heatmap' | 'list';

interface MapToggleViewProps {
    totalRows: number;
    crew: Picker[];
    bucketRecords: BucketRecord[];
    blockName: string;
    targetBucketsPerRow?: number;
    setActiveTab: (tab: Tab) => void;
    onRowClick?: (rowNum: number) => void;
}

const MODES: { id: MapMode; label: string; icon: string }[] = [
    { id: 'tactical', label: 'map.tactical', icon: 'strategy' },
    { id: 'heatmap', label: 'map.heat', icon: 'local_fire_department' },
    { id: 'list', label: 'map.list', icon: 'list_alt' },
];

const MapToggleView: React.FC<MapToggleViewProps> = ({
    totalRows,
    crew,
    bucketRecords,
    blockName,
    targetBucketsPerRow = 50,
    setActiveTab,
    onRowClick,
}) => {
    const { t } = useTranslation();
    const [mode, setMode] = useState<MapMode>('tactical');

    // La vista de lista cuenta pickers por fila: pickers trabajando ahora (antes recibía los runners)
    const runners = selectPresentPickers(crew);
    // Filas reales del huerto (los bloques pueden tener huecos); sin bloques, 1..totalRows
    const orchardBlocks = useHarvestStore(s => s.orchardBlocks);
    const rowNumbers = React.useMemo(() => {
        const all = new Set<number>();
        for (const b of orchardBlocks ?? []) for (const n of blockRowNumbers(b)) all.add(n);
        return all.size > 0 ? [...all].sort((a, b) => a - b) : undefined;
    }, [orchardBlocks]);

    return (
        <div className="flex flex-col h-full">
            {/* Toggle Bar */}
            <div className="p-3 border-b border-border-light bg-white/80 backdrop-blur-sm sticky top-0 z-10">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-fit mx-auto">
                    {MODES.map((m) => (
                        <button
                            key={m.id}
                            onClick={() => setMode(m.id)}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${mode === m.id
                                ? 'bg-white text-primary shadow-sm'
                                : 'text-text-sub hover:text-text-main'
                                }`}
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-base">{m.icon}</span>
                            {t(m.label)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content — key-based transitions */}
            <div className="flex-1 overflow-y-auto pb-24">
                <div key={mode} className="animate-scale-in">
                    {mode === 'tactical' && (
                        <ComponentErrorBoundary componentName="Tactical Map">
                            <OrchardMapView
                                crew={crew}
                                bucketRecords={bucketRecords}
                                targetBucketsPerRow={targetBucketsPerRow}
                                onRowClick={onRowClick}
                            />
                        </ComponentErrorBoundary>
                    )}

                    {mode === 'heatmap' && (
                        <ComponentErrorBoundary componentName="Heat Map">
                            <HeatMapView />
                        </ComponentErrorBoundary>
                    )}

                    {mode === 'list' && (
                        <ComponentErrorBoundary componentName="Row List">
                            <RowListView
                                runners={runners}
                                setActiveTab={setActiveTab}
                                onRowClick={onRowClick}
                                blockName={blockName}
                                totalRows={totalRows}
                                rowNumbers={rowNumbers}
                            />
                        </ComponentErrorBoundary>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MapToggleView;

