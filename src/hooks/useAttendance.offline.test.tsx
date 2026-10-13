/**
 * Fichar sin cobertura: la acción falla al momento (y se avisa), no se queda en
 * pausa para ejecutarse sola horas después con otra hora.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';

const checkInPicker = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
vi.mock('../services/attendance.service', () => ({
    attendanceService: {
        checkInPicker: (...a: unknown[]) => checkInPicker(...a),
        checkOutPicker: vi.fn(),
        getDailyAttendance: vi.fn().mockResolvedValue([]),
    },
}));
vi.mock('../services/database.service', () => ({ databaseService: { getPickersByTeam: vi.fn().mockResolvedValue([]) } }));

import { useAttendance } from './useAttendance';

afterEach(() => onlineManager.setOnline(true));

describe('useAttendance without signal', () => {
    it('check-in fails right away instead of staying paused until signal returns', async () => {
        const qc = new QueryClient({ defaultOptions: { mutations: { retry: 1 } } });
        const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
        const { result } = renderHook(() => useAttendance({ id: 'tl1', orchard_id: 'o1' } as never), { wrapper });
        onlineManager.setOnline(false);

        let outcome: string = 'pending';
        await act(async () => {
            const p = result.current.checkIn('p1').then(() => 'ok', () => 'failed');
            outcome = await Promise.race([p, new Promise<string>(r => setTimeout(() => r('paused'), 500))]);
        });
        expect(outcome).toBe('failed');
        expect(checkInPicker).toHaveBeenCalledTimes(1);
    });
});
