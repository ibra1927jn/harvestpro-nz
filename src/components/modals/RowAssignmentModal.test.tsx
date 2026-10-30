/**
 * RowAssignmentModal.test.tsx
 * Integration tests for the row assignment modal
 * 
 * Tests cover:
 * - Only the rows the manager assigned to the team can be chosen
 * - Picker selection toggle
 * - Validation (disables submit when row or pickers missing)
 * - Successful move flow
 * - Error handling with toast (the server refused the row)
 * - Empty states (no assigned rows, no active pickers)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RowAssignmentModal from './RowAssignmentModal';
import type { PickerForAssignment } from './RowAssignmentModal';

// ── Mock useToast ──────────────────────────
const mockShowToast = vi.fn();
vi.mock('@/hooks/useToast', () => ({
    useToast: () => ({
        toast: null,
        showToast: mockShowToast,
        hideToast: vi.fn(),
    }),
}));

// ── Mock ModalOverlay — render children directly ──
vi.mock('@/components/ui/ModalOverlay', () => ({
    default: ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => (
        <div data-testid="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            {children}
        </div>
    ),
}));

// ── Test Data ──────────────────────────────
const mockPickers: PickerForAssignment[] = [
    { id: 'p1', name: 'Alice Johnson', avatar: 'AJ', idNumber: 'PK001', status: 'Active' },
    { id: 'p2', name: 'Bob Smith', avatar: 'BS', idNumber: 'PK002', status: 'Active' },
    { id: 'p3', name: 'Charlie Brown', avatar: 'CB', idNumber: 'PK003', status: 'Break' },
    { id: 'p4', name: 'Diana Off', avatar: 'DO', idNumber: 'PK004', status: 'Off Duty' },
];

describe('RowAssignmentModal', () => {
    const mockOnClose = vi.fn();
    const mockOnAssign = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockOnAssign.mockResolvedValue(undefined);
    });

    const renderModal = (
        pickers = mockPickers,
        { allowedRows = [3, 7, 14], initialRow }: { allowedRows?: number[]; initialRow?: number } = {},
    ) => {
        const user = userEvent.setup();
        render(
            <RowAssignmentModal
                onClose={mockOnClose}
                onAssign={mockOnAssign}
                pickers={pickers}
                allowedRows={allowedRows}
                initialRow={initialRow}
            />
        );
        return { user };
    };

    const rowButton = (n: number) => screen.getByRole('button', { name: String(n) });

    // ═══════════════════════════════════════
    // RENDERING
    // ═══════════════════════════════════════

    it('offers only the rows the manager assigned to the team (no free row number)', () => {
        renderModal(mockPickers, { allowedRows: [7, 3, 7] });

        expect(screen.getByRole('heading', { name: 'Assign Row' })).toBeInTheDocument();
        expect(screen.getByText('Rows the manager assigned to your team')).toBeInTheDocument();
        const group = screen.getByRole('group', { name: 'Rows the manager assigned to your team' });
        expect([...group.querySelectorAll('button')].map(b => b.textContent)).toEqual(['3', '7']);
        expect(screen.queryByRole('spinbutton')).toBeNull();
        expect(screen.queryByLabelText('Side')).toBeNull();
    });

    it('shows a notice and cannot submit when the manager assigned no rows to the team', async () => {
        const { user } = renderModal(mockPickers, { allowedRows: [] });

        expect(screen.getByTestId('no-assigned-rows')).toHaveTextContent("The manager hasn't assigned rows to your team yet.");
        await user.click(screen.getAllByRole('checkbox')[0]);
        expect(screen.getByRole('button', { name: /assign row/i })).toBeDisabled();
    });

    it('preselects the row tapped on the map only if it is one of the assigned rows', () => {
        renderModal(mockPickers, { initialRow: 7 });
        expect(rowButton(7)).toHaveAttribute('aria-pressed', 'true');
    });

    it('does not preselect a row tapped on the map that was not assigned to the team', () => {
        renderModal(mockPickers, { initialRow: 5 });
        expect(screen.queryByRole('button', { name: '5' })).toBeNull();
        expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
    });

    it('preselects the only assigned row', () => {
        renderModal(mockPickers, { allowedRows: [9] });
        expect(rowButton(9)).toHaveAttribute('aria-pressed', 'true');
    });

    it('renders only active pickers (excludes Off Duty)', () => {
        renderModal();

        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
        expect(screen.getByText('Bob Smith')).toBeInTheDocument();
        expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
        expect(screen.queryByText('Diana Off')).not.toBeInTheDocument();
    });

    it('shows picker count in section header', () => {
        renderModal();

        expect(screen.getByText('Assign Pickers (0)')).toBeInTheDocument();
    });

    // ═══════════════════════════════════════
    // PICKER SELECTION
    // ═══════════════════════════════════════

    it('toggles picker selection via checkbox', async () => {
        const { user } = renderModal();

        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes).toHaveLength(3); // 3 active pickers

        await user.click(checkboxes[0]);
        expect(checkboxes[0]).toBeChecked();
        expect(screen.getByText('Assign Pickers (1)')).toBeInTheDocument();

        await user.click(checkboxes[1]);
        expect(checkboxes[1]).toBeChecked();
        expect(screen.getByText('Assign Pickers (2)')).toBeInTheDocument();

        await user.click(checkboxes[0]);
        expect(checkboxes[0]).not.toBeChecked();
        expect(screen.getByText('Assign Pickers (1)')).toBeInTheDocument();
    });

    // ═══════════════════════════════════════
    // VALIDATION
    // ═══════════════════════════════════════

    it('submit button is disabled when no row is chosen', async () => {
        const { user } = renderModal();

        await user.click(screen.getAllByRole('checkbox')[0]);

        expect(screen.getByRole('button', { name: /assign row/i })).toBeDisabled();
    });

    it('submit button is disabled when no pickers selected', async () => {
        const { user } = renderModal();

        await user.click(rowButton(7));

        expect(screen.getByRole('button', { name: /assign row 7/i })).toBeDisabled();
    });

    it('submit button is enabled when an assigned row + pickers are chosen', async () => {
        const { user } = renderModal();

        await user.click(rowButton(7));
        await user.click(screen.getAllByRole('checkbox')[0]);

        expect(screen.getByRole('button', { name: /assign row 7/i })).toBeEnabled();
    });

    // ═══════════════════════════════════════
    // SUCCESSFUL MOVE
    // ═══════════════════════════════════════

    it('calls onAssign with the row and the selected pickers and auto-closes on success', async () => {
        const { user } = renderModal();

        await user.click(rowButton(14));
        expect(rowButton(14)).toHaveAttribute('aria-pressed', 'true');
        await user.click(screen.getAllByRole('checkbox')[0]); // Alice (p1)
        await user.click(screen.getAllByRole('checkbox')[1]); // Bob (p2)

        await user.click(screen.getByRole('button', { name: /assign row 14/i }));

        expect(mockOnAssign).toHaveBeenCalledOnce();
        expect(mockOnAssign).toHaveBeenCalledWith(14, ['p1', 'p2']);
        expect(mockOnClose).toHaveBeenCalledOnce();
    });

    // ═══════════════════════════════════════
    // ERROR HANDLING
    // ═══════════════════════════════════════

    it('shows error toast when onAssign rejects (e.g. the server refused the row)', async () => {
        mockOnAssign.mockRejectedValueOnce(new Error('Row 3 is not assigned to your team by the manager'));
        const { user } = renderModal();

        await user.click(rowButton(3));
        await user.click(screen.getAllByRole('checkbox')[0]);
        await user.click(screen.getByRole('button', { name: /assign row 3/i }));

        expect(mockShowToast).toHaveBeenCalledWith('Error assigning row', 'error');
        expect(mockOnClose).not.toHaveBeenCalled();
    });

    // ═══════════════════════════════════════
    // EMPTY STATE
    // ═══════════════════════════════════════

    it('shows empty state when all pickers are off duty', () => {
        const offDutyOnly: PickerForAssignment[] = [
            { id: 'p1', name: 'Alice', avatar: 'A', idNumber: 'PK001', status: 'Off Duty' },
        ];

        renderModal(offDutyOnly);

        expect(screen.getByText('No active pickers available')).toBeInTheDocument();
    });
});
