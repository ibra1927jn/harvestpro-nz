/**
 * SeasonalPlanningTab — Deep render tests
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/ui/FilterBar', () => ({
    default: ({ searchPlaceholder, filters }: any) => (
        <input data-testid="filter-bar" placeholder={searchPlaceholder} data-filters={JSON.stringify(filters)} />
    ),
}));

import SeasonalPlanningTab from './SeasonalPlanningTab';

const makeEmployee = (id: string, name: string, contractType: string, contractEnd: string, status = 'active') => ({
    id, name, full_name: name, email: `${name.toLowerCase()}@test.com`,
    role: 'picker', status,
    contract_type: contractType,
    contract_start: '2025-01-01',
    contract_end: contractEnd,
    hourly_rate: 23.95,
    visa_status: 'citizen',
}) as any;

describe('SeasonalPlanningTab', () => {
    const employees = [
        makeEmployee('e1', 'Alice', 'permanent', '2027-12-31'),
        makeEmployee('e2', 'Bob', 'seasonal', '2026-04-15'),
        makeEmployee('e3', 'Charlie', 'casual', '2026-03-20'),
    ];

    it('renders Contract Expiry Forecast section', () => {
        render(<SeasonalPlanningTab employees={employees} />);
        expect(screen.getByText('Contract Expiry Forecast')).toBeTruthy();
    });

    it('renders filter bar', () => {
        render(<SeasonalPlanningTab employees={employees} />);
        expect(screen.getByTestId('filter-bar')).toBeTruthy();
    });

    it('renders with empty employees', () => {
        render(<SeasonalPlanningTab employees={[]} />);
        expect(screen.getByText('Contract Expiry Forecast')).toBeTruthy();
    });

    it('offers every contract type with its count and counts pending / on-leave people in the headcount', () => {
        render(<SeasonalPlanningTab employees={[
            ...employees,
            makeEmployee('e4', 'Dana', 'seasonal', '2026-05-01', 'pending'),
            makeEmployee('e5', 'Eve', 'seasonal', '2026-05-01', 'on_leave'),
            makeEmployee('e6', 'Fin', 'seasonal', '2026-05-01', 'terminated'),
        ]} />);
        const [typeFilter] = JSON.parse(screen.getByTestId('filter-bar').getAttribute('data-filters')!);
        expect(typeFilter.options).toEqual([
            { value: 'permanent', count: 1 },
            { value: 'seasonal', count: 3 },
            { value: 'casual', count: 1 },
        ]);
        // 3 iniciales + pending + on_leave; la baja no cuenta
        expect(screen.getByText('Active Headcount').previousSibling?.textContent).toBe('5');
    });
});
