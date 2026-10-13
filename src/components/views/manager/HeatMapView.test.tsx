/**
 * HeatMapView — Deep render + interaction tests
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockGetRowDensity = vi.fn();

vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: vi.fn((sel: (s: Record<string, unknown>) => unknown) =>
        sel({
            orchard: { id: 'o1', name: 'Test Orchard' },
            orchardBlocks: [
                { id: 'b1', name: 'Block A', startRow: 1, totalRows: 3, variety: 'Gala' },
            ],
            selectedBlockId: null,
        })
    ),
}));

vi.mock('@/services/analytics.service', () => ({
    analyticsService: {
        getRowDensity: (...args: unknown[]) => mockGetRowDensity(...args),
    },
}));

vi.mock('@/utils/nzst', () => ({
    todayNZST: () => '2026-03-10',
    toNZST: (d: Date) => d.toISOString(),
}));

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { HeatMapView, default as HeatMapViewDefault } from './HeatMapView';

describe('HeatMapView', () => {
    const mockDensities = [
        { row_number: 1, total_buckets: 50, unique_pickers: 3, avg_buckets_per_picker: 16.7, density_score: 0.8, target_completion: 100 },
        { row_number: 2, total_buckets: 20, unique_pickers: 2, avg_buckets_per_picker: 10.0, density_score: 0.4, target_completion: 40 },
        { row_number: 3, total_buckets: 0, unique_pickers: 0, avg_buckets_per_picker: 0, density_score: 0, target_completion: 0 },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetRowDensity.mockResolvedValue({ density_by_row: mockDensities });
    });

    it('exports both named and default', () => {
        expect(HeatMapView).toBeDefined();
        expect(HeatMapViewDefault).toBeDefined();
    });

    it('renders Heat Map heading', async () => {
        render(<HeatMapView />);
        expect(screen.getByText('Heat Map')).toBeTruthy();
    });

    it('shows loading state initially', () => {
        mockGetRowDensity.mockReturnValue(new Promise(() => { })); // never resolves
        render(<HeatMapView />);
        expect(screen.getByText('Loading heat map...')).toBeTruthy();
    });

    it('calls analyticsService.getRowDensity on mount', async () => {
        render(<HeatMapView />);
        await waitFor(() => expect(mockGetRowDensity).toHaveBeenCalled());
        expect(mockGetRowDensity).toHaveBeenCalledWith('o1', '2026-03-10', '2026-03-10', 100);
    });

    it('renders date range toggle buttons', async () => {
        render(<HeatMapView />);
        expect(screen.getByText('Today')).toBeTruthy();
        expect(screen.getByText('7 days')).toBeTruthy();
        expect(screen.getByText('30 days')).toBeTruthy();
    });

    it('renders summary stats after loading', async () => {
        render(<HeatMapView />);
        await waitFor(() => expect(screen.getByText('Buckets')).toBeTruthy());
        expect(screen.getByText('Active')).toBeTruthy();
        expect(screen.getByText('Complete')).toBeTruthy();
        expect(screen.getByText('Critical')).toBeTruthy();
    });

    it('renders total buckets in stats', async () => {
        render(<HeatMapView />);
        await waitFor(() => expect(screen.getByText('70')).toBeTruthy()); // 50+20+0
    });

    it('renders grid cells with row labels after loading', async () => {
        render(<HeatMapView />);
        await waitFor(() => expect(screen.getByText('R1')).toBeTruthy());
        expect(screen.getByText('R2')).toBeTruthy();
        expect(screen.getByText('R3')).toBeTruthy();
    });

    it('shows checkmark for 100% completion row', async () => {
        render(<HeatMapView />);
        await waitFor(() => expect(screen.getByText('✓')).toBeTruthy());
    });

    it('shows percentage for partial completion', async () => {
        render(<HeatMapView />);
        await waitFor(() => expect(screen.getByText('40%')).toBeTruthy());
    });

    it('shows bucket count in cells', async () => {
        render(<HeatMapView />);
        await waitFor(() => expect(screen.getByText('50b')).toBeTruthy());
        expect(screen.getByText('20b')).toBeTruthy();
        expect(screen.getByText('0b')).toBeTruthy();
    });

    it('renders legend items', () => {
        render(<HeatMapView />);
        expect(screen.getByText('≥100%')).toBeTruthy();
        expect(screen.getByText('50-99%')).toBeTruthy();
        expect(screen.getByText('<50%')).toBeTruthy();
        expect(screen.getByText('No data')).toBeTruthy();
    });

    it('changes date range when toggle button is clicked', async () => {
        render(<HeatMapView />);
        await waitFor(() => expect(mockGetRowDensity).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByText('7 days'));
        await waitFor(() => expect(mockGetRowDensity).toHaveBeenCalledTimes(2));
    });

    it('shows empty state when no data', async () => {
        mockGetRowDensity.mockResolvedValue({ density_by_row: [] });
        render(<HeatMapView />);
        await waitFor(() => expect(screen.getByText('No harvest data yet')).toBeTruthy());
    });

    it('handles API error gracefully', async () => {
        mockGetRowDensity.mockRejectedValue(new Error('Network error'));
        render(<HeatMapView />);
        // Should not crash; shows empty state
        await waitFor(() => expect(screen.queryByText('Loading heat map...')).toBeNull());
    });
});
