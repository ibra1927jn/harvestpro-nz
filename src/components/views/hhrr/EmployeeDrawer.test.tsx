/**
 * RRHH › Employees: la fila abre la ficha (contrato, documentos, ausencias, qué falta).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const listByPersonDocs = vi.fn();
const listByPersonLeave = vi.fn();
vi.mock('@/repositories/hr-documents.repository', async (orig) => ({
    ...(await orig<typeof import('@/repositories/hr-documents.repository')>()),
    hrDocumentsRepository: { listByPerson: (...a: unknown[]) => listByPersonDocs(...a) },
}));
vi.mock('@/services/leave.service', () => ({
    leaveService: { listByPerson: (...a: unknown[]) => listByPersonLeave(...a) },
}));
vi.mock('@/components/common/invitations/InvitationsPanel', () => ({ default: () => null }));
vi.mock('react-virtuoso', () => ({
    Virtuoso: ({ data, itemContent }: { data: unknown[]; itemContent: (i: number, d: unknown) => React.ReactNode }) =>
        <div>{data.map((d, i) => <div key={i}>{itemContent(i, d)}</div>)}</div>,
}));

import EmployeesTab from './EmployeesTab';
import type { Employee } from '@/services/hhrr.service';

const emp: Employee = {
    id: 'p1', full_name: 'Ana Tui', email: 'ana@x.nz', role: 'picker', status: 'pending', contract_type: 'seasonal',
    contract_start: '2026-10-01', hourly_rate: 25, visa_status: 'not_recorded', hire_date: '2026-10-01',
    contract_id: 'c1', missing_items: ['signed_copy', 'visa'],
};

beforeEach(() => {
    listByPersonDocs.mockReset().mockResolvedValue([
        { id: 'd1', document_type: 'ird_form', uploaded_at: '2026-10-02T00:00:00Z', expires_at: null },
    ]);
    listByPersonLeave.mockReset().mockResolvedValue([
        { id: 'l1', type: 'sick', start_date: '2026-10-10', end_date: '2026-10-10', status: 'approved' },
    ]);
});

describe('EmployeesTab → person file', () => {
    it('the arrow opens the file with contract, missing items, documents and leave', async () => {
        render(<EmployeesTab employees={[emp]} alerts={[]} />);
        fireEvent.click(screen.getByRole('button', { name: "Open Ana Tui's file" }));
        const drawer = await screen.findByTestId('employee-drawer');
        expect(drawer).toHaveTextContent('Seasonal');
        expect(drawer).toHaveTextContent('$25.00/h');
        expect(screen.getByTestId('employee-missing')).toHaveTextContent(/visa/i);
        expect(await screen.findByText(/Documents \(1\)/)).toBeTruthy();
        expect(screen.getByText(/Leave \(1\)/)).toBeTruthy();
        expect(listByPersonDocs).toHaveBeenCalledWith('p1');
        expect(listByPersonLeave).toHaveBeenCalledWith('p1');
    });

    it('tapping the row opens it too', async () => {
        render(<EmployeesTab employees={[emp]} alerts={[]} />);
        fireEvent.click(screen.getByTestId('employee-row-p1'));
        expect(await screen.findByTestId('employee-drawer')).toBeTruthy();
    });
});
