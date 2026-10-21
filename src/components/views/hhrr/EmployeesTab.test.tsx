/**
 * EmployeesTab — filters with a fixed domain, derived status and onboarding pills.
 * Uses Virtuoso for virtual scrolling which requires mocking.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-virtuoso', () => ({
    Virtuoso: ({ data, itemContent }: any) => (
        <div data-testid="virtuoso">
            {data?.map((item: any, i: number) => (
                <div key={i}>{itemContent(i, item)}</div>
            ))}
        </div>
    ),
}));

// El FilterBar de verdad se prueba en ui-layout.test; aquí solo se mira qué dominio recibe
vi.mock('@/components/ui/FilterBar', () => ({
    default: ({ searchPlaceholder, filters }: any) => (
        <input data-testid="filter-bar" placeholder={searchPlaceholder} data-filters={JSON.stringify(filters)} />
    ),
}));

vi.mock('@/components/ui/InlineEdit', () => ({
    default: ({ value }: any) => <span>{value}</span>,
}));

vi.mock('@/components/ui/InlineSelect', () => ({
    default: ({ value }: any) => <span data-testid="employment">{value}</span>,
}));

vi.mock('@/services/hhrr.service', () => ({
    updateContract: vi.fn(),
}));

import EmployeesTab from './EmployeesTab';

const emp = (over: Record<string, unknown>) => ({
    id: 'p1', full_name: 'Aroha Smith', email: '', role: 'picker', status: 'active', contract_type: 'seasonal',
    contract_start: '2026-01-01', hourly_rate: 23.95, visa_status: 'not_recorded', hire_date: '2026-01-01',
    missing_items: [], ...over,
}) as any;

describe('EmployeesTab', () => {
    it('exports a default component', async () => {
        const mod = await import('./EmployeesTab');
        expect(mod.default).toBeDefined();
        expect(typeof mod.default).toBe('function');
    });

    it('offers the full status and visa domains with counts, even when the list has one value', () => {
        render(<EmployeesTab employees={[emp({}), emp({ id: 'p2', full_name: 'Ben' })]} alerts={[]} />);
        const filters = JSON.parse(screen.getByTestId('filter-bar').getAttribute('data-filters')!);
        const byKey = Object.fromEntries(filters.map((f: { key: string }) => [f.key, f]));
        expect(byKey.status.options).toEqual([
            { value: 'active', count: 2 },
            { value: 'on_leave', count: 0 },
            { value: 'pending', count: 0 },
            { value: 'terminated', count: 0 },
        ]);
        expect(byKey.visa_status.options).toEqual([
            { value: 'work_visa', count: 0 },
            { value: 'expired', count: 0 },
            { value: 'not_recorded', count: 2 },
        ]);
        expect(byKey.role.options).toEqual([{ value: 'picker', count: 2, label: 'Picker' }]);
    });

    it('shows the employment toggle as active for pending/on-leave people plus the derived badge and what is missing', () => {
        render(<EmployeesTab employees={[
            emp({ id: 'p1', full_name: 'Pending Pat', status: 'pending', missing_items: ['signed_copy', 'tax_declaration'] }),
            emp({ id: 'p2', full_name: 'Away Ana', status: 'on_leave', missing_items: [] }),
            emp({ id: 'p3', full_name: 'Gone Gus', status: 'terminated', missing_items: ['contract'] }),
        ]} alerts={[]} />);
        expect(screen.getAllByTestId('employment').map(e => e.textContent)).toEqual(['active', 'active', 'terminated']);
        expect(screen.getByTestId('derived-status-p1').textContent).toBe('Pending');
        expect(screen.getByTestId('derived-status-p2').textContent).toBe('On leave');
        expect(screen.queryByTestId('derived-status-p3')).toBeNull();
        expect(screen.getByTestId('missing-p1').textContent).toBe('Signed agreement missingTax declaration (IR330) missing');
        expect(screen.queryByTestId('missing-p2')).toBeNull();
        expect(screen.getByText('Onboarding complete')).toBeTruthy();
        // Una baja no enseña qué le falta
        expect(screen.queryByTestId('missing-p3')).toBeNull();
    });
});
