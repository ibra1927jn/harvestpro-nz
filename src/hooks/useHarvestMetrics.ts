/**
 * useHarvestMetrics — Fuente única de verdad para KPIs del dashboard/insights
 *
 * Lee crew y bucketRecords del store (misma fuente que el Dashboard),
 * delega el cálculo a services/harvestMetrics/ (puro, testeable).
 * Ambos DashboardView e InsightsView deben usar este hook para garantizar paridad.
 *
 * "now" se actualiza cada 60 segundos vía un ticker — no en cada render —
 * para evitar que proyecciones y horas derived cambien al hacer hover.
 */
import { useState, useEffect, useMemo } from 'react';
import { useHarvestStore } from '@/stores/useHarvestStore';
import {
    computePerPicker,
    computeKPIs,
    computePerTeam,
    rankByEfficiency,
    computeHoursElapsed,
    type PickerMetrics,
    type HarvestKPIs,
    type TeamMetrics,
} from '@/services/harvestMetrics';

export interface HarvestMetrics {
    kpis: HarvestKPIs;
    perPicker: PickerMetrics[];
    perTeam: TeamMetrics[];
    /** Ordenados de más eficiente (menor costPerBin) a menos */
    efficiency: PickerMetrics[];
    /** Horas de turno transcurridas (desde shiftStart hasta now) */
    hoursElapsed: number;
    /** Snapshot de "now" — se actualiza cada 60s */
    now: Date;
}

export function useHarvestMetrics(): HarvestMetrics {
    const crew = useHarvestStore(s => s.crew);
    const bucketRecords = useHarvestStore(s => s.bucketRecords);
    const settings = useHarvestStore(s => s.settings);

    // Ticker de 60s para proyecciones — no en cada render
    const [now, setNow] = useState<Date>(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(id);
    }, []);

    const shiftStart = settings.shift_start_time ?? '07:00';

    const perPicker = useMemo(
        () => computePerPicker(crew, bucketRecords, settings, now),
        [crew, bucketRecords, settings, now]
    );

    const kpis = useMemo(() => computeKPIs(perPicker), [perPicker]);

    const perTeam = useMemo(() => computePerTeam(perPicker, crew), [perPicker, crew]);

    const efficiency = useMemo(() => rankByEfficiency(perPicker), [perPicker]);

    const hoursElapsed = useMemo(
        () => computeHoursElapsed(shiftStart, now),
        [shiftStart, now]
    );

    // Sin hora de fin de turno no hay «proyección a fin de día»: la meta se
    // expresa como hora estimada al ritmo actual (analyticsService.calculateETA).
    return { kpis, perPicker, perTeam, efficiency, hoursElapsed, now };
}
