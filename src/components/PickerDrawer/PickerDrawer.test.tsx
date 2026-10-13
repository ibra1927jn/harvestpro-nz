/**
 * PickerDrawer — qué se muestra según el estado de los datos y el rol de la persona.
 * Los paneles hijos tienen sus propios tests: aquí se sustituyen por marcas.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PickerDrawerData } from './usePickerDrawerData';
import type { PickerHistory } from '@/services/picker-history.service';
import type { Picker } from '@/types';

const h = vi.hoisted(() => ({
    data: null as unknown as PickerDrawerData,
    store: { pickerProfileId: 'p1' as string | null, closePickerProfile: vi.fn(), crew: [] as unknown[] },
}));

vi.mock('./usePickerDrawerData', () => ({ usePickerDrawerData: () => h.data }));
vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: (selector: (s: typeof h.store) => unknown) => selector(h.store),
}));
vi.mock('@/i18n', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/hooks/useDialogA11y', () => ({ useDialogA11y: () => undefined }));
vi.mock('./PickerDrawerToday', () => ({ default: () => <div>TODAY_PANEL</div> }));
vi.mock('./PickerDrawerHistory', () => ({ default: () => <div>HISTORY_PANEL</div> }));
vi.mock('../common/picker-profile', () => ({
    QualityRing: ({ score }: { score: number }) => <div>RING {score}</div>,
    RiskBadge: ({ badge }: { badge: { type: string } }) => <div>RISK {badge.type}</div>,
    TabButton: ({ label, onClick }: { label: string; onClick: () => void }) => <button onClick={onClick}>{label}</button>,
    RunnerPanel: () => <div>RUNNER_PANEL</div>,
    TeamLeaderPanel: () => <div>TL_PANEL</div>,
    QualityTab: () => <div>QUALITY_PANEL</div>,
}));

import PickerDrawer from './PickerDrawer';

const TODAY_EMPTY = { bins: 0, hoursWorked: 0, earned: 0, pieceRateEarnings: 0, topUp: 0, costPerBin: 0, empty: true };
const picker = { id: 'p1', picker_id: 'LOC-7', name: 'Ana', status: 'on_break' } as unknown as Picker;
const history = {
    profile: { name: 'Ana H', picker_id: 'LOC-7H', status: 'active' },
    quality: { total: 4, gradeA: 4, gradeB: 0, gradeC: 0, reject: 0, score: 100 },
    riskBadges: [{ type: 'fatigue', severity: 'warning', label: 'x', detail: 'y' }],
} as unknown as PickerHistory;

function setData(over: Partial<PickerDrawerData>): void {
    h.data = {
        picker: undefined, today: TODAY_EMPTY, history: null, isHistoryLoading: false,
        role: 'picker', minWage: 23.95, pieceRate: 6.5, ...over,
    };
}

beforeEach(() => {
    h.store.pickerProfileId = 'p1';
    h.store.closePickerProfile.mockReset();
    setData({});
});

describe('PickerDrawer', () => {
    it('renders nothing when no person is selected', () => {
        h.store.pickerProfileId = null;
        const { container } = render(<PickerDrawer />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows loading while history loads and the person is not in the crew', () => {
        setData({ isHistoryLoading: true });
        render(<PickerDrawer />);
        expect(screen.getByText('panel.loading')).toBeInTheDocument();
    });

    it('shows "not found" when there is no crew entry, no history and nothing today', () => {
        render(<PickerDrawer />);
        expect(screen.getByText('panel.not_found')).toBeInTheDocument();
    });

    it('with scans today but no profile it shows the profile (not "not found"), using the id', () => {
        setData({ today: { ...TODAY_EMPTY, bins: 3, empty: false } });
        render(<PickerDrawer />);
        expect(screen.queryByText('panel.not_found')).toBeNull();
        expect(screen.getByRole('heading', { name: 'Unknown' })).toBeInTheDocument();
        expect(screen.getByText('ID: p1')).toBeInTheDocument();
    });

    it('picker: crew data wins over history, status label, ring, risk badges and three tabs', () => {
        setData({ picker, history });
        render(<PickerDrawer />);
        expect(screen.getByRole('heading', { name: 'Ana' })).toBeInTheDocument();
        expect(screen.getByText('ID: LOC-7')).toBeInTheDocument();
        expect(screen.getByText('PANEL.STATUS.BREAK')).toBeInTheDocument();
        expect(screen.getByText('panel.role.picker')).toBeInTheDocument();
        expect(screen.getByText('RING 100')).toBeInTheDocument();
        expect(screen.getByText('RISK fatigue')).toBeInTheDocument();
        expect(screen.getByText('TODAY_PANEL')).toBeInTheDocument();

        fireEvent.click(screen.getByText('panel.tabs.history'));
        expect(screen.getByText('HISTORY_PANEL')).toBeInTheDocument();
        expect(screen.queryByText('TODAY_PANEL')).toBeNull();

        fireEvent.click(screen.getByText('panel.tabs.quality'));
        expect(screen.getByText('QUALITY_PANEL')).toBeInTheDocument();
    });

    it('picker without history: falls back to history-less values and quality says no data', () => {
        setData({ picker: { ...picker, status: undefined } as unknown as Picker, today: { ...TODAY_EMPTY, empty: false } });
        render(<PickerDrawer />);
        expect(screen.getByText('PANEL.STATUS.ACTIVE')).toBeInTheDocument();
        expect(screen.queryByText(/^RING/)).toBeNull();
        fireEvent.click(screen.getByText('panel.tabs.quality'));
        expect(screen.getByText('panel.no_data')).toBeInTheDocument();
    });

    it('the chosen tab stays when another person is opened', () => {
        setData({ picker, history });
        const { rerender } = render(<PickerDrawer />);
        fireEvent.click(screen.getByText('panel.tabs.history'));
        h.store.pickerProfileId = 'p2';
        setData({ picker: { ...picker, id: 'p2', name: 'Bea' } as unknown as Picker, history });
        rerender(<PickerDrawer />);
        expect(screen.getByRole('heading', { name: 'Bea' })).toBeInTheDocument();
        expect(screen.getByText('HISTORY_PANEL')).toBeInTheDocument();
    });

    it('team leader: own panel, no tabs, no ring or risk badges', () => {
        setData({ picker, history, role: 'team_leader' });
        render(<PickerDrawer />);
        expect(screen.getByText('TL_PANEL')).toBeInTheDocument();
        expect(screen.getByText('panel.role.team_leader')).toBeInTheDocument();
        expect(screen.queryByText('panel.tabs.today')).toBeNull();
        expect(screen.queryByText(/^RING/)).toBeNull();
        expect(screen.queryByText(/^RISK/)).toBeNull();
    });

    it('runner: own panel, no tabs', () => {
        setData({ picker, role: 'runner' });
        render(<PickerDrawer />);
        expect(screen.getByText('RUNNER_PANEL')).toBeInTheDocument();
        expect(screen.queryByText('panel.tabs.today')).toBeNull();
    });

    it('the close button and the backdrop close the drawer', () => {
        setData({ picker });
        const { container } = render(<PickerDrawer />);
        fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
        fireEvent.click(container.querySelector('.backdrop-blur-sm') as Element);
        expect(h.store.closePickerProfile).toHaveBeenCalledTimes(2);
    });
});
