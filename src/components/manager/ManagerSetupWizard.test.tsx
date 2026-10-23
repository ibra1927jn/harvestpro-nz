import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const updateHarvestSettings = vi.fn();
const setForDay = vi.fn();
const setBlockVariety = vi.fn();
vi.mock('@/services/settings.service', () => ({
    settingsService: { updateHarvestSettings: (...a: unknown[]) => updateHarvestSettings(...a) },
}));
vi.mock('@/repositories/piece-rates.repository', () => ({
    pieceRatesRepository: { setForDay: (...a: unknown[]) => setForDay(...a) },
}));
vi.mock('@/repositories/orchard-map.repository', () => ({
    orchardMapRepository: { setBlockVariety: (...a: unknown[]) => setBlockVariety(...a) },
}));

import ManagerSetupWizard from './ManagerSetupWizard';
import { useHarvestStore } from '@/stores/useHarvestStore';
import type { OrchardBlock } from '@/types';

const block = (id: string, name: string, v: string): OrchardBlock => ({
    id, name, totalRows: 2, startRow: 1, colorCode: '#000', status: 'idle' as OrchardBlock['status'],
    rowVarieties: { 1: v, 2: v },
});

beforeEach(() => {
    updateHarvestSettings.mockReset().mockResolvedValue({ ok: true });
    setForDay.mockReset().mockResolvedValue(undefined);
    setBlockVariety.mockReset().mockResolvedValue(2);
    act(() => useHarvestStore.setState({
        orchard: { id: 'o1', name: 'Hastings' },
        orchardBlocks: [block('b1', 'Block A', 'Braeburn'), block('b2', 'Block B', 'Unknown')],
        settings: { ...useHarvestStore.getState().settings, target_tons: 40, piece_rate: 0 },
    }));
});

describe('ManagerSetupWizard', () => {
    it('saves target, today\'s price and the changed block varieties for the manager\'s orchard', async () => {
        const onComplete = vi.fn();
        render(<ManagerSetupWizard onComplete={onComplete} onCancel={vi.fn()} />);
        fireEvent.change(screen.getByLabelText(/Daily target/), { target: { value: '55' } });
        fireEvent.change(screen.getByLabelText(/Today's price per bucket/), { target: { value: '7.5' } });
        fireEvent.change(screen.getByLabelText('Variety of Block B'), { target: { value: 'Royal Gala' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save and start' }));
        await waitFor(() => expect(onComplete).toHaveBeenCalled());
        expect(updateHarvestSettings).toHaveBeenCalledWith('o1', { target_tons: 55 });
        expect(setForDay).toHaveBeenCalledWith('o1', null, 7.5);
        expect(setBlockVariety).toHaveBeenCalledTimes(1);
        expect(setBlockVariety).toHaveBeenCalledWith('b2', 'Royal Gala');
        expect(useHarvestStore.getState().settings.target_tons).toBe(55);
    });

    it('asks for today\'s price before saving', async () => {
        render(<ManagerSetupWizard onComplete={vi.fn()} onCancel={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Save and start' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/price per bucket/);
        expect(updateHarvestSettings).not.toHaveBeenCalled();
    });

    it('shows the database reason and stays open when saving fails', async () => {
        updateHarvestSettings.mockResolvedValue({ ok: false, reason: 'Settings not saved. Please try again.' });
        const onComplete = vi.fn();
        render(<ManagerSetupWizard onComplete={onComplete} onCancel={vi.fn()} />);
        fireEvent.change(screen.getByLabelText(/Today's price per bucket/), { target: { value: '7' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save and start' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Settings not saved');
        expect(onComplete).not.toHaveBeenCalled();
    });

    it('without blocks links to the orchard setup screen', () => {
        act(() => useHarvestStore.setState({ orchardBlocks: [] }));
        const onOpenStructure = vi.fn();
        render(<ManagerSetupWizard onComplete={vi.fn()} onCancel={vi.fn()} onOpenStructure={onOpenStructure} />);
        expect(screen.getByTestId('msetup-no-blocks')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('msetup-open-structure'));
        expect(onOpenStructure).toHaveBeenCalled();
    });
});
