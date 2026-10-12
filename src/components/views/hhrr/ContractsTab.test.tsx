/**
 * ContractsTab — Deep render + interaction tests
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockChangeContract = vi.fn();
const mockSaveNewContract = vi.fn();

vi.mock('@/services/hhrr.service', () => ({
    changeContract: (...args: unknown[]) => mockChangeContract(...args),
    saveNewContract: (...args: unknown[]) => mockSaveNewContract(...args),
}));
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ appUser: { id: 'hr-1', role: 'hr_admin' } }),
}));

vi.mock('@/components/ui/FilterBar', () => ({
    default: ({ searchPlaceholder, searchValue, onSearchChange }: any) => (
        <input
            data-testid="filter-bar"
            placeholder={searchPlaceholder}
            value={searchValue || ''}
            onChange={(e: any) => onSearchChange(e.target.value)}
        />
    ),
}));

vi.mock('@/components/ui/InlineEdit', () => ({
    default: ({ value }: any) => <span data-testid="inline-edit">{value}</span>,
}));

import ContractsTab from './ContractsTab';

const makeEmployee = (id: string, name: string, contractType: string, contractEnd: string, status = 'active', withContract = true) => ({
    id, full_name: name, name, orchard_id: 'o1', ...(withContract ? { contract_id: `c-${id}` } : {}), email: `${name.toLowerCase()}@test.com`, role: 'picker',
    contract_type: contractType,
    contract_start: '2025-01-01',
    contract_end: contractEnd,
    hourly_rate: 23.95,
    status,
    visa_status: 'not_recorded',
}) as any;

const makeSummary = () => ({
    totalEmployees: 3,
    activeContracts: 2,
    expiringContracts: 1,
    totalPayroll: 5000,
}) as any;

describe('ContractsTab', () => {
    const employees = [
        makeEmployee('e1', 'Alice', 'permanent', '2027-12-31'),
        makeEmployee('e2', 'Bob', 'seasonal', '2026-04-30'),
        makeEmployee('e3', 'Charlie', 'casual', '2026-03-15', 'terminated'),
    ];

    const defaultProps = {
        employees,
        summary: makeSummary(),
        onRefresh: vi.fn(),
    };

    beforeEach(() => vi.clearAllMocks());

    it('renders contract type badges', () => {
        render(<ContractsTab {...defaultProps} />);
        expect(screen.getByText('permanent')).toBeTruthy();
        expect(screen.getByText('seasonal')).toBeTruthy();
    });

    it('renders filter bar', () => {
        render(<ContractsTab {...defaultProps} />);
        expect(screen.getByTestId('filter-bar')).toBeTruthy();
    });

    it('shows Renew button for active contracts', () => {
        render(<ContractsTab {...defaultProps} />);
        const renewBtns = screen.getAllByText('Renew');
        expect(renewBtns.length).toBeGreaterThanOrEqual(1);
    });

    it('shows Terminate button for active contracts', () => {
        render(<ContractsTab {...defaultProps} />);
        const terminateBtns = screen.getAllByText('Terminate');
        expect(terminateBtns.length).toBeGreaterThanOrEqual(1);
    });

    it('renews the real contract (by contract id, not the person id)', async () => {
        mockChangeContract.mockResolvedValue(undefined);
        render(<ContractsTab {...defaultProps} />);
        fireEvent.click(screen.getAllByText('Renew')[0]);
        await waitFor(() => expect(mockChangeContract).toHaveBeenCalledWith('c-e1', expect.objectContaining({ status: 'active' })));
        await waitFor(() => expect(defaultProps.onRefresh).toHaveBeenCalled());
    });

    it('shows the error when the renewal is not saved', async () => {
        mockChangeContract.mockRejectedValue(new Error('permission denied'));
        render(<ContractsTab {...defaultProps} />);
        fireEvent.click(screen.getAllByText('Renew')[0]);
        await waitFor(() => expect(screen.getByText(/permission denied/)).toBeTruthy());
        expect(defaultProps.onRefresh).not.toHaveBeenCalled();
    });

    it('lets HR create a contract for someone without one', async () => {
        mockSaveNewContract.mockResolvedValue(undefined);
        render(<ContractsTab {...defaultProps} employees={[makeEmployee('e9', 'Dana', 'seasonal', '', 'active', false)]} />);
        expect(screen.queryByText('Renew')).toBeNull();
        fireEvent.click(screen.getByText('Create contract'));
        fireEvent.click(screen.getByText('Save contract'));
        await waitFor(() => expect(mockSaveNewContract).toHaveBeenCalledWith(
            expect.objectContaining({ employee_id: 'e9', orchard_id: 'o1', type: 'seasonal', created_by: 'hr-1' })
        ));
    });

    it('shows contract end dates', () => {
        render(<ContractsTab {...defaultProps} />);
        expect(screen.getByText(/2027/)).toBeTruthy();
    });

    it('renders with empty employees', () => {
        render(<ContractsTab employees={[]} summary={makeSummary()} />);
        expect(screen.getByTestId('filter-bar')).toBeTruthy();
    });
});
