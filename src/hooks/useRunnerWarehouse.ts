/**
 * useRunnerWarehouse — datos del Almacén del runner.
 *
 *   - mis solicitudes de transporte (las que pedí yo, activas), con estado;
 *   - pedir recogida de los bins llenos del almacén (crea una solicitud real,
 *     en cola si no hay red) y cancelar una pendiente;
 *   - bins del huerto agrupados por zona, llenos primero;
 *   - refresco cada 60 s y al volver a primer plano (los realtime de bins y
 *     solicitudes ya los coalesca Logística; aquí basta con un sondeo suave).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useMessaging } from '@/context/MessagingContext';
import {
    fetchBinInventory,
    fetchTransportRequests,
    createTransportRequest,
    cancelTransportRequest,
    type BinInventory,
    type TransportRequest,
} from '@/services/logistics-dept.service';
import { Role } from '@/types/app.types';
import { safeUUID } from '@/utils/uuid';
import { logger } from '@/utils/logger';

export const WAREHOUSE_REFRESH_MS = 60_000;
/** Zona con la que Logística ve en «Solicitudes» una recogida pedida desde el almacén */
export const WAREHOUSE_ZONE = 'Warehouse';

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
    const { sendBroadcast } = useMessaging();
    const orchardId = appUser?.orchard_id ?? undefined;
    const userId = appUser?.id;
    const userName = appUser?.full_name;

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

    /**
     * Pide que recojan los bins llenos del almacén: solicitud de transporte real
     * (cola offline, igual que «pedir bins vacíos» en Logística) que aparece al
     * momento en «mis solicitudes»; aviso a Logística y manager si hay red.
     */
    const requestPickup = useCallback(async (fullBins: number): Promise<TransportRequest> => {
        if (!orchardId || !userId) throw new Error('No orchard or user for the pickup request');
        const request: TransportRequest = {
            id: safeUUID(),
            requested_by: userId,
            requester_name: userName || 'Runner',
            zone: WAREHOUSE_ZONE,
            bins_count: Math.max(1, fullBins),
            priority: 'high',
            status: 'pending',
            created_at: new Date().toISOString(),
            notes: 'Full bins at the warehouse need a pickup',
        };
        await createTransportRequest({
            id: request.id,
            orchard_id: orchardId,
            requested_by: request.requested_by,
            requester_name: request.requester_name,
            zone: request.zone,
            bins_count: request.bins_count,
            priority: request.priority,
            notes: request.notes,
        });
        // Optimista: ya está en la cola; el sondeo la reconcilia con el servidor
        setRequests(prev => [request, ...prev.filter(r => r.id !== request.id)]);
        sendBroadcast('Pickup needed', `${request.requester_name} needs ${request.bins_count} full bin(s) picked up at the warehouse`, 'high', [
            Role.LOGISTICS,
            Role.MANAGER,
        ]).catch(() => undefined);
        return request;
    }, [orchardId, userId, userName, sendBroadcast]);

    const cancelMine = useCallback(async (request: TransportRequest) => {
        if (request.requested_by !== userId || request.status !== 'pending') return;
        await cancelTransportRequest(request.id);
        // Optimista: la cola offline lo manda cuando pueda
        setRequests(prev => prev.map(r => r.id === request.id ? { ...r, status: 'cancelled' } : r));
    }, [userId]);

    return { bins, zones, myRequests, loading, reload, requestPickup, cancelMine };
}
