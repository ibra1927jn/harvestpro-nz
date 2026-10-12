import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const getUnclosed = vi.fn();
vi.mock('@/repositories/attendance.repository', () => ({
    attendanceRepository: { getUnclosedPastShifts: (...a: unknown[]) => getUnclosed(...a) },
}));
vi.mock('@/utils/nzst', () => ({ todayNZST: () => '2026-10-12' }));

import { UnclosedShiftsAlert } from './UnclosedShiftsAlert';

describe('UnclosedShiftsAlert', () => {
    it('no muestra nada si no hay tramos sin cerrar', async () => {
        getUnclosed.mockResolvedValueOnce([]);
        const { container } = render(<UnclosedShiftsAlert />);
        await new Promise(r => setTimeout(r, 0));
        expect(container).toBeEmptyDOMElement();
    });

    it('cuenta tramos y personas y lista quién y cuándo', async () => {
        getUnclosed.mockResolvedValueOnce([
            { id: 'a', pickerId: 'p1', pickerName: 'Ana', orchardName: 'A', date: '2026-10-10', checkIn: '2026-10-09T18:00:00Z' },
            { id: 'b', pickerId: 'p1', pickerName: 'Ana', orchardName: 'A', date: '2026-10-11', checkIn: '2026-10-10T18:00:00Z' },
        ]);
        render(<UnclosedShiftsAlert orchardId="o1" />);
        expect(await screen.findByText(/2 shifts from past days with no check-out \(1 person\)/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button'));
        expect(screen.getByText('Ana — 2026-10-10 (in 07:00, A)')).toBeInTheDocument();
        expect(getUnclosed).toHaveBeenLastCalledWith('2026-10-12', { orchardId: 'o1', pickerIds: undefined });
    });
});
