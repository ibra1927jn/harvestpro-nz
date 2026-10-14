/**
 * Pase de lista del team leader: aviso "descanso de comida sin anotar" para
 * quien lleva más de 4 h trabajando hoy sin descanso anotado (el pago solo
 * descuenta descansos anotados, decisión del dueño 2026-10-14).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getDailyAttendance = vi.fn();
vi.mock('../services/attendance.service', () => ({
    attendanceService: {
        checkInPicker: vi.fn(),
        checkOutPicker: vi.fn(),
        getDailyAttendance: (...a: unknown[]) => getDailyAttendance(...a),
    },
}));
vi.mock('../services/database.service', () => ({
    databaseService: {
        getPickersByTeam: vi.fn().mockResolvedValue([
            { id: 'long', name: 'Long no break' },
            { id: 'brk', name: 'Long with break' },
            { id: 'short', name: 'Short shift' },
            { id: 'two', name: 'Two segments' },
            { id: 'out', name: 'Checked out' },
        ]),
    },
}));

import { useAttendance } from './useAttendance';

const at = (hhmm: string) => `2026-10-14T${hhmm}:00+13:00`;

describe('useAttendance — meal break warning', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(at('12:30')));
        getDailyAttendance.mockResolvedValue([
            { id: 'a1', picker_id: 'long', status: 'present', check_in: at('07:00') },
            { id: 'a2', picker_id: 'brk', status: 'present', check_in: at('07:00'), break_start: at('11:00') },
            { id: 'a3', picker_id: 'short', status: 'present', check_in: at('09:00') },
            // Mañana 07:00–09:30 en otro tramo y ahora desde las 10:30: 2.5 + 2 = 4.5 h
            { id: 'a4', picker_id: 'two', status: 'present', check_in: at('07:00'), check_out: at('09:30') },
            { id: 'a5', picker_id: 'two', status: 'present', check_in: at('10:30') },
            // Ya se fue: no hay nada que avisar en el pase de lista
            { id: 'a6', picker_id: 'out', status: 'present', check_in: at('06:00'), check_out: at('12:00') },
        ]);
    });
    afterEach(() => vi.useRealTimers());

    it('flags only present people over 4 h today without a recorded break', async () => {
        const qc = new QueryClient();
        const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
        const { result } = renderHook(() => useAttendance({ id: 'tl1', orchard_id: 'o1' } as never), { wrapper });
        await waitFor(() => expect(result.current.mergedList).toHaveLength(5));
        await waitFor(() => expect(result.current.mergedList.some(p => p.isPresent)).toBe(true));
        const flags = Object.fromEntries(result.current.mergedList.map(p => [p.id, p.breakMissing]));
        expect(flags).toEqual({ long: true, brk: false, short: false, two: true, out: false });
    });
});
