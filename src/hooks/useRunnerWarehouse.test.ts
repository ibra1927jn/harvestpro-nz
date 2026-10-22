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

const svc = vi.hoisted(() => ({
    fetchBinInventory: vi.fn(),
    fetchTransportRequests: vi.fn(),
    createTransportRequest: vi.fn(),
    cancelTransportRequest: vi.fn(),
}));
vi.mock('@/services/logistics-dept.service', () => svc);

import { useRunnerWarehouse, groupBinsByZone, WAREHOUSE_ZONE } from './useRunnerWarehouse';
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
});
