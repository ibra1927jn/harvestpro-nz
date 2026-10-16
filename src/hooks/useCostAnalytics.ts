/**
 * useCostAnalytics — Data loading and cost calculations for CostAnalyticsView
 *
 * KPIs del día: desde useHarvestMetrics (misma fuente que DashboardView — Zustand store).
 * Tendencia histórica (7 días): getDailyTrendsV2 desde bucket_records (NZ timezone-aware).
 */
import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { PickerBreakdown } from '@/services/payroll.service';
import { analyticsService } from '@/services/analytics.service';
import { TrendDataPoint, DayMeta } from '@/components/charts/TrendLineChart';
import { logger } from '@/utils/logger';
import { useHarvestMetrics } from '@/hooks/useHarvestMetrics';
import { PAY_RULES } from '@/services/harvestMetrics/pay';

export interface TeamCost {
    teamLeader: string;
    pickers: number;
    totalBuckets: number;
    totalHours: number;
    totalEarnings: number;
    costPerBin: number;
}

export function useCostAnalytics() {
    const { locale } = useTranslation();
    const orchardId = useHarvestStore(s => s.orchard?.id);
    const settings = useHarvestStore(s => s.settings);
    const crew = useHarvestStore(s => s.crew);
    const openPickerProfile = useHarvestStore(s => s.openPickerProfile);

    // KPIs del día desde la fuente única de verdad (Zustand store, no Edge Function)
    const { kpis, perPicker, perTeam, efficiency } = useHarvestMetrics();

    const [isLoading, setIsLoading] = useState(true);
    const [costTrend, setCostTrend] = useState<TrendDataPoint[]>([]);
    const [selectedDayMeta, setSelectedDayMeta] = useState<DayMeta | null>(null);

    const breakEven = settings?.piece_rate;

    // Tendencia histórica 7 días — sólo este fetch sigue siendo async
    useEffect(() => {
        if (!orchardId) { setIsLoading(false); return; }
        setIsLoading(true);

        // costPerBin = [] hasta que se implemente daily_attendance+harvest_settings query.
        // TrendLineChart muestra empty state limpio cuando el array está vacío.
        const load = async () => {
            const nzFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' });
            const endDateNZ = nzFmt.format(new Date());
            const startDateNZ = nzFmt.format(new Date(Date.now() - 6 * 86_400_000));
            const trends = await analyticsService.getDailyTrendsV2(orchardId, startDateNZ, endDateNZ);
            setCostTrend(trends.costPerBin);
        };
        load()
            .catch(e => logger.warn('[CostAnalytics] Trends failed:', e))
            .finally(() => setIsLoading(false));
    }, [orchardId, locale]);

    // Mapear PickerMetrics → PickerBreakdown para compatibilidad con UI existente
    const pickers = useMemo<PickerBreakdown[]>(() =>
        perPicker.map(m => ({
            picker_id: m.pickerId,
            picker_name: m.pickerName,
            buckets: m.bins,
            hours_worked: m.hoursWorked,
            piece_rate_earnings: m.pieceRateEarnings,
            hourly_rate: settings?.min_wage_rate || PAY_RULES.minWageFloor,
            minimum_required: m.hoursWorked * (settings?.min_wage_rate || PAY_RULES.minWageFloor),
            top_up_required: m.topUp,
            total_earnings: m.earned,
            is_below_minimum: m.topUp > 0,
        })),
        [perPicker, settings?.min_wage_rate]
    );

    // Aggregates — desde kpis (ya computados por el hook)
    const totalBuckets = kpis.totalBins;
    const totalEarnings = kpis.totalLabour;
    const totalPieceRate = kpis.totalPieceRate;
    const totalTopUp = kpis.minWageTopUp;
    const costPerBin = kpis.costPerBin;

    // Team costs — desde perTeam (ya computado por el hook)
    const teamCosts = useMemo<TeamCost[]>(() =>
        perTeam.map(t => ({
            teamLeader: t.teamLeaderName,
            pickers: t.pickerCount,
            totalBuckets: t.totalBins,
            totalHours: t.totalHours,
            totalEarnings: t.totalEarnings,
            costPerBin: t.costPerBin,
        })),
        [perTeam]
    );

    // Efficiency ranking — desde efficiency (ya ordenado por el hook)
    const sortedByEfficiency = useMemo<PickerBreakdown[]>(() =>
        efficiency.map(m => ({
            picker_id: m.pickerId,
            picker_name: m.pickerName,
            buckets: m.bins,
            hours_worked: m.hoursWorked,
            piece_rate_earnings: m.pieceRateEarnings,
            hourly_rate: settings?.min_wage_rate || PAY_RULES.minWageFloor,
            minimum_required: m.hoursWorked * (settings?.min_wage_rate || PAY_RULES.minWageFloor),
            top_up_required: m.topUp,
            total_earnings: m.earned,
            is_below_minimum: m.topUp > 0,
        })),
        [efficiency, settings?.min_wage_rate]
    );

    const maxCostPerBin = Math.max(...teamCosts.map(t => t.costPerBin), costPerBin || 1);

    const openProfile = (pickerId: string) => {
        const picker =
            crew.find(c => c.picker_id === pickerId) ||
            crew.find(c => c.id === pickerId);
        if (picker) {
            openPickerProfile(picker.id);
        } else {
            openPickerProfile(pickerId);
        }
    };

    return {
        isLoading, pickers, costTrend, selectedDayMeta, setSelectedDayMeta,
        breakEven, totalBuckets, totalEarnings, totalPieceRate, totalTopUp, costPerBin,
        teamCosts, sortedByEfficiency, maxCostPerBin, openProfile,
    };
}
