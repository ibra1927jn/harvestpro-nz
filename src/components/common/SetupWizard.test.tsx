/**
 * SetupWizard — asistente de huerto nuevo: recorre los 4 pasos y crea todo con
 * una sola llamada a setup_orchard_atomic (temporada, bloques y filas incluidos)
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { rpcCall } = vi.hoisted(() => ({ rpcCall: vi.fn() }));
vi.mock('@/repositories/rpc.repository', () => ({ rpcRepository: { call: rpcCall } }));

import SetupWizard from './SetupWizard';

describe('SetupWizard', () => {
    beforeEach(() => rpcCall.mockReset());

    it('renders the heading and closes', () => {
        const onCancel = vi.fn();
        render(<SetupWizard onComplete={vi.fn()} onCancel={onCancel} />);
        expect(screen.getByText('New Orchard Setup')).toBeTruthy();
        fireEvent.click(screen.getByLabelText('Close wizard'));
        expect(onCancel).toHaveBeenCalled();
    });

    it('creates orchard, season, blocks and rows in one call', async () => {
        rpcCall.mockResolvedValue({ data: { id: 'o-9', code: 'NEW-1', name: 'New', season_id: 's-1', blocks: 1, rows: 15 }, error: null });
        const onComplete = vi.fn();
        render(<SetupWizard onComplete={onComplete} onCancel={vi.fn()} />);
        const next = () => fireEvent.click(screen.getByText('Next'));

        fireEvent.change(screen.getByLabelText('Orchard Code *'), { target: { value: 'new-1' } });
        fireEvent.change(screen.getByLabelText('Orchard Name *'), { target: { value: 'New' } });
        next();
        fireEvent.change(screen.getAllByLabelText('To row')[0], { target: { value: '15' } });
        fireEvent.change(screen.getAllByLabelText('Variety')[0], { target: { value: 'Royal Gala' } });
        next();
        next();
        fireEvent.click(screen.getByTestId('wizard-create'));

        await waitFor(() => expect(onComplete).toHaveBeenCalledWith('o-9'));
        const [fn, params] = rpcCall.mock.calls[0];
        expect(fn).toBe('setup_orchard_atomic');
        expect(params).toMatchObject({
            p_code: 'NEW-1',
            p_name: 'New',
            p_total_rows: 15,
            p_blocks: [{ name: 'Block A', row_from: 1, row_to: 15, variety: 'Royal Gala', target_buckets: 100 }],
        });
        expect(typeof params.p_season_name).toBe('string');
        expect(params.p_min_wage).toBeGreaterThanOrEqual(23.95);
    });

    it('cannot leave the blocks step with overlapping rows, and shows DB errors clearly', async () => {
        rpcCall.mockResolvedValue({ data: null, error: { code: '23505', message: 'Row 3 is already in block Block A' } });
        render(<SetupWizard onComplete={vi.fn()} onCancel={vi.fn()} />);
        fireEvent.change(screen.getByLabelText('Orchard Code *'), { target: { value: 'X' } });
        fireEvent.change(screen.getByLabelText('Orchard Name *'), { target: { value: 'X' } });
        fireEvent.click(screen.getByText('Next'));
        fireEvent.change(screen.getAllByLabelText('From row')[0], { target: { value: '' } });
        expect((screen.getByText('Next').closest('button') as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(screen.getAllByLabelText('From row')[0], { target: { value: '1' } });
        fireEvent.click(screen.getByText('Next'));
        fireEvent.click(screen.getByText('Next'));
        fireEvent.click(screen.getByTestId('wizard-create'));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Row 3 is already in block Block A/));
    });
});
