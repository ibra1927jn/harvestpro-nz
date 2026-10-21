/**
 * useLogistics — Data loading + realtime for the LogisticsDept page
 *
 * Extracts data fetching and Supabase Realtime subscriptions from
 * LogisticsDept.tsx following the usePayroll pattern.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/services/supabase';
import {
    fetchLogisticsSummary, fetchFleet, fetchBinInventory,
    fetchTransportRequests, fetchTransportHistory,
    type LogisticsSummary, type Tractor, type BinInventory,
    type TransportRequest, type TransportLog
} from '@/services/logistics-dept.service';
import { logger } from '@/utils/logger';

/** Espera para juntar varios cambios de realtime en una recarga */
export const LOGISTICS_REFRESH_DEBOUNCE_MS = 2000;

export interface UseLogisticsResult {
    summary: LogisticsSummary;
    tractors: Tractor[];
    bins: BinInventory[];
    requests: TransportRequest[];
    history: TransportLog[];
    isLoading: boolean;
    reload: () => Promise<void>;
}

export function useLogistics(): UseLogisticsResult {
    const [summary, setSummary] = useState<LogisticsSummary>({
        fullBins: 0, emptyBins: 0, activeTractors: 0, pendingRequests: 0, binsInTransit: 0,
    });
    const [tractors, setTractors] = useState<Tractor[]>([]);
    const [bins, setBins] = useState<BinInventory[]>([]);
    const [requests, setRequests] = useState<TransportRequest[]>([]);
    const [history, setHistory] = useState<TransportLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const reload = useCallback(async () => {
        setIsLoading(true);
        try {
            const [sum, fleet, binData, reqs, hist] = await Promise.all([
                fetchLogisticsSummary(),
                fetchFleet(),
                fetchBinInventory(),
                fetchTransportRequests(),
                fetchTransportHistory(),
            ]);
            setSummary(sum);
            setTractors(fleet);
            setBins(binData);
            setRequests(reqs);
            setHistory(hist);
        } catch (err) {
            logger.warn('[Logistics] Failed to load logistics data:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        reload();

        // Realtime: los cambios que llegan seguidos (asignar, completar, varias
        // peticiones a la vez) se juntan en una sola recarga a los 2 s. Antes
        // cada evento lanzaba 2 consultas más el resumen de 3.
        let pending = { requests: false, fleet: false };
        let timer: ReturnType<typeof setTimeout> | null = null;
        const flush = () => {
            timer = null;
            const want = pending;
            pending = { requests: false, fleet: false };
            Promise.all([
                want.requests ? fetchTransportRequests() : null,
                want.fleet ? fetchFleet() : null,
                fetchLogisticsSummary(),
            ]).then(([reqs, fleet, sum]) => {
                if (reqs) setRequests(reqs);
                if (fleet) setTractors(fleet);
                setSummary(sum);
            }).catch(err => logger.warn('[Logistics] Realtime refresh failed:', err));
        };
        const schedule = (what: 'requests' | 'fleet') => {
            pending[what] = true;
            if (!timer) timer = setTimeout(flush, LOGISTICS_REFRESH_DEBOUNCE_MS);
        };
        const channel = supabase
            .channel('logistics-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests' }, () => schedule('requests'))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'fleet_vehicles' }, () => schedule('fleet'))
            .subscribe();

        return () => {
            if (timer) clearTimeout(timer);
            supabase.removeChannel(channel);
        };
    }, [reload]);

    return { summary, tractors, bins, requests, history, isLoading, reload };
}
