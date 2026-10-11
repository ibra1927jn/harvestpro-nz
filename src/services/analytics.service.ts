/**
 * services/analytics.service.ts
 * Analytics & Reporting Service — Core calculations + report generation
 * Historical/trend queries live in analytics-trends.service.ts
 */
import { Picker, BucketRecord } from '../types';
import { nowNZST } from '@/utils/nzst';
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
        const now = new Date(nowNZST());
        const result: { hour: string; count: number }[] = [];

        for (let i = hoursBack - 1; i >= 0; i--) {
            const hourStart = new Date(now);
            hourStart.setHours(now.getHours() - i, 0, 0, 0);
            const hourEnd = new Date(hourStart);
            hourEnd.setHours(hourStart.getHours() + 1);

            const count = bucketRecords.filter((r) => {
                const recordTime = new Date(r.scanned_at || '');
                return recordTime >= hourStart && recordTime < hourEnd;
            }).length;

            result.push({
                hour: hourStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                count
            });
        }
        return result;
    }

    /**
     * Calculate ETA to reach target based on current velocity.
     * shiftEndTime ancla el final del día (HH:MM, 24h). Default '17:00'.
     */
    calculateETA(
        currentTons: number,
        targetTons: number,
        velocityPerHour: number,
        bucketsPerTon: number = 72,
        shiftEndTime: string = '17:00'
    ): { eta: string; status: 'ahead' | 'on_track' | 'behind'; hoursRemaining: number } {
        const remainingTons = targetTons - currentTons;
        if (remainingTons <= 0) return { eta: 'Complete!', status: 'ahead', hoursRemaining: 0 };
        if (velocityPerHour <= 0) return { eta: 'Awaiting data...', status: 'behind', hoursRemaining: Infinity };

        const hoursNeeded = (remainingTons * bucketsPerTon) / velocityPerHour;
        const etaDate = new Date(nowNZST());
        etaDate.setHours(etaDate.getHours() + hoursNeeded);

        // Parsear shiftEndTime (HH:MM) para definir el final del turno
        const [endH, endM] = shiftEndTime.split(':').map(Number);
        const endOfDay = new Date(nowNZST());
        endOfDay.setHours(endH ?? 17, endM ?? 0, 0, 0);

        let status: 'ahead' | 'on_track' | 'behind';
        if (etaDate < endOfDay) status = hoursNeeded <= 2 ? 'ahead' : 'on_track';
        else status = 'behind';

        return { eta: etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), status, hoursRemaining: hoursNeeded };
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
