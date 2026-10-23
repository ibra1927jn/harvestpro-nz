/**
 * Flota y bins de Logística (B6, auditoría 2026-10-23): lo que se edita se guarda.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FleetTab from './FleetTab';
import BinsTab from './BinsTab';
import RequestsTab from './RequestsTab';
import { vehiclesForTransport } from './logisticsLogic';
import type { Tractor, BinInventory } from '@/services/logistics-dept.service';

const assignVehicleToRequest = vi.fn();
const cancelTransportRequest = vi.fn();
vi.mock('@/services/logistics-dept.service', async (orig) => ({
    ...(await orig<typeof import('@/services/logistics-dept.service')>()),
    assignVehicleToRequest: (...a: unknown[]) => assignVehicleToRequest(...a),
    cancelTransportRequest: (...a: unknown[]) => cancelTransportRequest(...a),
    completeTransportRequest: vi.fn(),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ appUser: { id: 'u1' } }) }));

const tractor = (over: Partial<Tractor>): Tractor => ({
    id: 't1', name: 'Tractor Alpha', type: 'tractor', zone: 'A1', driver_name: 'No driver', status: 'idle',
    load_status: 'empty', bins_loaded: 0, max_capacity: 8, last_update: '2026-10-23T10:00:00+13:00', ...over,
});
const bin = (over: Partial<BinInventory>): BinInventory => ({
    id: 'b1', bin_code: 'BIN-7', status: 'full', zone: 'A1', fill_percentage: 100, last_scan: '2026-10-23T10:00:00+13:00',
    db_status: 'full', ...over,
});
const summary = { fullBins: 1, emptyBins: 0, activeTractors: 0, pendingRequests: 0, binsInTransit: 0 };

beforeEach(() => { assignVehicleToRequest.mockReset(); });

describe('FleetTab saves what is edited', () => {
    it('edits (plate, next service…) go to the database and it says so', async () => {
        const onUpdate = vi.fn().mockResolvedValue(undefined);
        render(<FleetTab tractors={[tractor({})]} onUpdateTractor={onUpdate} />);
        fireEvent.click(screen.getByRole('button', { name: 'Edit Tractor Alpha' }));
        fireEvent.change(screen.getByLabelText('Next service'), { target: { value: '2026-11-30' } });
        fireEvent.change(screen.getByLabelText('Plate'), { target: { value: 'abc123' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('t1', expect.objectContaining({
            next_service_date: '2026-11-30', registration: 'ABC123', type: 'tractor', max_capacity: 8,
        })));
        expect(await screen.findByRole('status')).toHaveTextContent('Vehicle saved');
    });

    it('a refused save is shown, not swallowed', async () => {
        const onUpdate = vi.fn().mockRejectedValue(new Error('Vehicle not saved (no permission or not found)'));
        render(<FleetTab tractors={[tractor({})]} onUpdateTractor={onUpdate} />);
        fireEvent.click(screen.getByRole('button', { name: 'Edit Tractor Alpha' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('no permission');
    });

    it('adds a vehicle with name, plate, type, zone and capacity', async () => {
        const onAdd = vi.fn().mockResolvedValue(undefined);
        render(<FleetTab tractors={[]} onUpdateTractor={vi.fn()} onAddVehicle={onAdd} />);
        fireEvent.click(screen.getByRole('button', { name: 'Add vehicle' }));
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Hilux' } });
        fireEvent.change(screen.getByLabelText('Plate'), { target: { value: 'xyz9' } });
        fireEvent.change(screen.getByLabelText('Vehicle type'), { target: { value: 'ute' } });
        fireEvent.change(screen.getByLabelText('Zone'), { target: { value: 'B2' } });
        fireEvent.change(screen.getByLabelText('Capacity (bins)'), { target: { value: '4' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save vehicle' }));
        await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ name: 'Hilux', registration: 'XYZ9', type: 'ute', zone: 'B2', max_capacity: 4 }));
    });

    it('retiring asks first', async () => {
        const onRetire = vi.fn().mockResolvedValue(undefined);
        const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
        render(<FleetTab tractors={[tractor({})]} onUpdateTractor={vi.fn()} onRetireVehicle={onRetire} />);
        fireEvent.click(screen.getByRole('button', { name: 'Retire Tractor Alpha from the fleet' }));
        expect(onRetire).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Retire Tractor Alpha from the fleet' }));
        await waitFor(() => expect(onRetire).toHaveBeenCalledWith('t1'));
        confirm.mockRestore();
    });

    it('read-only (manager overview without handlers) has no edit buttons', () => {
        render(<FleetTab tractors={[tractor({})]} readOnly />);
        expect(screen.queryByRole('button', { name: 'Edit Tractor Alpha' })).toBeNull();
    });
});

describe('BinsTab: logistics changes bins', () => {
    it('sets a bin collected', async () => {
        const onSet = vi.fn().mockResolvedValue(undefined);
        render(<BinsTab bins={[bin({})]} summary={summary} onSetStatus={onSet} />);
        fireEvent.change(screen.getByLabelText('Status of bin BIN-7'), { target: { value: 'collected' } });
        await waitFor(() => expect(onSet).toHaveBeenCalledWith('b1', 'collected'));
        expect(await screen.findByRole('status')).toHaveTextContent('BIN-7');
    });

    it('adds and retires bins', async () => {
        const onAdd = vi.fn().mockResolvedValue(undefined);
        const onRetire = vi.fn().mockResolvedValue(undefined);
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<BinsTab bins={[bin({})]} summary={summary} onSetStatus={vi.fn()} onAddBin={onAdd} onRetireBin={onRetire} />);
        fireEvent.change(screen.getByLabelText('Bin code'), { target: { value: ' BIN-8 ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add bin' }));
        await waitFor(() => expect(onAdd).toHaveBeenCalledWith('BIN-8', ''));
        fireEvent.click(screen.getByRole('button', { name: 'Retire bin BIN-7' }));
        await waitFor(() => expect(onRetire).toHaveBeenCalledWith('b1'));
        confirm.mockRestore();
    });

    it('without handlers it stays read-only', () => {
        render(<BinsTab bins={[bin({})]} summary={summary} />);
        expect(screen.queryByLabelText('Status of bin BIN-7')).toBeNull();
    });
});

describe('Assigning a vehicle to a transport request', () => {
    const fleet = [
        tractor({ id: 'f1', name: 'Fork 1', type: 'forklift' }),
        tractor({ id: 't2', name: 'Truck 2', type: 'truck', status: 'active', bins_loaded: 3 }),
        tractor({ id: 't3', name: 'Tractor 3', status: 'maintenance' }),
    ];

    it('offers no forklifts by default, lets you filter by type', () => {
        expect(vehiclesForTransport(fleet, 'not_forklift').map(v => v.id)).toEqual(['t2']);
        expect(vehiclesForTransport(fleet, 'forklift').map(v => v.id)).toEqual(['f1']);
        expect(vehiclesForTransport(fleet, 'all').map(v => v.id)).toEqual(['f1', 't2']);
    });

    it('the request card lists only matching vehicles with their load', () => {
        render(<RequestsTab requests={[{
            id: 'r1', requested_by: 'u2', requester_name: 'Ana', zone: 'A1', bins_count: 2, priority: 'normal',
            status: 'pending', created_at: '2026-10-23T09:00:00+13:00',
        }]} tractors={fleet} />);
        fireEvent.click(screen.getByRole('button', { name: /Assign Vehicle/ }));
        const vehicleSelect = screen.getByLabelText('Select vehicle') as HTMLSelectElement;
        const names = [...vehicleSelect.options].map(o => o.textContent ?? '');
        expect(names.some(n => n.includes('Truck 2') && n.includes('3/8'))).toBe(true);
        expect(names.some(n => n.includes('Fork 1'))).toBe(false);
        fireEvent.change(screen.getByLabelText('Vehicle type'), { target: { value: 'forklift' } });
        expect([...(screen.getByLabelText('Select vehicle') as HTMLSelectElement).options].some(o => o.textContent?.includes('Fork 1'))).toBe(true);
    });
});

describe('Cancel request asks first', () => {
    it('only cancels after confirming', () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
        render(<RequestsTab requests={[{
            id: 'r1', requested_by: 'u2', requester_name: 'Ana', zone: 'A1', bins_count: 2, priority: 'normal',
            status: 'pending', created_at: '2026-10-23T09:00:00+13:00', updated_at: 'v1',
        }]} tractors={[]} />);
        fireEvent.click(screen.getByTitle('Cancel request'));
        expect(cancelTransportRequest).not.toHaveBeenCalled();
        fireEvent.click(screen.getByTitle('Cancel request'));
        expect(cancelTransportRequest).toHaveBeenCalledWith('r1', 'v1');
        confirm.mockRestore();
    });
});
