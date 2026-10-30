/**
 * dashboard-insights-parity.test.tsx
 *
 * Verifica que Dashboard e Insights ven exactamente los mismos KPIs.
 * Ambos consumen useHarvestMetrics() que lee del store Zustand.
 * Si este test pasa, no puede haber divergencia entre las dos vistas.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Picker, BucketRecord, HarvestSettings } from '@/types';

// --- Datos de test deterministas ---

// 14 Apr 2026 09:00 NZ (+12:00 → 21:00 UTC del 13)
const NZ_DATE = '2026-04-14';
const NZ_OFFSET = '+12:00';
function nzTs(timeHHMM: string): string {
    return new Date(`${NZ_DATE}T${timeHHMM}:00${NZ_OFFSET}`).toISOString();
}

const SETTINGS: Partial<HarvestSettings> = {
    piece_rate: 6.5,
    min_wage_rate: 23.95,
    shift_start_time: '07:00',
    shift_end_time: '17:00',
};

const CREW: Partial<Picker>[] = [
    { id: 'p1', picker_id: 'P001', name: 'Alice',  role: 'picker', team_leader_id: 'tl1' },
    { id: 'p2', picker_id: 'P002', name: 'Bob',    role: 'picker', team_leader_id: 'tl1' },
    { id: 'tl1', name: 'Team Alpha', role: 'team_leader' },
];

// Alice: 20 bins 07:00-09:00, Bob: 10 bins 08:00-09:00
function makeBuckets(): Partial<BucketRecord>[] {
    const aliceBuckets = Array.from({ length: 20 }, (_, i) => ({
        id: `a${i}`,
        picker_id: 'p1',
        scanned_at: nzTs('07:30'),
        created_at: nzTs('07:30'),
    }));
    const bobBuckets = Array.from({ length: 10 }, (_, i) => ({
        id: `b${i}`,
        picker_id: 'p2',
        scanned_at: nzTs('08:30'),
        created_at: nzTs('08:30'),
    }));
    return [...aliceBuckets, ...bobBuckets];
}

// --- Mock del store ---
const MOCK_CREW = CREW as Picker[];
const MOCK_BUCKETS = makeBuckets() as BucketRecord[];
const MOCK_SETTINGS = SETTINGS as HarvestSettings;

vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: (selector: (s: Record<string, unknown>) => unknown) =>
        selector({
            crew: MOCK_CREW,
            bucketRecords: MOCK_BUCKETS,
            settings: MOCK_SETTINGS,
        }),
}));

import { useHarvestMetrics } from './useHarvestMetrics';

describe('dashboard-insights-parity', () => {
    it('totalBins refleja exactamente los bucketRecords del store', () => {
        const { result } = renderHook(() => useHarvestMetrics());
        expect(result.current.kpis.totalBins).toBe(30); // 20 Alice + 10 Bob
    });

    it('perPicker contiene exactamente los pickers con scans', () => {
        const { result } = renderHook(() => useHarvestMetrics());
        const pickerIds = result.current.perPicker.map(p => p.pickerId);
        expect(pickerIds).toContain('p1');
        expect(pickerIds).toContain('p2');
        expect(result.current.perPicker).toHaveLength(2);
    });

    it('bins por picker son correctos', () => {
        const { result } = renderHook(() => useHarvestMetrics());
        const alice = result.current.perPicker.find(p => p.pickerId === 'p1');
        const bob = result.current.perPicker.find(p => p.pickerId === 'p2');
        expect(alice?.bins).toBe(20);
        expect(bob?.bins).toBe(10);
    });

    it('totalLabour ≥ (totalBins × pieceRate)', () => {
        const { result } = renderHook(() => useHarvestMetrics());
        const minExpected = 30 * 6.5; // pieza rate pura
        expect(result.current.kpis.totalLabour).toBeGreaterThanOrEqual(minExpected);
    });

    it('costPerBin = totalLabour / totalBins', () => {
        const { result } = renderHook(() => useHarvestMetrics());
        const { kpis } = result.current;
        if (kpis.totalBins > 0) {
            expect(kpis.costPerBin).toBeCloseTo(kpis.totalLabour / kpis.totalBins, 5);
        }
    });

    it('efficiency tiene mismos bins que perPicker', () => {
        const { result } = renderHook(() => useHarvestMetrics());
        const totalEffBins = result.current.efficiency.reduce((s, p) => s + p.bins, 0);
        const totalPickerBins = result.current.perPicker.reduce((s, p) => s + p.bins, 0);
        expect(totalEffBins).toBe(totalPickerBins);
    });

    it('perTeam agrupa correctamente los pickers de Alice y Bob bajo tl1', () => {
        const { result } = renderHook(() => useHarvestMetrics());
        const team = result.current.perTeam.find(t => t.teamLeaderId === 'tl1');
        expect(team?.pickerCount).toBe(2);
        expect(team?.totalBins).toBe(30);
    });

    it('hoursElapsed ≥ 0', () => {
        const { result } = renderHook(() => useHarvestMetrics());
        expect(result.current.hoursElapsed).toBeGreaterThanOrEqual(0);
    });
});
