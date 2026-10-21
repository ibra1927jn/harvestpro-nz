/**
 * RunnersView — «Runners en el huerto»: mapa de filas, vehículos y quién hace qué.
 * (Antes esta pestaña listaba pickers; revisión 2026-10-21, punto 13.)
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const NOW_ISO = new Date().toISOString();
const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const mockStore = vi.hoisted(() => ({
    crew: [] as unknown[],
    orchard: { id: 'o1', name: 'Sunny Orchard', total_rows: 12 },
    bucketRecords: [] as unknown[],
}));

vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: (selector: (s: typeof mockStore) => unknown) => selector(mockStore),
}));

const fetchFleet = vi.hoisted(() => vi.fn());
vi.mock('@/services/logistics-dept.service', () => ({ fetchFleet }));

import RunnersView from './RunnersView';

function crewFixture() {
    return [
        { id: 'r1', name: 'Rata Runner', avatar: 'RR', current_row: 0, total_buckets_today: 0, status: 'active', role: 'runner', check_in: NOW_ISO },
        { id: 'r2', name: 'Dani Driver', avatar: 'DD', current_row: 0, total_buckets_today: 0, status: 'active', role: 'bucket_runner', check_in: NOW_ISO },
        { id: 'r3', name: 'Lola Lenta', avatar: 'LL', current_row: 0, total_buckets_today: 0, status: 'active', role: 'runner', check_in: NOW_ISO },
        { id: 'p1', name: 'Alice Picker', avatar: 'AL', current_row: 3, total_buckets_today: 15, status: 'active', role: 'picker', check_in: NOW_ISO },
        { id: 'p2', name: 'Bob Picker', avatar: 'BO', current_row: 3, total_buckets_today: 8, status: 'active', role: 'picker', check_in: NOW_ISO },
        { id: 'tl', name: 'Team Leader', avatar: 'TL', current_row: 0, total_buckets_today: 0, status: 'active', role: 'team_leader', check_in: NOW_ISO },
    ];
}

describe('RunnersView', () => {
    const onBack = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockStore.crew = crewFixture();
        mockStore.bucketRecords = [
            { id: 'b1', timestamp: minsAgo(2), picker_id: 'p1', bin_id: 'x', scanned_by: 'r1', scanned_at: minsAgo(2), row_number: 7 },
            { id: 'b2', timestamp: minsAgo(40), picker_id: 'p2', bin_id: 'x', scanned_by: 'r3', scanned_at: minsAgo(40), row_number: 2 },
        ];
        fetchFleet.mockResolvedValue([
            { id: 't1', name: 'Tractor 1', type: 'tractor', zone: 'B', driver_id: 'r2', driver_name: 'Dani Driver', status: 'active', load_status: 'partial', bins_loaded: 4, max_capacity: 8, last_update: NOW_ISO },
        ]);
    });

    it('lista runners (no pickers ni team leaders) con lo que hace cada uno', async () => {
        render(<RunnersView onBack={onBack} />);
        expect(screen.getByText('Runners in the orchard')).toBeTruthy();
        expect(screen.getAllByText('Rata Runner').length).toBeGreaterThan(0); // lista + celda del mapa
        expect(screen.getByText('Lola Lenta')).toBeTruthy();
        expect(screen.queryByText('Alice Picker')).toBeNull();
        expect(screen.queryByText('Team Leader')).toBeNull();

        // Rata escaneó hace 2 min en la fila 7 → recogiendo
        expect(screen.getByText('Picking up')).toBeTruthy();
        expect(screen.getByText(/Row 7 · last scan 2 min ago/)).toBeTruthy();
        // Lola lleva 40 min sin escanear → sin actividad
        expect(screen.getByText('No activity')).toBeTruthy();

        // Dani conduce el tractor cuando llega la flota
        await waitFor(() => expect(screen.getByText('Driving')).toBeTruthy());
        expect(screen.getByText(/Tractor 1 · 4\/8 bins · B/)).toBeTruthy();
        expect(screen.getByText('Active vehicles')).toBeTruthy();
        expect(screen.getByText('3 in the orchard')).toBeTruthy();
    });

    it('mapa de filas: la fila del runner a pie en verde y los pickers por fila contados', () => {
        render(<RunnersView onBack={onBack} />);
        const row7 = screen.getByTestId('row-cell-7');
        expect(row7.className).toContain('bg-emerald-500');
        expect(row7.textContent).toContain('Rata Runner');
        const row3 = screen.getByTestId('row-cell-3');
        expect(row3.className).toContain('bg-slate-200');
        expect(row3.textContent).toBe('32'); // fila 3, 2 pickers
        expect(screen.getAllByTestId(/row-cell-/)).toHaveLength(12);
    });

    it('vacío cuando no hay runners fichados ni escaneos', () => {
        mockStore.crew = crewFixture().filter(p => p.role === 'picker');
        mockStore.bucketRecords = [];
        render(<RunnersView onBack={onBack} />);
        expect(screen.getByText('No runners in the orchard')).toBeTruthy();
    });

    it('calls onBack when back button is clicked', () => {
        render(<RunnersView onBack={onBack} />);
        fireEvent.click(screen.getByText('arrow_back'));
        expect(onBack).toHaveBeenCalled();
    });
});
