/**
 * runnersNow — qué hace cada runner, derivado de fichaje, vehículo y escaneos.
 */
import { describe, it, expect } from 'vitest';
import { runnersNow, pickersByRow, ON_FOOT_MAX_MINUTES } from './runnersNow';
import type { Picker, BucketRecord } from '@/types';
import type { Tractor } from '@/services/logistics-dept.service';

const NOW = new Date('2026-10-12T10:00:00+13:00');
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

function person(over: Partial<Picker> & { id: string; name: string }): Picker {
    return {
        picker_id: over.id, avatar: over.name.slice(0, 2).toUpperCase(), current_row: 0,
        total_buckets_today: 0, status: 'active', role: 'runner',
        check_in: '2026-10-12T07:00:00+13:00', ...over,
    } as Picker;
}

function vehicle(over: Partial<Tractor> & { id: string; driver_id?: string }): Tractor {
    return {
        name: over.id.toUpperCase(), type: 'tractor', zone: 'B', driver_name: 'x',
        status: 'active', load_status: 'partial', bins_loaded: 3, max_capacity: 8, last_update: NOW.toISOString(),
        ...over,
    } as Tractor;
}

function scan(by: string, row: number, minutesAgo: number): BucketRecord {
    return { id: `${by}-${row}-${minutesAgo}`, timestamp: minsAgo(minutesAgo), picker_id: 'pk', bin_id: 'bin', scanned_by: by, scanned_at: minsAgo(minutesAgo), row_number: row };
}

describe('runnersNow', () => {
    it('solo runners (runner / bucket_runner) fichados o con escaneos hoy', () => {
        const crew = [
            person({ id: 'r1', name: 'Rata' }),
            person({ id: 'r2', name: 'Bruno', role: 'bucket_runner' }),
            person({ id: 'r3', name: 'Fuera', check_in: undefined }),            // sin fichar ni escaneos
            person({ id: 'p1', name: 'Picker', role: 'picker' }),
            person({ id: 'tl', name: 'Lead', role: 'team_leader' }),
        ];
        const out = runnersNow({ crew, fleet: [], bucketRecords: [], now: NOW });
        expect(out.map(r => r.id).sort()).toEqual(['r1', 'r2']);
    });

    it('driver / forklift según el vehículo activo que conduce', () => {
        const crew = [person({ id: 'r1', name: 'Driver' }), person({ id: 'r2', name: 'Fork' }), person({ id: 'r3', name: 'Parado' })];
        const fleet = [
            vehicle({ id: 't1', driver_id: 'r1' }),
            vehicle({ id: 'f1', driver_id: 'r2', type: 'forklift', zone: 'Shed' }),
            vehicle({ id: 't2', driver_id: 'r3', status: 'idle' }), // vehículo parado: no cuenta
        ];
        const out = runnersNow({ crew, fleet, bucketRecords: [], now: NOW });
        const by = Object.fromEntries(out.map(r => [r.id, r]));
        expect(by.r1.activity).toBe('driver');
        expect(by.r1.vehicle).toMatchObject({ id: 't1', binsLoaded: 3, maxCapacity: 8, zone: 'B' });
        expect(by.r2.activity).toBe('forklift');
        // vehículo parado y sin escaneos: sin actividad
        expect(by.r3.activity).toBe('idle');
        expect(by.r3.vehicle).toBeNull();
    });

    it('a pie: recogiendo si el último escaneo es reciente; en espera si lleva más de 10 min; sin actividad si no escaneó', () => {
        const crew = [person({ id: 'a', name: 'A' }), person({ id: 'b', name: 'B' }), person({ id: 'c', name: 'C' }), person({ id: 'd', name: 'D' })];
        const bucketRecords = [
            scan('a', 4, 30), scan('a', 7, ON_FOOT_MAX_MINUTES - 1),   // el último manda: fila 7
            scan('b', 2, ON_FOOT_MAX_MINUTES + 2),                      // 12 min: ya no recoge
            scan('c', 9, 40),                                           // 40 min: sigue siendo «en espera», no «sin actividad»
        ];
        const out = runnersNow({ crew, fleet: [], bucketRecords, now: NOW });
        const by = Object.fromEntries(out.map(r => [r.id, r]));
        expect(by.a).toMatchObject({ activity: 'on_foot', row: 7, minutesSinceScan: ON_FOOT_MAX_MINUTES - 1 });
        expect(by.b).toMatchObject({ activity: 'waiting', row: 2 });
        expect(by.c).toMatchObject({ activity: 'waiting', row: 9, minutesSinceScan: 40 });
        expect(by.d).toMatchObject({ activity: 'idle', row: null, minutesSinceScan: null });
    });

    it('runner sin fichar pero con escaneos hoy: aparece marcado como no fichado', () => {
        const crew = [person({ id: 'a', name: 'A', check_in: undefined })];
        const out = runnersNow({ crew, fleet: [], bucketRecords: [scan('a', 1, 2)], now: NOW });
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({ checkedIn: false, activity: 'on_foot' });
    });

    it('orden: recogiendo, luego vehículos, luego en espera y sin actividad', () => {
        const crew = [person({ id: 'idle', name: 'Zed' }), person({ id: 'wait', name: 'Bea' }), person({ id: 'drv', name: 'Ann' }), person({ id: 'foot', name: 'Max' })];
        const out = runnersNow({
            crew,
            fleet: [vehicle({ id: 't', driver_id: 'drv' })],
            bucketRecords: [scan('foot', 1, 1), scan('wait', 2, 60)],
            now: NOW,
        });
        expect(out.map(r => r.id)).toEqual(['foot', 'drv', 'wait', 'idle']);
    });
});

describe('pickersByRow', () => {
    it('cuenta pickers presentes por fila; fuera runners, team leaders y quien ya salió', () => {
        const crew = [
            person({ id: 'p1', name: 'P1', role: 'picker', current_row: 3 }),
            person({ id: 'p2', name: 'P2', role: 'picker', current_row: 3 }),
            person({ id: 'p3', name: 'P3', role: 'picker', current_row: 5, check_out: '2026-10-12T09:00:00+13:00' }),
            person({ id: 'r1', name: 'R1', current_row: 3 }),
            person({ id: 'tl', name: 'TL', role: 'team_leader', current_row: 3 }),
            person({ id: 'p4', name: 'P4', role: 'picker', current_row: 0 }),
        ];
        const m = pickersByRow(crew);
        expect([...m.entries()]).toEqual([[3, 2]]);
    });
});
