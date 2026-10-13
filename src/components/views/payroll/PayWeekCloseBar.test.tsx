import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PayWeekCloseBar, type PayWeekCloseBarProps } from './PayWeekCloseBar';

const base: PayWeekCloseBarProps = {
    weekEnd: '2026-10-11', closedInfo: null, canManageWeek: true, weekFinished: true,
    closing: false, closeResult: null, onClose: vi.fn(), onReopen: vi.fn(),
};

describe('PayWeekCloseBar', () => {
    it('semana en curso: no se puede cerrar', () => {
        render(<PayWeekCloseBar {...base} weekFinished={false} />);
        expect(screen.getByTestId('pay-week-open')).toBeInTheDocument();
        expect(screen.queryByText('Close pay week')).toBeNull();
    });

    it('semana terminada: pide confirmación antes de cerrar', () => {
        const onClose = vi.fn();
        render(<PayWeekCloseBar {...base} onClose={onClose} />);
        fireEvent.click(screen.getByText('Close pay week'));
        expect(onClose).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText('Yes, close it'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('sin permiso no aparece el botón', () => {
        render(<PayWeekCloseBar {...base} canManageWeek={false} />);
        expect(screen.queryByText('Close pay week')).toBeNull();
    });

    it('muestra quién tiene horas sin cerrar', () => {
        render(<PayWeekCloseBar {...base} closeResult={{
            week: { start: '2026-10-05', end: '2026-10-11' }, closed: false, reason: 'ESTIMATED_HOURS',
            pending: [{ picker_id: 'p1', picker_name: 'Ana', dates: ['2026-10-07'] }],
        }} />);
        expect(screen.getByText('Ana: Wed, 7 Oct')).toBeInTheDocument();
    });

    it('reabrir exige motivo', () => {
        const onReopen = vi.fn();
        render(<PayWeekCloseBar {...base} closedInfo={{ closed_at: '2026-10-12T01:00:00Z', closed_by: 'u1' }} onReopen={onReopen} />);
        fireEvent.click(screen.getByText('Reopen week'));
        const confirm = screen.getByText('Confirm reopen');
        expect(confirm).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Reason to reopen the week'), { target: { value: 'Missing shift for Ana' } });
        fireEvent.click(confirm);
        expect(onReopen).toHaveBeenCalledWith('Missing shift for Ana');
    });
});
