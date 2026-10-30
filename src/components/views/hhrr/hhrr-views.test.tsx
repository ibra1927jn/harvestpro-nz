/**
 * Tests for HHRR views: CalendarTab (Agenda) smoke tests.
 * El «Horario de hoy» calculado del fin de turno se quitó (revisión 21-10,
 * punto 5): no hay fin de turno, cada persona ficha su salida.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/services/leave.service', async importOriginal => ({
    ...(await importOriginal<typeof import('@/services/leave.service')>()),
    leaveService: { listInRange: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ appUser: { id: 'hr-1', role: 'hr_admin' } }) }));
vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: (selector: (s: { orchard: { id: string } }) => unknown) => selector({ orchard: { id: 'o1' } }),
}));

import CalendarTab from './CalendarTab';

describe('CalendarTab', () => {
    it('renders the agenda with month / week views and the new-leave button', async () => {
        render(<CalendarTab employees={[]} />);
        expect(screen.getByTestId('hr-agenda')).toBeTruthy();
        expect(screen.getByTestId('agenda-month')).toBeTruthy();
        expect(screen.getByText('Week')).toBeTruthy();
        expect(screen.getByText('New leave')).toBeTruthy();
        await waitFor(() => expect(screen.queryByTestId('agenda-loading')).toBeNull());
    });

    it('no longer renders the orchard shift schedule nor computed break times', () => {
        render(<CalendarTab employees={[]} />);
        expect(screen.queryByTestId('calendar-fallback-banner')).toBeNull();
        expect(screen.queryByText("Today's Schedule")).toBeNull();
        expect(screen.queryByText('Shift Start — All Teams')).toBeNull();
        expect(screen.queryByText('Shift End — Day Closure')).toBeNull();
        expect(screen.queryByText('07:00')).toBeNull();
        expect(screen.queryByText('17:00')).toBeNull();
    });

    it('keeps a fixed legal reminder about breaks, without calculated times', () => {
        render(<CalendarTab employees={[]} />);
        const reminder = screen.getByTestId('breaks-reminder').textContent ?? '';
        expect(reminder).toMatch(/10-min rest every 2 h/);
        expect(reminder).toMatch(/30-min meal break at 4 h/);
        expect(reminder).not.toMatch(/\d{2}:\d{2}/);
    });

    it('shows no sample leave entries', () => {
        render(<CalendarTab employees={[]} />);
        expect(screen.queryByText('Aroha W.')).toBeNull();
        expect(screen.queryByText('Upcoming Leave')).toBeNull();
    });
});
