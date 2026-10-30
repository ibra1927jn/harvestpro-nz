/** Alta de picker: si no se guarda, el error se ve (antes se pedía un toast que nunca se pintaba) */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../context/AuthContext', () => ({
    useAuth: () => ({ appUser: { id: 'tl-1', email: 'tl@test.com', role: 'team_leader' } }),
}));
vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: () => ({ orchard: { id: 'o-1', name: 'Test Orchard' } }),
}));
vi.mock('@/utils/logger', () => ({ logger: { debug: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/ui/ModalOverlay', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import AddPickerModal from './AddPickerModal';

describe('AddPickerModal — error toast', () => {
    it('shows the error when the picker is not saved', async () => {
        const onAdd = vi.fn().mockRejectedValue(new Error('duplicate picker id'));
        const onClose = vi.fn();
        render(<AddPickerModal onClose={onClose} onAdd={onAdd} />);
        fireEvent.change(screen.getByPlaceholderText("e.g. Liam O'Connor"), { target: { value: 'Liam Test' } });
        fireEvent.change(screen.getByPlaceholderText('e.g. 402'), { target: { value: '402' } });
        fireEvent.change(screen.getByPlaceholderText('HN-402'), { target: { value: 'HN-402' } });
        const safetyLabel = screen.getByText(/Safety Induction Completed/).closest('label')!;
        fireEvent.click(safetyLabel.querySelector('input[type="checkbox"]')!);
        fireEvent.click(screen.getByText('Add Picker to Team'));
        expect(await screen.findByText(/duplicate picker id/)).toBeTruthy();
        expect(screen.getByText('error')).toBeTruthy(); // icono de error, no de éxito
        expect(onClose).not.toHaveBeenCalled();
    });
});
