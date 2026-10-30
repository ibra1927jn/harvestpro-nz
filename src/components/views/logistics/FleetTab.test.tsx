/**
 * FleetTab — Deep render + interaction tests
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/ui/FilterBar', () => ({
    default: ({ searchPlaceholder, onSearchChange }: any) => (
        <input data-testid="filter-bar" placeholder={searchPlaceholder} onChange={(e: any) => onSearchChange(e.target.value)} />
    ),
}));

vi.mock('@/components/ui/InlineSelect', () => ({
    default: ({ value, onSave }: any) => (
        <select data-testid="inline-select" value={value} onChange={(e: any) => onSave(e.target.value)}>
            <option>{value}</option>
        </select>
    ),
}));

vi.mock('@/components/ui/InlineEdit', () => ({
    default: ({ value }: any) => <span data-testid="inline-edit">{value}</span>,
}));

import FleetTab from './FleetTab';

const makeTractor = (id: string, name: string, status: string, zone: string, driver: string, binsLoaded = 5, maxCap = 20) => ({
    id, name, type: 'tractor', status, zone, driver_name: driver,
    bins_loaded: binsLoaded, max_capacity: maxCap,
    load_status: binsLoaded === 0 ? 'empty' : binsLoaded >= maxCap ? 'full' : 'partial',
    last_update: '2026-03-10T12:00:00',
}) as any;

describe('FleetTab', () => {
    const tractors = [
        makeTractor('t1', 'Tractor Alpha', 'active', 'A1', 'John'),
        makeTractor('t2', 'Tractor Beta', 'idle', 'B1', 'Jane'),
        makeTractor('t3', 'Tractor Gamma', 'maintenance', 'A2', 'Bob'),
    ];

    it('renders Orchard Zone Map heading', () => {
        render(<FleetTab tractors={tractors} />);
        expect(screen.getByText('Orchard Zone Map')).toBeTruthy();
    });

    it('renders zone grid cells', () => {
        render(<FleetTab tractors={tractors} />);
        expect(screen.getByText('A1')).toBeTruthy();
        expect(screen.getByText('B1')).toBeTruthy();
        expect(screen.getByText('C1')).toBeTruthy();
    });

    it('renders tractor names', () => {
        render(<FleetTab tractors={tractors} />);
        expect(screen.getByText('Tractor Alpha')).toBeTruthy();
        expect(screen.getByText('Tractor Beta')).toBeTruthy();
        expect(screen.getByText('Tractor Gamma')).toBeTruthy();
    });

    it('renders driver names', () => {
        render(<FleetTab tractors={tractors} />);
        expect(screen.getByText('John')).toBeTruthy();
        expect(screen.getByText('Jane')).toBeTruthy();
    });

    it('renders zone labels on tractor cards', () => {
        render(<FleetTab tractors={tractors} />);
        const zoneLabels = screen.getAllByText(/Zone A1/);
        expect(zoneLabels.length).toBeGreaterThanOrEqual(1);
    });

    it('renders bins loaded info', () => {
        render(<FleetTab tractors={tractors} />);
        // The text "5/20 bins — partial" is in a span alongside an icon
        const binsText = screen.getAllByText(/bins/);
        expect(binsText.length).toBeGreaterThanOrEqual(1);
    });

    it('renders filter bar', () => {
        render(<FleetTab tractors={tractors} />);
        expect(screen.getByTestId('filter-bar')).toBeTruthy();
    });

    it('filters tractors by search query', () => {
        render(<FleetTab tractors={tractors} />);
        fireEvent.change(screen.getByTestId('filter-bar'), { target: { value: 'Alpha' } });
        expect(screen.getByText('Tractor Alpha')).toBeTruthy();
        expect(screen.queryByText('Tractor Beta')).toBeNull();
    });

    it('shows empty grid when no tractors match filter', () => {
        render(<FleetTab tractors={tractors} />);
        fireEvent.change(screen.getByTestId('filter-bar'), { target: { value: 'nonexistent' } });
        expect(screen.queryByText('Tractor Alpha')).toBeNull();
    });

    it('renders with empty tractors array', () => {
        render(<FleetTab tractors={[]} />);
        expect(screen.getByText('Orchard Zone Map')).toBeTruthy();
    });
});
