/**
 * useOrchardStructure — estado de la pantalla «Estructura del huerto»
 *
 * Carga temporadas, bloques de la temporada elegida y sus filas; cada acción
 * vuelve a cargar y, si es el huerto abierto en la app, refresca el mapa del
 * store (de ahí salen las variedades de «Precio de hoy por variedad» y los
 * objetivos por fila del mapa).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    orchardStructureRepository as repo,
    type BlockRow,
    type OrchardRowRecord,
    type SeasonRow,
} from '@/repositories/orchard-structure.repository';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { logger } from '@/utils/logger';
import { defaultSeasonId, structureErrorView, type StructureErrorView } from './structureLogic';

export interface OrchardStructureState {
    seasons: SeasonRow[];
    seasonId: string | null;
    blocks: BlockRow[];
    rows: OrchardRowRecord[];
    loading: boolean;
    busy: boolean;
    error: StructureErrorView | null;
    selectSeason: (id: string) => void;
    clearError: () => void;
    /** Ejecuta un cambio; devuelve false si falló (el error queda en `error`) */
    run: (action: () => Promise<unknown>, opts?: { selectSeason?: (result: unknown) => string | null; onSaved?: (result: unknown) => void }) => Promise<boolean>;
    reload: () => Promise<void>;
}

export function useOrchardStructure(orchardId: string | null | undefined): OrchardStructureState {
    const [seasons, setSeasons] = useState<SeasonRow[]>([]);
    const [seasonId, setSeasonId] = useState<string | null>(null);
    const [blocks, setBlocks] = useState<BlockRow[]>([]);
    const [rows, setRows] = useState<OrchardRowRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<StructureErrorView | null>(null);
    const seasonRef = useRef<string | null>(null);
    seasonRef.current = seasonId;

    const load = useCallback(async (preferSeason?: string | null) => {
        if (!orchardId) {
            setSeasons([]); setBlocks([]); setRows([]); setSeasonId(null); setLoading(false);
            return;
        }
        try {
            const list = await repo.listSeasons(orchardId);
            const wanted = preferSeason ?? seasonRef.current;
            const sid = wanted && list.some(s => s.id === wanted) ? wanted : defaultSeasonId(list);
            const b = sid ? await repo.listBlocks(sid) : [];
            const r = b.length > 0 ? await repo.listRows(b.map(x => x.id)) : [];
            setSeasons(list); setSeasonId(sid); setBlocks(b); setRows(r);
        } catch (err) {
            logger.error('[OrchardStructure] load failed:', err);
            setError(structureErrorView(err));
        } finally {
            setLoading(false);
        }
    }, [orchardId]);

    useEffect(() => {
        setLoading(true);
        seasonRef.current = null;
        void load(null);
    }, [load]);

    const refreshStore = useCallback(async () => {
        const state = useHarvestStore.getState();
        if (orchardId && state.orchard?.id === orchardId) await state.fetchBlocks(orchardId);
    }, [orchardId]);

    const run = useCallback<OrchardStructureState['run']>(async (action, opts) => {
        setBusy(true);
        setError(null);
        try {
            const result = await action();
            // Antes de recargar: el formulario se vacía ya (si no, lo que se escribe mientras recarga se borraría)
            opts?.onSaved?.(result);
            await load(opts?.selectSeason?.(result) ?? undefined);
            await refreshStore();
            return true;
        } catch (err) {
            logger.warn('[OrchardStructure] change failed:', err);
            setError(structureErrorView(err));
            await load();
            return false;
        } finally {
            setBusy(false);
        }
    }, [load, refreshStore]);

    const selectSeason = useCallback((id: string) => {
        setLoading(true);
        void load(id);
    }, [load]);

    return {
        seasons, seasonId, blocks, rows, loading, busy, error,
        selectSeason,
        clearError: () => setError(null),
        run,
        reload: () => load(),
    };
}
