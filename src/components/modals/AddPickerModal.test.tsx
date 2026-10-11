/**
 * AddPickerModal.test.tsx — Tests for adding a new picker
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddPickerModal from './AddPickerModal';

// Mock dependencies
vi.mock('../../context/AuthContext', () => ({
    useAuth: () => ({ appUser: { id: 'tl-1', email: 'tl@test.com', role: 'team_leader' } }),
}));
vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: () => ({ orchard: { id: 'o-1', name: 'Test Orchard' } }),
}));
vi.mock('@/utils/logger', () => ({
    logger: { debug: vi.fn(), error: vi.fn() },
}));
vi.mock('@/hooks/useToast', () => ({
    useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/components/ui/ModalOverlay', () => ({
    default: ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => (
        <div data-testid="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            {children}
        </div>
    ),
}));

describe('AddPickerModal', () => {
    const onClose = vi.fn();
    const onAdd = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        onAdd.mockResolvedValue(undefined);
    });

    it('renders "Add New Picker" heading', () => {
        render(<AddPickerModal onClose={onClose} onAdd={onAdd} />);
        expect(screen.getByText('Add New Picker')).toBeTruthy();
    });

    it('renders all required fields', () => {
        render(<AddPickerModal onClose={onClose} onAdd={onAdd} />);
        expect(screen.getByText('Full Name *')).toBeTruthy();
        expect(screen.getByText('Picker ID *')).toBeTruthy();
        expect(screen.getByText('Harness No. *')).toBeTruthy();
        expect(screen.getByText('Start Time *')).toBeTruthy();
    });

    it('renders optional Row field', () => {
        render(<AddPickerModal onClose={onClose} onAdd={onAdd} />);
        expect(screen.getByText('Row (Optional)')).toBeTruthy();
    });

    it('renders Safety Induction section', () => {
        render(<AddPickerModal onClose={onClose} onAdd={onAdd} />);
        expect(screen.getByText('Safety Induction')).toBeTruthy();
    });

    it('submit button is disabled when fields are empty', () => {
        render(<AddPickerModal onClose={onClose} onAdd={onAdd} />);
        const btn = screen.getByText('Add Picker to Team');
        expect((btn as HTMLButtonElement).disabled).toBe(true);
    });

    it('submit button is disabled until safety checks are completed', () => {
        render(<AddPickerModal onClose={onClose} onAdd={onAdd} />);

        // Fill all required fields
        fireEvent.change(screen.getByPlaceholderText("e.g. Liam O'Connor"), { target: { value: 'Test Name' } });
        fireEvent.change(screen.getByPlaceholderText('e.g. 402'), { target: { value: '402' } });
        fireEvent.change(screen.getByPlaceholderText('HN-402'), { target: { value: 'HN-402' } });

        // Button should still be disabled (safety not checked)
        const btn = screen.getByText('Add Picker to Team');
        expect((btn as HTMLButtonElement).disabled).toBe(true);
    });

    it('enables submit after filling all fields and checking safety', () => {
        render(<AddPickerModal onClose={onClose} onAdd={onAdd} />);

        fireEvent.change(screen.getByPlaceholderText("e.g. Liam O'Connor"), { target: { value: 'Test Name' } });
        fireEvent.change(screen.getByPlaceholderText('e.g. 402'), { target: { value: '402' } });
        fireEvent.change(screen.getByPlaceholderText('HN-402'), { target: { value: 'HN-402' } });

        // Check safety induction
        const safetyText = screen.getByText(/Safety Induction Completed/);
        const label = safetyText.closest('label')!;
        const checkbox = label.querySelector('input[type="checkbox"]')!;
        fireEvent.click(checkbox);

        const btn = screen.getByText('Add Picker to Team');
        expect((btn as HTMLButtonElement).disabled).toBe(false);
    });

    it('calls onAdd with correct data after submit', async () => {
        render(<AddPickerModal onClose={onClose} onAdd={onAdd} />);

        fireEvent.change(screen.getByPlaceholderText("e.g. Liam O'Connor"), { target: { value: 'Liam Test' } });
        fireEvent.change(screen.getByPlaceholderText('e.g. 402'), { target: { value: '402' } });
        fireEvent.change(screen.getByPlaceholderText('HN-402'), { target: { value: 'HN-402' } });

        const safetyLabel = screen.getByText(/Safety Induction Completed/).closest('label')!;
        fireEvent.click(safetyLabel.querySelector('input[type="checkbox"]')!);

        fireEvent.click(screen.getByText('Add Picker to Team'));

        await waitFor(() => {
            expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
                name: 'Liam Test',
                picker_id: '402',
                harness_id: 'HN-402',
                role: 'picker', // la BD solo acepta minúsculas
                status: 'active',
                safety_verified: true,
            }));
        });
    });

    it('calls onClose after successful submission', async () => {
        render(<AddPickerModal onClose={onClose} onAdd={onAdd} />);

        fireEvent.change(screen.getByPlaceholderText("e.g. Liam O'Connor"), { target: { value: 'Test' } });
        fireEvent.change(screen.getByPlaceholderText('e.g. 402'), { target: { value: '1' } });
        fireEvent.change(screen.getByPlaceholderText('HN-402'), { target: { value: 'HN' } });
        fireEvent.click(screen.getByText(/Safety Induction Completed/).closest('label')!.querySelector('input[type="checkbox"]')!);

        fireEvent.click(screen.getByText('Add Picker to Team'));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('calls onClose when close button clicked', () => {
        render(<AddPickerModal onClose={onClose} onAdd={onAdd} />);
        fireEvent.click(screen.getByText('close'));
        expect(onClose).toHaveBeenCalled();
    });
});
