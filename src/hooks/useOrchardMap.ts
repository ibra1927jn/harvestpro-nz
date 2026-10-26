/**
 * useOrchardMap — Data logic and computations for OrchardMapView
 */
import { useMemo } from 'react';
import { Picker, BucketRecord, OrchardBlock, RowAssignment } from '@/types';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { getRowProgress } from '@/utils/orchardMapUtils';
import { binsPerHourForRow } from '@/services/harvestMetrics/perRow';
import { selectPresentPickers } from '@/services/harvestMetrics/roster';
import { blockRowNumbers } from '@/utils/blockRows';

export interface RowData {
    rowNum: number;
    buckets: number;
    pickers: Picker[];
    variety: string;
    progress: number;
    binsPerHour: number | null;
    rowTarget: number;
}

export interface BlockStats {
    buckets: number;
    activePickers: number;
    completedRows: number;
    progress: number;
}

export interface OrchardMapData {
    // Store
    orchardBlocks: OrchardBlock[];
    selectedBlock: OrchardBlock | null;
    selectedBlockId: string | null;
    selectedVariety: string;
    setSelectedBlock: (id: string | null) => void;
    setSelectedVariety: (v: string) => void;
    orchardName: string;
    rowAssignments: RowAssignment[];

    // Computed
    blockStats: Record<string, BlockStats>;
    blockVarietySummaries: Record<string, string[]>;
    blockVarieties: string[];
    rowData: RowData[];
    pickersByRow: Record<number, Picker[]>;

    // Global stats
    totalActivePickers: number;
    totalBuckets: number;
    totalRows: number;
}

export function useOrchardMap(
    crew: Picker[],
    bucketRecords: BucketRecord[],
    targetBucketsPerRow: number,
): OrchardMapData {
    const orchardBlocks = useHarvestStore(s => s.orchardBlocks);
    const rowTargets = useHarvestStore(s => s.rowTargets);
    const selectedBlockId = useHarvestStore(s => s.selectedBlockId);
    const selectedVariety = useHarvestStore(s => s.selectedVariety);
    const setSelectedBlock = useHarvestStore(s => s.setSelectedBlock);
    const setSelectedVariety = useHarvestStore(s => s.setSelectedVariety);
    const orchard = useHarvestStore(s => s.orchard);
    const rowAssignments = useHarvestStore(s => s.rowAssignments);

    const selectedBlock = orchardBlocks.find(b => b.id === selectedBlockId) || null;

    // Pickers-by-row lookup
    // En el mapa, cada fila muestra a los pickers que están trabajando AHORA
    // (fichados y sin salida) — misma regla que la cabecera y el panel.
    // Cubetas válidas (sin rechazos de QC ni borradas): las mismas que el panel
    const validBuckets = useMemo(
        () => bucketRecords.filter(b => b.quality_grade !== 'reject' && !(b as { deleted_at?: string | null }).deleted_at),
        [bucketRecords],
    );

    const pickersByRow = useMemo(() => {
        const map: Record<number, Picker[]> = {};
        const present = selectPresentPickers(crew);
        rowAssignments.forEach(ra => {
            if (!map[ra.row_number]) map[ra.row_number] = [];
            ra.assigned_pickers.forEach(pid => {
                const p = present.find(c => c.id === pid);
                if (p && !map[ra.row_number].find(x => x.id === p.id)) {
                    map[ra.row_number].push(p);
                }
            });
        });
        present.forEach(p => {
            if (p.current_row > 0) {
                if (!map[p.current_row]) map[p.current_row] = [];
                if (!map[p.current_row].find(x => x.id === p.id)) {
                    map[p.current_row].push(p);
                }
            }
        });
        return map;
    }, [rowAssignments, crew]);

    // Varieties for selected block
    const blockVarieties = useMemo(() => {
        if (!selectedBlock) return [];
        return Array.from(new Set(Object.values(selectedBlock.rowVarieties)));
    }, [selectedBlock]);

    // Variety summaries per block (for Level 1 badges)
    const blockVarietySummaries = useMemo(() => {
        const summaries: Record<string, string[]> = {};
        orchardBlocks.forEach(block => {
            summaries[block.id] = Array.from(new Set(Object.values(block.rowVarieties)));
        });
        return summaries;
    }, [orchardBlocks]);

    // Block-level stats
    // Una fila se considera completa cuando sus baldes alcanzan el target de esa fila
    // (rowTargets viene de block_rows.target_buckets en DB).
    // Si no hay datos en rowTargets para esa fila, se usa targetBucketsPerRow como fallback.
    const blockStats = useMemo(() => {
        const stats: Record<string, BlockStats> = {};
        orchardBlocks.forEach(block => {
            let blockBuckets = 0, blockPickers = 0, blockCompletedRows = 0;
            const rows = blockRowNumbers(block);
            for (const row of rows) {
                const rowBuckets = validBuckets.filter(br => br.row_number === row).length;
                blockBuckets += rowBuckets;
                blockPickers += (pickersByRow[row] || []).length;
                const rowTarget = rowTargets[row] ?? targetBucketsPerRow;
                if (rowBuckets >= rowTarget) blockCompletedRows++;
            }
            stats[block.id] = {
                buckets: blockBuckets,
                activePickers: blockPickers,
                completedRows: blockCompletedRows,
                progress: rows.length > 0 ? blockCompletedRows / rows.length : 0,
            };
        });
        return stats;
    }, [orchardBlocks, validBuckets, targetBucketsPerRow, rowTargets, pickersByRow]);

    // Row data for selected block
    const rowData = useMemo(() => {
        if (!selectedBlock) return [];
        // Filas reales del bloque (puede tener huecos)
        return blockRowNumbers(selectedBlock).map(rowNum => {
            const buckets = validBuckets.filter(br => br.row_number === rowNum).length;
            const pickers = pickersByRow[rowNum] || [];
            const variety = selectedBlock.rowVarieties[rowNum] || 'Unknown';
            const rowTarget = rowTargets[rowNum] ?? targetBucketsPerRow;
            const bph = binsPerHourForRow(rowNum, validBuckets);
            return {
                rowNum, buckets, pickers, variety,
                progress: getRowProgress(buckets, rowTarget),
                binsPerHour: bph,
                rowTarget,
            };
        });
    }, [selectedBlock, validBuckets, targetBucketsPerRow, rowTargets, pickersByRow]);

    // Global stats — misma definición que DashboardView (status === 'active')
    const totalActivePickers = selectPresentPickers(crew).length;
    const totalBuckets = validBuckets.length;
    const totalRows = orchardBlocks.reduce((s, b) => s + b.totalRows, 0);

    return {
        orchardBlocks, selectedBlock, selectedBlockId, selectedVariety,
        setSelectedBlock, setSelectedVariety,
        orchardName: orchard?.name || 'Orchard',
        rowAssignments,
        blockStats, blockVarietySummaries, blockVarieties,
        rowData, pickersByRow,
        totalActivePickers, totalBuckets, totalRows,
    };
}
