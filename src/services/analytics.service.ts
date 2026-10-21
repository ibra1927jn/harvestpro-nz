/**
 * services/analytics.service.ts
 * Analytics & Reporting Service — Core calculations + report generation
 * Historical/trend queries live in analytics-trends.service.ts
 */
import { Picker, BucketRecord } from '../types';
import { formatNZTime } from '@/utils/nzFormat';
import { translate } from '@/i18n';
import { computePerPicker } from './harvestMetrics/perPicker';
import { PAY_RULES } from './harvestMetrics/pay';
import { AnalyticsTrendsService, analyticsTrendsService } from './analytics-trends.service';

interface ReportRow {
    name: string;
    picker_id: string;
    buckets: number;
    hours_worked: number;
    rate: number;
    earnings: number;
    min_wage_earnings: number;
    /** Complemento al mínimo del día */
    top_up: number;
    /** Pago total del día (cubetas + complemento) */
    total: number;
    /** De dónde salen las horas: fichaje, turno abierto, estimación */
    hours_source: string;
    status: 'safe' | 'at_risk' | 'below_minimum';
    team_leader: string;
}

export interface ReportMetadata {
    generated_at: string;
    last_sync: string;
    pending_queue_count: number;
    orchard_name: string;
    is_offline_data: boolean;
}

class AnalyticsService extends AnalyticsTrendsService {
    /**
     * Calculate Wage Shield status for a picker
     */
    calculateWageStatus(
        buckets: number,
        hoursWorked: number,
        pieceRate: number,
        minWageRate: number
    ): { status: 'safe' | 'at_risk' | 'below_minimum'; earnings: number; minWageEarnings: number } {
        const earnings = buckets * pieceRate;
        const minWageEarnings = hoursWorked * minWageRate;
        const percentage = minWageEarnings > 0 ? (earnings / minWageEarnings) * 100 : 100;

        let status: 'safe' | 'at_risk' | 'below_minimum';
        if (percentage >= 100) status = 'safe';
        else if (percentage >= 80) status = 'at_risk';
        else status = 'below_minimum';

        return { status, earnings, minWageEarnings };
    }

    /**
     * Group bucket records by hour for velocity chart
     */
    groupByHour(bucketRecords: BucketRecord[], hoursBack: number = 8): { hour: string; count: number }[] {
        // Horas de NZ: el desfase de NZ es de horas enteras, así que las horas UTC y las de NZ
        // empiezan en el mismo instante (antes se usaba la zona del móvil para cortar y etiquetar)
        const HOUR = 3_600_000;
        const now = Date.now();
        const currentHourStart = now - (now % HOUR);
        const result: { hour: string; count: number }[] = [];

        for (let i = hoursBack - 1; i >= 0; i--) {
            const hourStart = currentHourStart - i * HOUR;
            const hourEnd = hourStart + HOUR;

            const count = bucketRecords.filter((r) => {
                const recordTime = new Date(r.scanned_at || '').getTime();
                return recordTime >= hourStart && recordTime < hourEnd;
            }).length;

            result.push({ hour: formatNZTime(hourStart), count });
        }
        return result;
    }

    /**
     * Hora a la que se alcanza la meta al ritmo actual. No hay hora de fin de
     * turno (cada equipo y runner acaba cuando acaba, decisión del dueño
     * 2026-10-21): no se compara con ninguna hora límite ni se da un semáforo
     * adelantado/atrasado; solo «a este ritmo, la meta se alcanza a las HH:MM».
     */
    calculateETA(
        currentTons: number,
        targetTons: number,
        velocityPerHour: number,
        bucketsPerTon: number = 72,
    ): { eta: string; status: 'complete' | 'no_data' | 'projected'; hoursRemaining: number } {
        const remainingTons = targetTons - currentTons;
        if (remainingTons <= 0) return { eta: translate('analytics.eta_complete'), status: 'complete', hoursRemaining: 0 };
        if (velocityPerHour <= 0) return { eta: translate('analytics.eta_awaiting'), status: 'no_data', hoursRemaining: Infinity };

        const hoursNeeded = (remainingTons * bucketsPerTon) / velocityPerHour;
        const etaMs = Date.now() + hoursNeeded * 3_600_000;
        return { eta: formatNZTime(etaMs), status: 'projected', hoursRemaining: hoursNeeded };
    }

    /**
     * Generate CSV report with sync timestamp and offline warning
     */
    generateDailyReport(
        crew: Picker[],
        bucketRecords: BucketRecord[],
        settings: { piece_rate: number; min_wage_rate: number },
        teamLeaders: Picker[],
        metadata: ReportMetadata
    ): string {
        // Horas y pago del cálculo único (harvestMetrics/pay.ts): fichaje con
        // descanso no pagado y complemento al mínimo del día. Cubetas: los
        // escaneos del día (sin rechazos de QC), no el contador de la ficha.
        const metricsById = new Map(
            computePerPicker(crew, bucketRecords, settings).map(m => [m.pickerId, m])
        );
        const rows: ReportRow[] = crew
            .filter(p => p.role !== 'team_leader' && p.role !== 'runner')
            .map(p => {
                const m = metricsById.get(p.id);
                const buckets = m?.bins ?? 0;
                const hoursWorked = m?.hoursWorked ?? 0;
                const rate = hoursWorked > 0 ? buckets / hoursWorked : 0;
                const { status, minWageEarnings } = this.calculateWageStatus(buckets, hoursWorked, settings.piece_rate, Math.max(settings.min_wage_rate, PAY_RULES.minWageFloor));
                const teamLeader = teamLeaders.find(l => l.id === p.team_leader_id);
                return {
                    name: p.name, picker_id: p.picker_id, buckets, hours_worked: hoursWorked,
                    rate: Math.round(rate * 10) / 10,
                    earnings: m?.pieceRateEarnings ?? 0,
                    min_wage_earnings: Math.round(minWageEarnings * 100) / 100,
                    top_up: m?.topUp ?? 0,
                    total: m?.earned ?? 0,
                    hours_source: m?.hoursSource ?? 'none',
                    status,
                    team_leader: teamLeader?.name || 'Unassigned'
                };
            })
            .sort((a, b) => b.buckets - a.buckets);

        const lines: string[] = [];
        lines.push('# HarvestPro Daily Report');
        lines.push(`# Orchard: ${metadata.orchard_name}`);
        lines.push(`# Generated: ${metadata.generated_at}`);
        lines.push(`# Last Sync: ${metadata.last_sync}`);
        if (metadata.is_offline_data) lines.push(`# ⚠️ OFFLINE DATA - ${metadata.pending_queue_count} scans pending sync from other devices`);
        lines.push('');
        lines.push('Name,Picker ID,Buckets,Hours,Hours Source,Rate (bkt/hr),Piece Earnings ($),Min Wage ($),Top-Up ($),Total Pay ($),Status,Team Leader');
        const q = (s: string) => `"${String(s).replace(/"/g, '""').replace(/^([=+\-@\t\r])/, "'$1")}"`;
        rows.forEach(r => {
            lines.push([q(r.name), q(r.picker_id ?? ''), r.buckets, r.hours_worked, r.hours_source, r.rate, r.earnings.toFixed(2), r.min_wage_earnings.toFixed(2), r.top_up.toFixed(2), r.total.toFixed(2), r.status.toUpperCase(), q(r.team_leader)].join(','));
        });

        const totalBuckets = rows.reduce((sum, r) => sum + r.buckets, 0);
        const totalEarnings = rows.reduce((sum, r) => sum + r.total, 0);
        const belowMinimum = rows.filter(r => r.status === 'below_minimum').length;
        lines.push('');
        lines.push(`# SUMMARY: ${rows.length} pickers, ${totalBuckets} buckets, $${totalEarnings.toFixed(2)} total earnings`);
        lines.push(`# COMPLIANCE: ${belowMinimum} pickers below minimum wage`);
        return lines.join('\n');
    }

    /**
     * Trigger browser download of CSV
     */
    downloadCSV(csvContent: string, filename: string): void {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

export const analyticsService = new AnalyticsService();
export { analyticsTrendsService };
