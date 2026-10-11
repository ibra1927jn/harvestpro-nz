/**
 * useWeeklyReport — Datos y cálculos para WeeklyReportView
 *
 * KPIs del día (totalBuckets, totalEarnings, costPerBin) provienen
 * de weeklySeries → computePerPicker + computeKPIs para garantizar
 * paridad exacta con el tab Analytics (useHarvestMetrics).
 *
 * Pago y horas: Edge Function calculate-payroll; si falla, el mismo cálculo
 * (pay.ts, complemento por día) en el cliente. Gráficos: analyticsService.
 */
import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { payrollService, PickerBreakdown } from '@/services/payroll.service';
import { analyticsService } from '@/services/analytics.service';
import { startOfWeekNZ, toNZST } from '@/utils/nzst';
import { TrendDataPoint, DayMeta } from '@/components/charts/TrendLineChart';
import { logger } from '@/utils/logger';
import { Picker } from '@/types';
import { supabase } from '@/services/supabase';
import { payForRange, PAY_RULES } from '@/services/harvestMetrics';

export interface TeamRanking {
    name: string;
    buckets: number;
    hours: number;
    earnings: number;
    count: number;
    bpa: number;
}

export interface WeeklyReportData {
    // Raw data
    pickers: PickerBreakdown[];
    binsTrend: TrendDataPoint[];
    workforceTrend: TrendDataPoint[];
    isLoading: boolean;

    // Aggregations
    totalBuckets: number;
    totalHours: number;
    totalEarnings: number;
    avgBPA: number;
    costPerBin: number;
    dailyBinTarget: number | undefined;

    // Team data
    teamRankings: TeamRanking[];

    // Day detail
    selectedDayMeta: DayMeta | null;
    setSelectedDayMeta: React.Dispatch<React.SetStateAction<DayMeta | null>>;

    // Export state
    showExportModal: boolean;
    setShowExportModal: React.Dispatch<React.SetStateAction<boolean>>;

    // Context
    orchard: { id: string; name?: string; total_rows?: number } | null;
    crew: Picker[];

    // Actions
    openProfile: (pickerId: string) => void;
}

interface WeekAttendanceRow {
    picker_id: string;
    date: string;
    check_in: string | null;
    check_out: string | null;
    break_start?: string | null;
    break_minutes?: number | null;
}

interface WeekBucketRow {
    picker_id: string;
    scanned_at: string;
    quality_grade?: string | null;
}

/** Desglose semanal por picker con el cálculo único (complemento por día). */
export function buildWeekBreakdown(params: {
    attendance: ReadonlyArray<WeekAttendanceRow>;
    buckets: ReadonlyArray<WeekBucketRow>;
    crew: ReadonlyArray<Pick<Picker, 'id' | 'name'>>;
    pieceRate: number;
    minWage: number;
    now?: Date;
}): PickerBreakdown[] {
    const minWage = Math.max(params.minWage, PAY_RULES.minWageFloor);
    const rows = payForRange({
        attendance: params.attendance.map(a => ({
            pickerId: a.picker_id,
            date: a.date,
            checkIn: a.check_in,
            checkOut: a.check_out,
            breakStart: a.break_start,
            breakMinutes: a.break_minutes,
        })),
        buckets: params.buckets.map(b => ({
            pickerId: b.picker_id,
            scannedAt: b.scanned_at,
            qualityGrade: b.quality_grade,
        })),
        pieceRate: params.pieceRate,
        minWage,
        now: params.now,
    });
    return rows.map(r => ({
        picker_id: r.pickerId,
        picker_name: params.crew.find(c => c.id === r.pickerId)?.name || 'Unknown',
        buckets: r.buckets,
        hours_worked: r.hours,
        piece_rate_earnings: r.pieceEarnings,
        hourly_rate: r.hours > 0 ? Math.round((r.pieceEarnings / r.hours) * 100) / 100 : 0,
        minimum_required: Math.round(r.hours * minWage * 100) / 100,
        top_up_required: r.topUp,
        total_earnings: r.total,
        is_below_minimum: r.daysBelowMinimum > 0,
    }));
}

/** Totales de la semana a partir del desglose por picker. */
export function summarizeBreakdown(pickers: ReadonlyArray<PickerBreakdown>) {
    let hours = 0, earnings = 0, buckets = 0;
    for (const p of pickers) {
        hours += p.hours_worked;
        earnings += p.total_earnings;
        buckets += p.buckets;
    }
    return {
        totalHours: Math.round(hours * 100) / 100,
        totalEarnings: Math.round(earnings * 100) / 100,
        costPerBin: buckets > 0 ? Math.round((earnings / buckets) * 100) / 100 : 0,
        avgBPA: hours > 0 ? Math.round((buckets / hours) * 10) / 10 : 0,
    };
}

export function useWeeklyReport(): WeeklyReportData {
    const { locale } = useTranslation();
    const orchardId = useHarvestStore(s => s.orchard?.id);
    const orchard = useHarvestStore(s => s.orchard);
    const settings = useHarvestStore(s => s.settings);
    const crew = useHarvestStore(s => s.crew);
    const openPickerProfile = useHarvestStore(s => s.openPickerProfile);

    const dailyBinTarget = settings?.target_tons
        ? Math.round((settings.target_tons * 72) / 30)
        : undefined;

    const [pickers, setPickers] = useState<PickerBreakdown[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [binsTrend, setBinsTrend] = useState<TrendDataPoint[]>([]);
    const [workforceTrend, setWorkforceTrend] = useState<TrendDataPoint[]>([]);
    const [selectedDayMeta, setSelectedDayMeta] = useState<DayMeta | null>(null);
    const [showExportModal, setShowExportModal] = useState(false);

    useEffect(() => {
        const load = async () => {
            if (!orchardId) { setIsLoading(false); return; }
            setIsLoading(true);
            const payrollPromise = payrollService.calculateThisWeek(orchardId)
                .then(result => setPickers(result.picker_breakdown))
                .catch(async (e) => {
                    logger.warn('[WeeklyReport] Payroll edge function failed — activating client-side fallback:', e);
                    try {
                        // Fallback: mismo cálculo que la Edge Function (pay.ts), día a día.
                        const nzFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' });
                        const todayStr = nzFmt.format(new Date());
                        const weekStart = startOfWeekNZ();
                        const nzOffset = toNZST(new Date()).slice(-6); // "+12:00" o "+13:00"

                        const [bucketsRes, attendanceRes] = await Promise.all([
                            supabase
                                .from('bucket_records')
                                .select('picker_id, scanned_at, quality_grade')
                                .eq('orchard_id', orchardId)
                                .is('deleted_at', null)
                                .gte('scanned_at', `${weekStart}T00:00:00${nzOffset}`)
                                .lte('scanned_at', `${todayStr}T23:59:59${nzOffset}`),
                            supabase
                                .from('daily_attendance')
                                .select('picker_id, date, check_in, check_out, break_start, break_minutes')
                                .eq('orchard_id', orchardId)
                                .gte('date', weekStart)
                                .lte('date', todayStr),
                        ]);

                        const breakdown = buildWeekBreakdown({
                            attendance: (attendanceRes.data || []) as WeekAttendanceRow[],
                            buckets: (bucketsRes.data || []) as WeekBucketRow[],
                            crew,
                            pieceRate: settings?.piece_rate ?? 6.5,
                            minWage: settings?.min_wage_rate ?? PAY_RULES.minWageFloor,
                        });
                        setPickers(breakdown);
                        logger.info(`[WeeklyReport] Client-side fallback: ${breakdown.length} pickers computed`);
                    } catch (fallbackErr) {
                        logger.error('[WeeklyReport] Both edge function and fallback failed:', fallbackErr);
                    }
                });
            const trendsPromise = (async () => {
                // Formateador de weekday localizado para convertir 'YYYY-MM-DD' → 'Mon', 'Lun', etc.
                // new Date(date + 'T00:00:00Z') = medianoche UTC = mediodía NZ NZST (UTC+12) → día NZ correcto.
                const weekdayFmt = new Intl.DateTimeFormat(locale, {
                    timeZone: 'Pacific/Auckland',
                    weekday: 'short',
                });
                const nzFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' });
                const endDateNZ = nzFmt.format(new Date());
                const startDateNZ = startOfWeekNZ();

                const trends = await analyticsService.getDailyTrendsV2(orchardId, startDateNZ, endDateNZ);

                const applyLabel = <T extends { label: string }>(pts: T[]) =>
                    pts.map(p => ({ ...p, label: weekdayFmt.format(new Date(p.label + 'T00:00:00Z')) }));
                setBinsTrend(applyLabel(trends.totalBins));
                setWorkforceTrend(applyLabel(trends.workforceSize));

            })().catch(e => logger.warn('[WeeklyReport] Trends failed:', e));
            await Promise.allSettled([payrollPromise, trendsPromise]);
            setIsLoading(false);
        };
        load();
    // crew y settings NO son dependencias intencionales: el re-fetch solo debe dispararse
    // cuando cambia el orchard o el idioma. El fallback usa crew/settings del momento de
    // la llamada (stale closure aceptable — crew ya está hidratado cuando el fallback activa).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orchardId, locale]);

    // KPIs semanales. Cubetas: las del gráfico (getDailyTrendsV2).
    // Horas, pago y coste por cubeta: suma del desglose por picker, calculado
    // día a día con pay.ts (incluye el complemento al mínimo).
    const totalBuckets = useMemo(
        () => binsTrend.reduce((sum, pt) => sum + pt.value, 0),
        [binsTrend],
    );
    const { totalHours, totalEarnings, costPerBin, avgBPA } = useMemo(
        () => summarizeBreakdown(pickers),
        [pickers],
    );

    // Team rankings — siguen derivándose desde payrollService para el leaderboard
    const teamRankings = useMemo(() => {
        const teamMap = new Map<string, { buckets: number; hours: number; earnings: number; count: number }>();
        pickers.forEach(p => {
            const crewMember = crew.find(c => c.picker_id === p.picker_id || c.name === p.picker_name);
            const leaderId = crewMember?.team_leader_id || 'unassigned';
            const leader = crew.find(c => c.id === leaderId);
            const teamName = leader?.name || 'Unassigned';
            const entry = teamMap.get(teamName) ?? { buckets: 0, hours: 0, earnings: 0, count: 0 };
            const updated = {
                buckets: entry.buckets + p.buckets,
                hours: entry.hours + p.hours_worked,
                earnings: entry.earnings + p.total_earnings,
                count: entry.count + 1,
            };
            teamMap.set(teamName, updated);
        });
        return Array.from(teamMap.entries())
            .map(([name, data]) => ({ name, ...data, bpa: data.hours > 0 ? data.buckets / data.hours : 0 }))
            .sort((a, b) => b.bpa - a.bpa);
    }, [pickers, crew]);

    const openProfile = (pickerId: string) => {
        // bucket_records.picker_id == pickers.id (UUID) — mismo ID que espera openPickerProfile
        openPickerProfile(pickerId);
    };

    return {
        pickers, binsTrend, workforceTrend, isLoading,
        totalBuckets, totalHours, totalEarnings, avgBPA, costPerBin, dailyBinTarget,
        teamRankings,
        selectedDayMeta, setSelectedDayMeta,
        showExportModal, setShowExportModal,
        orchard, crew,
        openProfile,
    };
}
