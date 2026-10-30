/**
 * Fichar sin cobertura: no se queda en pausa ni se pierde. Se guarda en la cola
 * del móvil (IndexedDB real con fake-indexeddb) y la pantalla cambia al momento,
 * marcada «pendiente de enviar».
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';

const checkInPicker = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
vi.mock('../services/attendance.service', () => ({
    attendanceService: {
        checkInPicker: (...a: unknown[]) => checkInPicker(...a),
        checkOutPicker: vi.fn(),
        recordBreak: vi.fn(),
        getDailyAttendance: vi.fn().mockResolvedValue([]),
    },
}));
vi.mock('../services/database.service', () => ({
    databaseService: { getPickersByTeam: vi.fn().mockResolvedValue([{ id: 'p1', name: 'Ana' }]) },
}));
vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { useAttendance } from './useAttendance';
import { db } from '../services/db';

const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { value: v, writable: true, configurable: true });

beforeEach(async () => {
    await db.sync_queue.clear();
    checkInPicker.mockClear();
});
afterEach(() => {
    onlineManager.setOnline(true);
    setOnline(true);
});

describe('useAttendance without signal', () => {
    it('check-in is saved on the phone right away and shown as present, pending', async () => {
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 1 } } });
        const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
        const { result } = renderHook(() => useAttendance({ id: 'tl1', orchard_id: 'o1' } as never), { wrapper });
        await waitFor(() => expect(result.current.mergedList).toHaveLength(1));
        onlineManager.setOnline(false);
        setOnline(false);

        let state = '';
        await act(async () => {
            state = (await result.current.checkIn('p1')).state;
        });
        expect(state).toBe('queued');
        // Sin red no se intenta enviar
        expect(checkInPicker).not.toHaveBeenCalled();
        await waitFor(() => expect(result.current.mergedList[0]).toMatchObject({ isPresent: true, pending: true }));
        expect(result.current.queuedCount).toBe(1);

        // Descanso del tramo pendiente: también a la cola, sobre el mismo tramo
        const shift = result.current.mergedList[0].attendanceRecord!.id!;
        await act(async () => {
            await result.current.startBreak(shift);
        });
        await waitFor(() => expect(result.current.mergedList[0].onBreak).toBe(true));
        expect(result.current.queuedCount).toBe(2);
    });
});
