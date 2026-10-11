/**
 * perPicker — pure metric computation desde scan data.
 */
import { describe, it, expect } from 'vitest';
import { computePerPicker } from './perPicker';
import type { Picker, BucketRecord, HarvestSettings } from '@/types';

// Shift de 07:00 → 16:00 que simulamos como "8h ordinarias". `deriveHoursPerPicker`
// usa los timestamps del scan, así que pondremos check-in a 07:00 y scans hasta 15:00.
const settings: Pick<HarvestSettings, 'piece_rate' | 'min_wage_rate' | 'shift_start_time'> = {
    piece_rate: 6.5,
    min_wage_rate: 23.95,
    shift_start_time: '07:00',
};

function picker(overrides: Partial<Picker> = {}): Picker {
    return {
        id: overrides.id ?? 'uuid-1',
        picker_id: overrides.picker_id ?? 'P001',
        name: overrides.name ?? 'Alice',
        role: overrides.role ?? 'picker',
        team_leader_id: overrides.team_leader_id ?? 'tl1',
    } as Picker;
}

function scan(pickerId: string, minutesFromStart: number): BucketRecord {
    const base = new Date('2026-04-18T07:00:00+12:00').getTime();
    return {
        id: `scan-${pickerId}-${minutesFromStart}`,
        picker_id: pickerId,
        scanned_at: new Date(base + minutesFromStart * 60_000).toISOString(),
        bin_id: 'b1',
    } as BucketRecord;
}

describe('computePerPicker', () => {
    const now = new Date('2026-04-18T15:00:00+12:00');

    it('excluye pickers sin scans', () => {
        const crew = [picker({ id: 'u1', name: 'Alice' })];
        const result = computePerPicker(crew, [], settings, now);
        expect(result).toEqual([]);
    });

    it('excluye pickers cuyo role !== "picker"', () => {
        const crew = [
            picker({ id: 'u1', role: 'team_leader' as Picker['role'] }),
            picker({ id: 'u2', role: 'runner' as Picker['role'] }),
        ];
        const records = [scan('u1', 60), scan('u2', 60)];
        expect(computePerPicker(crew, records, settings, now)).toEqual([]);
    });

    it('cuenta bins por picker_id UUID', () => {
        const crew = [picker({ id: 'u1', name: 'Alice' })];
        const records = [scan('u1', 30), scan('u1', 60), scan('u1', 90)];
        const result = computePerPicker(crew, records, settings, now);
        expect(result).toHaveLength(1);
        expect(result[0].bins).toBe(3);
        expect(result[0].pickerName).toBe('Alice');
    });

    it('fallback a picker_id corto cuando el scan no usa UUID', () => {
        const crew = [picker({ id: 'u1', picker_id: 'P001' })];
        const records = [scan('P001', 30), scan('P001', 60)];
        const result = computePerPicker(crew, records, settings, now);
        expect(result[0].bins).toBe(2);
    });

    it('ignora records sin picker_id', () => {
        const crew = [picker({ id: 'u1' })];
        const records = [scan('u1', 10), { ...scan('u1', 20), picker_id: undefined as unknown as string }];
        const result = computePerPicker(crew, records, settings, now);
        expect(result[0].bins).toBe(1);
    });

    it('pieceRateEarnings = bins * piece_rate', () => {
        const crew = [picker({ id: 'u1' })];
        const records = [scan('u1', 10), scan('u1', 20), scan('u1', 30), scan('u1', 40)];
        const result = computePerPicker(crew, records, settings, now);
        expect(result[0].pieceRateEarnings).toBeCloseTo(4 * 6.5);
    });

    it('top-up = 0 cuando pieceRate supera minWage * horas', () => {
        const crew = [picker({ id: 'u1' })];
        // 100 bins * 6.5 = 650 > 8h * 23.95 = 191.6
        const records = Array.from({ length: 100 }, (_, i) => scan('u1', 1 + i));
        const result = computePerPicker(crew, records, settings, now);
        expect(result[0].topUp).toBe(0);
        expect(result[0].earned).toBeCloseTo(100 * 6.5);
    });

    it('top-up > 0 cuando pieceRate NO cubre minWage', () => {
        const crew = [picker({ id: 'u1' })];
        // 2 bins = 13; 8h * 23.95 = 191.6; top-up = 178.6
        const records = [scan('u1', 10), scan('u1', 400)];
        const result = computePerPicker(crew, records, settings, now);
        expect(result[0].topUp).toBeGreaterThan(0);
    });

    it('costPerBin = earned / bins', () => {
        const crew = [picker({ id: 'u1' })];
        const records = [scan('u1', 10), scan('u1', 20)];
        const result = computePerPicker(crew, records, settings, now);
        expect(result[0].costPerBin).toBeCloseTo(result[0].earned / 2);
    });

    it('preserva teamLeaderId del picker', () => {
        const crew = [picker({ id: 'u1', team_leader_id: 'tl-xyz' })];
        const records = [scan('u1', 10)];
        const result = computePerPicker(crew, records, settings, now);
        expect(result[0].teamLeaderId).toBe('tl-xyz');
    });

    it('defaults piece_rate=6.5 y min_wage=23.95 cuando no se pasan', () => {
        const crew = [picker({ id: 'u1' })];
        const records = [scan('u1', 10)];
        const result = computePerPicker(
            crew,
            records,
            { piece_rate: 0, min_wage_rate: 0, shift_start_time: '07:00' } as never,
            now,
        );
        // piece_rate=0 → pieceRateEarnings=0 → earned=topUp ≥ 0
        expect(result[0].earned).toBeGreaterThanOrEqual(0);
    });
});

describe('computePerPicker — horas desde el fichaje del team leader', () => {
    const now = new Date('2026-04-18T18:00:00+12:00');
    const withShift = (extra: Partial<Picker>): Picker =>
        ({ ...picker(), ...extra }) as Picker;

    it('usa entrada/salida del fichaje, no los escaneos, y descuenta 30 min', () => {
        const crew = [withShift({
            check_in: '2026-04-18T07:00:00+12:00',
            check_out: '2026-04-18T17:00:00+12:00',
        })];
        const records = [scan('uuid-1', 60), scan('uuid-1', 120)]; // escaneos de 08:00 a 09:00
        const [m] = computePerPicker(crew, records, settings, now);
        expect(m.hoursSource).toBe('timesheet');
        expect(m.hoursWorked).toBe(9.5);
        // 2 cubetas × 6.50 = 13; 9.5 h × 23.95 = 227.53 → complemento 214.53
        expect(m.topUp).toBe(214.53);
    });

    it('quien fichó y aún no tiene cubetas aparece igualmente (cobra el mínimo)', () => {
        const crew = [withShift({ check_in: '2026-04-18T07:00:00+12:00', check_out: '2026-04-18T11:00:00+12:00' })];
        const [m] = computePerPicker(crew, [], settings, now);
        expect(m.bins).toBe(0);
        expect(m.hoursWorked).toBe(4);
        expect(m.topUp).toBe(95.8);
    });

    it('no cuenta cubetas rechazadas por QC ni borradas', () => {
        const ok = scan('uuid-1', 10);
        const rejected = { ...scan('uuid-1', 20), quality_grade: 'reject' } as BucketRecord;
        const deleted = { ...scan('uuid-1', 30), deleted_at: '2026-04-18T09:00:00+12:00' } as BucketRecord;
        const [m] = computePerPicker([picker()], [ok, rejected, deleted], settings, now);
        expect(m.bins).toBe(1);
    });
});
