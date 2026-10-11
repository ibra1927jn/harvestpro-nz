/**
 * CSV diario del panel: horas del fichaje (descanso no pagado) y complemento
 * del cálculo único; cubetas de los escaneos, no del contador de la ficha.
 */
import { describe, it, expect } from 'vitest';
import { analyticsService } from '../analytics.service';
import type { Picker, BucketRecord } from '@/types';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
const nowMs = Date.now();

describe('analyticsService.generateDailyReport', () => {
    it('usa horas del fichaje y el complemento del día', () => {
        const crew = [{
            id: 'p1', picker_id: 'EMP001', name: 'Ana', role: 'picker', status: 'active',
            // 8 h fichadas → 7.5 h pagables; contador viejo de la ficha a 99 (se ignora)
            check_in: new Date(nowMs - 8 * 3_600_000).toISOString(),
            check_out: new Date(nowMs).toISOString(),
            total_buckets_today: 99, hours: 0, avatar: 'A', current_row: 1, safety_verified: true, qcStatus: [],
        }] as unknown as Picker[];
        const buckets = Array.from({ length: 10 }, (_, i) => ({
            id: `b${i}`, picker_id: 'p1', bin_id: '', timestamp: new Date(nowMs - 60_000).toISOString(),
            scanned_at: new Date(nowMs - 60_000).toISOString(), quality_grade: 'A',
        })) as BucketRecord[];

        const csv = analyticsService.generateDailyReport(crew, buckets, { piece_rate: 6.5, min_wage_rate: 23.95 }, [], {
            generated_at: today, last_sync: today, pending_queue_count: 0, orchard_name: 'Test', is_offline_data: false,
        });
        const line = csv.split('\n').find(l => l.startsWith('"Ana"'))!;
        const cols = line.split(',');
        expect(cols[2]).toBe('10');          // cubetas escaneadas
        expect(cols[3]).toBe('7.5');         // horas pagables
        expect(cols[4]).toBe('timesheet');
        expect(cols[8]).toBe('114.63');      // 7.5 × 23.95 − 65
        expect(cols[9]).toBe('179.63');      // total
        expect(csv).toContain('$179.63 total earnings');
    });
});
