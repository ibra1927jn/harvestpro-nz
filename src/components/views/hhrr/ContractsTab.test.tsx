/**
 * ContractsTab — Deep render + interaction tests
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockChangeContract = vi.fn();
const mockSaveNewContract = vi.fn();
const mockUploadSignedContract = vi.fn();
const mockSignedDocumentUrl = vi.fn();

vi.mock('@/services/hhrr.service', () => ({
    changeContract: (...args: unknown[]) => mockChangeContract(...args),
    saveNewContract: (...args: unknown[]) => mockSaveNewContract(...args),
    uploadSignedContract: (...args: unknown[]) => mockUploadSignedContract(...args),
    signedDocumentUrl: (...args: unknown[]) => mockSignedDocumentUrl(...args),
}));
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ appUser: { id: 'hr-1', role: 'hr_admin' } }),
}));

vi.mock('@/components/ui/FilterBar', () => ({
    default: ({ searchPlaceholder, searchValue, onSearchChange, filters }: any) => (
        <input
            data-testid="filter-bar"
            placeholder={searchPlaceholder}
            value={searchValue || ''}
            data-filters={JSON.stringify(filters)}
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
    source: 'staff',
}) as any;

const makeSummary = (pendingContracts = 0) => ({
    activeWorkers: 3,
    pendingContracts,
    payrollThisWeek: 5000,
    complianceAlerts: 0,
});

const pdf = (name = 'signed.pdf', size = 10) => new File([new Uint8Array(size)], name, { type: 'application/pdf' });

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
        expect(screen.getByText('Permanent')).toBeTruthy();
        expect(screen.getByText('Seasonal')).toBeTruthy();
    });

    it('renders filter bar', () => {
        render(<ContractsTab {...defaultProps} />);
        expect(screen.getByTestId('filter-bar')).toBeTruthy();
    });

    it('filters offer the whole contract-type and status domains with counts', () => {
        render(<ContractsTab {...defaultProps} />);
        const filters = JSON.parse(screen.getByTestId('filter-bar').getAttribute('data-filters')!);
        expect(filters[0].options).toEqual([
            { value: 'permanent', count: 1 }, { value: 'seasonal', count: 1 }, { value: 'casual', count: 1 },
        ]);
        expect(filters[1].options).toEqual([
            { value: 'active', count: 2 }, { value: 'on_leave', count: 0 }, { value: 'pending', count: 0 }, { value: 'terminated', count: 1 },
        ]);
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

    it('renews the real contract (by contract id, not the person id) and asks for the new PDF', async () => {
        mockChangeContract.mockResolvedValue(undefined);
        render(<ContractsTab {...defaultProps} />);
        fireEvent.click(screen.getAllByText('Renew')[0]);
        // Sin PDF: se renueva igual y se avisa de que falta la copia firmada
        fireEvent.click(screen.getByText('Confirm renewal'));
        await waitFor(() => expect(mockChangeContract).toHaveBeenCalledWith('c-e1', expect.objectContaining({ status: 'active' })));
        await waitFor(() => expect(defaultProps.onRefresh).toHaveBeenCalled());
        expect(mockUploadSignedContract).not.toHaveBeenCalled();
        expect(screen.getByRole('status').textContent).toMatch(/No signed copy/);
    });

    it('renewing with a PDF uploads it linked to the same contract and the new end date', async () => {
        mockChangeContract.mockResolvedValue(undefined);
        mockUploadSignedContract.mockResolvedValue(undefined);
        const { container } = render(<ContractsTab {...defaultProps} />);
        fireEvent.click(screen.getAllByText('Renew')[0]);
        const dateInput = container.querySelector('[data-testid="renew-contract-form"] input[type="date"]') as HTMLInputElement;
        fireEvent.change(dateInput, { target: { value: '2028-06-30' } });
        const fileInput = container.querySelector('[data-testid="renew-contract-form"] input[type="file"]') as HTMLInputElement;
        fireEvent.change(fileInput, { target: { files: [pdf()] } });
        fireEvent.click(screen.getByText('Confirm renewal'));
        await waitFor(() => expect(mockUploadSignedContract).toHaveBeenCalledWith(
            expect.any(File),
            expect.objectContaining({ contractId: 'c-e1', orchardId: 'o1', endDate: '2028-06-30', uploadedBy: 'hr-1' })
        ));
        expect(mockChangeContract).toHaveBeenCalledWith('c-e1', { status: 'active', end_date: '2028-06-30' });
    });

    it('shows the error when the renewal is not saved', async () => {
        mockChangeContract.mockRejectedValue(new Error('permission denied'));
        render(<ContractsTab {...defaultProps} />);
        fireEvent.click(screen.getAllByText('Renew')[0]);
        fireEvent.click(screen.getByText('Confirm renewal'));
        await waitFor(() => expect(screen.getByText(/permission denied/)).toBeTruthy());
        expect(defaultProps.onRefresh).not.toHaveBeenCalled();
    });

    it('lets HR create a contract for someone without one', async () => {
        mockSaveNewContract.mockResolvedValue({ id: 'c-new' });
        render(<ContractsTab {...defaultProps} employees={[makeEmployee('e9', 'Dana', 'seasonal', '', 'active', false)]} />);
        expect(screen.queryByText('Renew')).toBeNull();
        fireEvent.click(screen.getByText('Create contract'));
        fireEvent.click(screen.getByText('Save contract'));
        await waitFor(() => expect(mockSaveNewContract).toHaveBeenCalledWith(
            expect.objectContaining({ employee_id: 'e9', orchard_id: 'o1', type: 'seasonal', created_by: 'hr-1' })
        ));
        expect(mockUploadSignedContract).not.toHaveBeenCalled();
    });

    describe('signed copy (PDF)', () => {
        it('uploads the signed PDF when the contract is created, linked to the new contract', async () => {
            mockSaveNewContract.mockResolvedValue({ id: 'c-new' });
            mockUploadSignedContract.mockResolvedValue(undefined);
            const { container } = render(<ContractsTab {...defaultProps} employees={[makeEmployee('e9', 'Dana', 'seasonal', '', 'active', false)]} />);
            fireEvent.click(screen.getByText('Create contract'));
            const endInput = container.querySelectorAll('[data-testid="create-contract-form"] input[type="date"]')[1] as HTMLInputElement;
            fireEvent.change(endInput, { target: { value: '2027-03-31' } });
            const fileInput = container.querySelector('[data-testid="create-contract-form"] input[type="file"]') as HTMLInputElement;
            fireEvent.change(fileInput, { target: { files: [pdf()] } });
            fireEvent.click(screen.getByText('Save contract'));
            await waitFor(() => expect(mockUploadSignedContract).toHaveBeenCalledWith(
                expect.any(File),
                expect.objectContaining({ contractId: 'c-new', orchardId: 'o1', endDate: '2027-03-31', employee: expect.objectContaining({ id: 'e9' }) })
            ));
            await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Contract created for Dana$/));
            expect(defaultProps.onRefresh).toHaveBeenCalled();
        });

        it('keeps the contract and warns when the PDF upload fails', async () => {
            mockSaveNewContract.mockResolvedValue({ id: 'c-new' });
            mockUploadSignedContract.mockRejectedValue(new Error('storage down'));
            const { container } = render(<ContractsTab {...defaultProps} employees={[makeEmployee('e9', 'Dana', 'seasonal', '', 'active', false)]} />);
            fireEvent.click(screen.getByText('Create contract'));
            const fileInput = container.querySelector('[data-testid="create-contract-form"] input[type="file"]') as HTMLInputElement;
            fireEvent.change(fileInput, { target: { files: [pdf()] } });
            fireEvent.click(screen.getByText('Save contract'));
            await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Contract created for Dana — storage down$/));
            expect(mockSaveNewContract).toHaveBeenCalledTimes(1);
            expect(defaultProps.onRefresh).toHaveBeenCalled();
        });

        it('rejects files that are not PDF or are over 10 MB before saving', () => {
            const { container } = render(<ContractsTab {...defaultProps} employees={[makeEmployee('e9', 'Dana', 'seasonal', '', 'active', false)]} />);
            fireEvent.click(screen.getByText('Create contract'));
            const fileInput = container.querySelector('[data-testid="create-contract-form"] input[type="file"]') as HTMLInputElement;
            fireEvent.change(fileInput, { target: { files: [new File(['x'], 'photo.png', { type: 'image/png' })] } });
            expect(screen.getByRole('alert').textContent).toBe('Only PDF files are accepted');
            const big = new File([new Uint8Array(11 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' });
            fireEvent.change(fileInput, { target: { files: [big] } });
            expect(screen.getByRole('alert').textContent).toBe('The PDF is larger than 10 MB');
        });

        it('warns "no signed copy" on contracts without a linked PDF and lets HR upload it', async () => {
            mockUploadSignedContract.mockResolvedValue(undefined);
            render(<ContractsTab {...defaultProps} employees={[makeEmployee('e2', 'Bob', 'seasonal', '2026-04-30')]} />);
            expect(screen.getByTestId('no-signed-copy-e2').textContent).toMatch(/No signed copy/);
            expect(screen.queryByText('View PDF')).toBeNull();
            fireEvent.change(screen.getByLabelText('Upload signed'), { target: { files: [pdf()] } });
            await waitFor(() => expect(mockUploadSignedContract).toHaveBeenCalledWith(
                expect.any(File),
                expect.objectContaining({ contractId: 'c-e2', endDate: '2026-04-30' })
            ));
            await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Signed contract uploaded for Bob$/));
            expect(defaultProps.onRefresh).toHaveBeenCalled();
        });

        it('shows "View PDF" (signed URL) when the contract has its signed copy', async () => {
            mockSignedDocumentUrl.mockResolvedValue('https://signed.example/doc.pdf');
            const open = vi.spyOn(window, 'open').mockImplementation(() => null);
            const emp = { ...makeEmployee('e1', 'Alice', 'permanent', '2027-12-31'), contract_document: { id: 'd1', storage_path: 'o1/employment_agreement/x.pdf' } };
            render(<ContractsTab {...defaultProps} employees={[emp]} />);
            expect(screen.queryByTestId('no-signed-copy-e1')).toBeNull();
            fireEvent.click(screen.getByText('View PDF'));
            await waitFor(() => expect(mockSignedDocumentUrl).toHaveBeenCalledWith('o1/employment_agreement/x.pdf'));
            await waitFor(() => expect(open).toHaveBeenCalledWith('https://signed.example/doc.pdf', '_blank', 'noopener'));
            open.mockRestore();
        });
    });

    it('banner counts pending contracts (renewal or signed copy missing)', () => {
        render(<ContractsTab {...defaultProps} summary={makeSummary(4)} />);
        expect(screen.getByText('4 contracts pending: renewal due or signed copy missing')).toBeTruthy();
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
