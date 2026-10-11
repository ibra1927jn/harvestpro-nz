/**
 * intelligenceSlice - Stats, Payroll & Compliance
 * 
 * Recalculates payroll estimates, compliance alerts, and harvest stats.
 * Reads crew, buckets, and settings from global state via get().
 */
import { StateCreator } from 'zustand';
import { complianceService, ComplianceViolation } from '@/services/compliance.service';
import type { HarvestStoreState, IntelligenceSlice, HarvestStats } from '../storeTypes';
import { nowNZST } from '@/utils/nzst';
import { computePerPicker, dayPay, shiftHours, nzDateOf, isNZPublicHoliday } from '@/services/harvestMetrics';
import { selectPresentPickers } from '@/services/harvestMetrics/roster';
import type { BucketRecord } from '@/types';

// --- Default State ---
const defaultStats: HarvestStats = {
    totalBuckets: 0,
    payEstimate: 0,
    tons: 0,
    velocity: 0,
    goalVelocity: 0,
    binsFull: 0,
};

// --- Slice Creator ---
export const createIntelligenceSlice: StateCreator<
    HarvestStoreState,
    [],
    [],
    IntelligenceSlice
> = (set, get) => ({
    alerts: [],
    payroll: { totalPiece: 0, totalMinimum: 0, finalTotal: 0 },
    notifications: [],
    stats: defaultStats,

    recalculateIntelligence: () => {
        const state = get();
        const { crew, settings } = state;

        // 1. Pago estimado de hoy — MISMO cálculo que Análisis/Payroll (pay.ts):
        //    horas del fichaje (descanso no pagado) y complemento al mínimo por día.
        //    Cubetas: las del servidor + las escaneadas aquí que aún no se sincronizaron.
        const activeCrew = crew.filter(p => p.status !== 'archived');
        const pendingLocal: BucketRecord[] = state.buckets
            .filter(b => !b.synced)
            .map(b => ({
                id: b.id, picker_id: b.picker_id, bin_id: '', timestamp: b.timestamp,
                scanned_at: b.timestamp, quality_grade: b.quality_grade, orchard_id: b.orchard_id,
            }));
        const perPicker = computePerPicker(activeCrew, [...state.bucketRecords, ...pendingLocal], settings);
        const metricsById = new Map(perPicker.map(m => [m.pickerId, m]));

        let totalPiece = 0;
        let totalMinimum = 0;
        for (const m of perPicker) {
            totalPiece += m.pieceRateEarnings;
            totalMinimum += m.topUp;
        }
        const payroll = {
            totalPiece: Math.round(totalPiece * 100) / 100,
            totalMinimum: Math.round(totalMinimum * 100) / 100,
            finalTotal: Math.round((totalPiece + totalMinimum) * 100) / 100,
        };

        // 2. Compliance: horas, cubetas y salario del cálculo único; descanso real
        //    (break_start anotado por el team leader) e inicio real del turno.
        const alerts: ComplianceViolation[] = [];
        activeCrew.forEach(p => {
            const m = metricsById.get(p.id);
            const buckets = m?.bins ?? 0;
            const hours = m?.hoursWorked ?? 0;
            const pay = m ? dayPay({
                buckets,
                hours,
                pieceRate: settings.piece_rate || 6.5,
                minWage: settings.min_wage_rate || 23.95,
                isPublicHoliday: isNZPublicHoliday(nzDateOf(new Date())),
            }) : undefined;
            const startedAt = p.check_in
                ? new Date(p.check_in)
                : new Date(new Date(nowNZST()).getTime() - (hours * 3600000));

            const status = complianceService.checkPickerCompliance({
                pickerId: p.id,
                bucketCount: buckets,
                hoursWorked: hours,
                consecutiveMinutesWorked: 120, // Mock
                totalMinutesToday: hours * 60,
                lastRestBreakAt: null,
                lastMealBreakAt: p.break_start ? new Date(p.break_start) : null,
                lastHydrationAt: null,
                workStartTime: startedAt,
                pay,
            });

            if (status.violations.length > 0) {
                alerts.push(
                    ...status.violations.map(v => ({
                        ...v,
                        details: { ...v.details, pickerId: p.id, pickerName: p.name },
                    }))
                );
            }
        });

        // 3. Sync stats — totalBuckets y presentCount se derivan aquí para que
        //    todo el estado de inteligencia quede en un único lugar consistente.
        //    bucketRecords = baldes del servidor (hoy); buckets = ScannedBucket del scanner local
        // Cubetas = las mismas del panel (escaneos válidos, sin rechazos ni duplicar
        // los escaneos locales ya sincronizados). Presentes = pickers fichados hoy.
        const totalBuckets = perPicker.reduce((sum, m) => sum + m.bins, 0);
        const presentCount = selectPresentPickers(crew).length;
        const tons = totalBuckets * 0.025; // ~25 kg por balde estándar NZ

        // 4. Cubetas y horas de hoy de CADA persona, calculadas aquí una vez. Todas
        //    las pantallas que leen picker.total_buckets_today / picker.hours ven
        //    lo mismo que el panel y la nómina (antes: contador de BD siempre a 0).
        const now = new Date();
        let crewChanged = false;
        const enrichedCrew = crew.map(p => {
            const m = metricsById.get(p.id);
            const bins = m?.bins ?? 0;
            const hrs = m?.hoursWorked ?? shiftHours({
                checkIn: p.check_in, checkOut: p.check_out,
                breakStart: p.break_start, breakMinutes: p.break_minutes, now,
            }).hours;
            if (p.total_buckets_today === bins && p.hours === hrs) return p;
            crewChanged = true;
            return { ...p, total_buckets_today: bins, hours: hrs };
        });

        set({
            ...(crewChanged ? { crew: enrichedCrew } : {}),
            payroll,
            alerts,
            presentCount,
            stats: {
                ...state.stats,
                totalBuckets,
                tons,
                payEstimate: payroll.finalTotal,
            },
        });
    },
});
