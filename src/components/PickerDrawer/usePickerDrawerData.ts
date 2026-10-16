/**
 * usePickerDrawerData — Fuente única de datos para el PickerDrawer.
 *
 * Los metrics de "hoy" vienen de useHarvestMetrics().perPicker — MISMA fuente que
 * Dashboard Top 10 y Analytics. Garantiza paridad de números en todos los entry points.
 *
 * El historial (14 días) se obtiene async via picker-history.service.
 */
import { useMemo, useState, useEffect } from 'react';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { useHarvestMetrics } from '@/hooks/useHarvestMetrics';
import { pickerHistoryService, type PickerHistory } from '@/services/picker-history.service';
import { logger } from '@/utils/logger';
import type { Picker } from '@/types';
import { PAY_RULES } from '@/services/harvestMetrics/pay';

export interface PickerTodayData {
    bins: number;
    hoursWorked: number;
    earned: number;
    pieceRateEarnings: number;
    topUp: number;
    costPerBin: number;
    /** true cuando el picker no tiene scans hoy (muestra empty state en lugar de ceros) */
    empty: boolean;
}

export interface PickerDrawerData {
    picker: Picker | undefined;
    today: PickerTodayData;
    history: PickerHistory | null;
    isHistoryLoading: boolean;
    role: 'picker' | 'team_leader' | 'runner';
    minWage: number;
    pieceRate: number;
}

/**
 * Hook centralizado de datos para el PickerDrawer.
 * Recibe el pickerId (nullable) y retorna todos los datos necesarios para renderizar.
 */
export function usePickerDrawerData(pickerId: string | null): PickerDrawerData {
    const metrics = useHarvestMetrics();
    const crew = useHarvestStore(s => s.crew);
    const settings = useHarvestStore(s => s.settings);
    const orchardId = useHarvestStore(s => s.orchard?.id);
    const orchardName = useHarvestStore(s => s.orchard?.name ?? null);

    const [history, setHistory] = useState<PickerHistory | null>(null);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);

    // Fetch history async cuando cambia el picker seleccionado
    useEffect(() => {
        if (!pickerId || !orchardId) {
            setHistory(null);
            return;
        }
        setIsHistoryLoading(true);
        pickerHistoryService
            .getPickerHistory(pickerId, orchardId, 14, orchardName ?? undefined)
            .then(data => setHistory(data))
            .catch((e: unknown) => logger.error('[usePickerDrawerData] history fetch failed', e))
            .finally(() => setIsHistoryLoading(false));
    }, [pickerId, orchardId, orchardName]);

    const picker = useMemo(
        () => (pickerId ? crew.find(c => c.id === pickerId) : undefined),
        [crew, pickerId]
    );

    const pickerMetrics = useMemo(
        () => metrics.perPicker.find(p => p.pickerId === pickerId),
        [metrics.perPicker, pickerId]
    );

    const today: PickerTodayData = useMemo(() => {
        if (!pickerMetrics) {
            return {
                bins: 0,
                hoursWorked: 0,
                earned: 0,
                pieceRateEarnings: 0,
                topUp: 0,
                costPerBin: 0,
                empty: true,
            };
        }
        return {
            bins: pickerMetrics.bins,
            hoursWorked: pickerMetrics.hoursWorked,
            earned: pickerMetrics.earned,
            pieceRateEarnings: pickerMetrics.pieceRateEarnings,
            topUp: pickerMetrics.topUp,
            costPerBin: pickerMetrics.costPerBin,
            empty: false,
        };
    }, [pickerMetrics]);

    const rawRole = picker?.role ?? 'picker';
    const role: 'picker' | 'team_leader' | 'runner' =
        rawRole === 'team_leader' || rawRole === 'runner' ? rawRole : 'picker';

    const minWage = settings?.min_wage_rate ?? PAY_RULES.minWageFloor;
    const pieceRate = settings?.piece_rate ?? 6.5;

    return {
        picker,
        today,
        history,
        isHistoryLoading,
        role,
        minWage,
        pieceRate,
    };
}
