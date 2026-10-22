/**
 * useRunnerWarehouse — mis solicitudes (por requested_by), pedir recogida,
 * cancelar solo las pendientes propias y bins por zona con los llenos primero.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ appUser: { id: 'me', orchard_id: 'o1', full_name: 'Rata Runner' } }),
}));

const sendBroadcast = vi.hoisted(() => vi.fn());
vi.mock('@/context/MessagingContext', () => ({
    useMessaging: () => ({ sendBroadcast }),
}));

// Realtime: guarda el manejador para disparar cambios a mano
const rt = vi.hoisted(() => {
    const state: { handler: ((p: { new: unknown; old: unknown }) => void) | null; filter: string | null; removed: number } = { handler: null, filter: null, removed: 0 };
    const channel = {
        on: (_e: string, opts: { filter?: string }, cb: (p: { new: unknown; old: unknown }) => void) => { state.filter = opts.filter ?? null; state.handler = cb; return channel; },
        subscribe: () => channel,
    };
    return { state, supabase: { channel: () => channel, removeChannel: () => { state.removed++; } } };
});
vi.mock('@/services/supabase', () => ({ supabase: rt.supabase }));

const svc = vi.hoisted(() => ({
    fetchBinInventory: vi.fn(),
    fetchTransportRequests: vi.fn(),
    createTransportRequest: vi.fn(),
    cancelTransportRequest: vi.fn(),
}));
vi.mock('@/services/logistics-dept.service', () => svc);

import { useRunnerWarehouse, groupBinsByZone, WAREHOUSE_ZONE, MY_REQUESTS_DEBOUNCE_MS } from './useRunnerWarehouse';
import type { BinInventory, TransportRequest } from '@/services/logistics-dept.service';

const req = (id: string, requested_by: string, status: TransportRequest['status']): TransportRequest => ({
    id, requested_by, requester_name: requested_by, zone: 'Row 3', bins_count: 1, priority: 'normal', status, created_at: '2026-10-12T09:00:00+13:00',
});
const bin = (bin_code: string, zone: string, status: BinInventory['status']): BinInventory => ({
    id: bin_code, bin_code, zone, status, fill_percentage: status === 'full' ? 100 : 0, last_scan: '',
});

describe('groupBinsByZone', () => {
    it('agrupa por zona, zonas con más llenos primero y dentro los llenos primero', () => {
        const zones = groupBinsByZone([
            bin('A-02', 'A', 'empty'), bin('A-01', 'A', 'full'),
            bin('B-01', 'B', 'full'), bin('B-02', 'B', 'full'), bin('B-03', 'B', 'filling'),
        ]);
        expect(zones.map(z => z.zone)).toEqual(['B', 'A']);
        expect(zones[0]).toMatchObject({ full: 2, empty: 0 });
        expect(zones[0].bins.map(b => b.bin_code)).toEqual(['B-01', 'B-02', 'B-03']);
        expect(zones[1].bins.map(b => b.bin_code)).toEqual(['A-01', 'A-02']);
    });
});

describe('useRunnerWarehouse', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        svc.fetchBinInventory.mockResolvedValue([bin('A-01', 'A', 'full')]);
        svc.fetchTransportRequests.mockResolvedValue([
            req('mine-pending', 'me', 'pending'),
            req('mine-assigned', 'me', 'assigned'),
            req('other', 'someone-else', 'pending'),
        ]);
        svc.createTransportRequest.mockResolvedValue('queue-1');
        svc.cancelTransportRequest.mockResolvedValue('queue-2');
        sendBroadcast.mockResolvedValue(true);
    });

    it('«mis solicitudes» son solo las que pedí yo', async () => {
        const { result } = renderHook(() => useRunnerWarehouse());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(svc.fetchTransportRequests).toHaveBeenCalledWith('o1');
        expect(result.current.myRequests.map(r => r.id)).toEqual(['mine-pending', 'mine-assigned']);
        expect(result.current.zones.map(z => z.zone)).toEqual(['A']);
    });

    it('pedir recogida crea una solicitud real (zona Warehouse, mis datos) y sale al momento en mis solicitudes', async () => {
        const { result } = renderHook(() => useRunnerWarehouse());
        await waitFor(() => expect(result.current.loading).toBe(false));
        let created: TransportRequest | undefined;
        await act(async () => { created = await result.current.requestPickup(7); });
        expect(svc.createTransportRequest).toHaveBeenCalledWith(expect.objectContaining({
            id: created!.id, orchard_id: 'o1', requested_by: 'me', requester_name: 'Rata Runner', zone: WAREHOUSE_ZONE, bins_count: 7, priority: 'high',
        }));
        expect(result.current.myRequests[0]).toMatchObject({ id: created!.id, status: 'pending', bins_count: 7 });
        expect(sendBroadcast).toHaveBeenCalledWith('Pickup needed', expect.stringContaining('7 full bin(s)'), 'high', expect.arrayContaining(['logistics', 'manager']));
    });

    it('sin bins llenos pide al menos 1; si el aviso al chat falla la solicitud sigue creada', async () => {
        sendBroadcast.mockRejectedValue(new Error('offline'));
        const { result } = renderHook(() => useRunnerWarehouse());
        await waitFor(() => expect(result.current.loading).toBe(false));
        await act(async () => { await result.current.requestPickup(0); });
        expect(svc.createTransportRequest).toHaveBeenCalledWith(expect.objectContaining({ bins_count: 1 }));
        expect(result.current.myRequests[0].status).toBe('pending');
    });

    it('cancelar: solo una solicitud mía y pendiente; queda cancelada en pantalla', async () => {
        const { result } = renderHook(() => useRunnerWarehouse());
        await waitFor(() => expect(result.current.loading).toBe(false));

        await act(async () => { await result.current.cancelMine(req('mine-assigned', 'me', 'assigned')); });
        await act(async () => { await result.current.cancelMine(req('other', 'someone-else', 'pending')); });
        expect(svc.cancelTransportRequest).not.toHaveBeenCalled();

        await act(async () => { await result.current.cancelMine(req('mine-pending', 'me', 'pending')); });
        expect(svc.cancelTransportRequest).toHaveBeenCalledWith('mine-pending');
        expect(result.current.myRequests.find(r => r.id === 'mine-pending')?.status).toBe('cancelled');
    });

    it('en vivo: un cambio de una solicitud mía recarga mis solicitudes (agrupado a los 2 s); las de otros no', async () => {
        const { result, unmount } = renderHook(() => useRunnerWarehouse());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(rt.state.filter).toBe('orchard_id=eq.o1');
        const calls = svc.fetchTransportRequests.mock.calls.length;

        vi.useFakeTimers();
        try {
            rt.state.handler!({ new: { requested_by: 'someone-else' }, old: {} });
            await act(async () => { vi.advanceTimersByTime(MY_REQUESTS_DEBOUNCE_MS + 10); });
            expect(svc.fetchTransportRequests.mock.calls.length).toBe(calls);

            svc.fetchTransportRequests.mockResolvedValue([{ ...req('mine-pending', 'me', 'assigned'), assigned_tractor: 't1' }]);
            rt.state.handler!({ new: { requested_by: 'me', status: 'assigned' }, old: {} });
            rt.state.handler!({ new: { requested_by: 'me', status: 'assigned' }, old: {} });
            await act(async () => { vi.advanceTimersByTime(MY_REQUESTS_DEBOUNCE_MS + 10); });
        } finally {
            vi.useRealTimers();
        }
        await waitFor(() => expect(result.current.myRequests[0]?.status).toBe('assigned'));
        expect(svc.fetchTransportRequests.mock.calls.length).toBe(calls + 1);

        unmount();
        expect(rt.state.removed).toBeGreaterThan(0);
    });
});
