/**
 * useRunnerWarehouse — datos del Almacén del runner.
 *
 *   - mis solicitudes de transporte (las que pedí yo, activas), con estado;
 *   - bins del huerto agrupados por zona, llenos primero;
 *   - refresco cada 60 s y al volver a primer plano (los realtime de bins y
 *     solicitudes ya los coalesca Logística; aquí basta con un sondeo suave).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
    fetchBinInventory,
    fetchTransportRequests,
    cancelTransportRequest,
    type BinInventory,
    type TransportRequest,
} from '@/services/logistics-dept.service';
import { logger } from '@/utils/logger';

export const WAREHOUSE_REFRESH_MS = 60_000;

export interface ZoneBins {
    zone: string;
    bins: BinInventory[];
    full: number;
    empty: number;
}

/** Bins por zona, zonas con más llenos primero; dentro de la zona, llenos primero */
export function groupBinsByZone(bins: ReadonlyArray<BinInventory>): ZoneBins[] {
    const byZone = new Map<string, BinInventory[]>();
    for (const b of bins) {
        const list = byZone.get(b.zone) ?? [];
        list.push(b);
        byZone.set(b.zone, list);
    }
    const order: Record<BinInventory['status'], number> = { full: 0, in_transit: 1, filling: 2, at_warehouse: 3, empty: 4 };
    return [...byZone.entries()]
        .map(([zone, list]) => ({
            zone,
            bins: [...list].sort((a, b) => (order[a.status] - order[b.status]) || a.bin_code.localeCompare(b.bin_code)),
            full: list.filter(b => b.status === 'full').length,
            empty: list.filter(b => b.status === 'empty').length,
        }))
        .sort((a, b) => (b.full - a.full) || a.zone.localeCompare(b.zone));
}

export function useRunnerWarehouse() {
    const { appUser } = useAuth();
    const orchardId = appUser?.orchard_id ?? undefined;
    const userId = appUser?.id;

    const [bins, setBins] = useState<BinInventory[]>([]);
    const [requests, setRequests] = useState<TransportRequest[]>([]);
    const [loading, setLoading] = useState(true);

    const reload = useCallback(async () => {
        if (!orchardId) { setLoading(false); return; }
        try {
            const [b, r] = await Promise.all([fetchBinInventory(orchardId), fetchTransportRequests(orchardId)]);
            setBins(b);
            setRequests(r);
        } catch (e) {
            logger.warn('[RunnerWarehouse] reload failed', e);
        } finally {
            setLoading(false);
        }
    }, [orchardId]);

    useEffect(() => {
        void reload();
        const id = setInterval(() => { if (document.visibilityState === 'visible') void reload(); }, WAREHOUSE_REFRESH_MS);
        const onVisible = () => { if (document.visibilityState === 'visible') void reload(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
    }, [reload]);

    const myRequests = useMemo(() => requests.filter(r => r.requested_by === userId), [requests, userId]);
    const zones = useMemo(() => groupBinsByZone(bins), [bins]);

    const cancelMine = useCallback(async (request: TransportRequest) => {
        if (request.requested_by !== userId || request.status !== 'pending') return;
        await cancelTransportRequest(request.id);
        // Optimista: la cola offline lo manda cuando pueda
        setRequests(prev => prev.map(r => r.id === request.id ? { ...r, status: 'cancelled' } : r));
    }, [userId]);

    return { bins, zones, myRequests, loading, reload, cancelMine };
}
