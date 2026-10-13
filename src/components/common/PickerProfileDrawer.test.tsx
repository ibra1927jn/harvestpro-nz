/**
 * PickerProfileDrawer — Slide-in profile panel tests
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/test-utils';

const closePickerProfile = vi.hoisted(() => vi.fn());
vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: (selector?: any) => {
        const state = {
            pickerProfileId: 'p1',
            orchard: { id: 'o1' },
            closePickerProfile,
            crew: [
                { id: 'p1', name: 'Alice Picker', role: 'picker', total_buckets_today: 15 },
            ],
            bucketRecords: [],
        };
        return typeof selector === 'function' ? selector(state) : state;
    },
}));

vi.mock('@/services/picker-history.service', () => ({
    pickerHistoryService: {
        getPickerHistory: vi.fn().mockResolvedValue({
            id: 'p1',
            profile: { name: 'Alice Picker', picker_id: 'P01', team_leader_name: 'Carlos', status: 'active' },
            todayBuckets: 15,
            todayHours: 5,
            todayEarnings: 150,
            quality: { score: 95, total: 10, gradeA: 8, gradeB: 2, gradeC: 0, reject: 0 },
            riskBadges: [],
            dailyRecords: [
                { date: '2026-03-01', buckets: 15, hours: 5, earnings: 150 },
                { date: '2026-03-02', buckets: 20, hours: 6, earnings: 200 }
            ],
            teamLeadersWorkedWith: ['Carlos'],
            varietiesPicked: ['Cherry'],
        }),
    },
}));

vi.mock('./picker-profile', () => ({
    Sparkline: () => <div data-testid="sparkline">Sparkline</div>,
    QualityRing: () => <div data-testid="quality-ring">QualityRing</div>,
    RiskBadge: () => <div data-testid="risk-badge">RiskBadge</div>,
    TabButton: ({ label, active, onClick }: any) => (
        <button data-testid={`tab-${label}`} onClick={onClick} className={active ? 'active' : ''}>{label}</button>
    ),
    PickerPanel: () => <div data-testid="picker-panel">PickerPanel</div>,
    HistoryTab: () => <div data-testid="history-tab">HistoryTab</div>,
    QualityTab: () => <div data-testid="quality-tab">QualityTab</div>,
    RunnerPanel: () => <div data-testid="runner-panel">RunnerPanel</div>,
    TeamLeaderPanel: () => <div data-testid="team-leader-panel">TeamLeaderPanel</div>,
}));

import PickerProfileDrawer from './PickerProfileDrawer';

describe('PickerProfileDrawer', () => {
    it('renders drawer when open and picker is found', async () => {
        render(<PickerProfileDrawer />);
        expect(await screen.findByText('Alice Picker')).toBeTruthy();
    });

    it('renders picker role and stats', async () => {
        render(<PickerProfileDrawer />);
        expect(await screen.findByText('ACTIVE')).toBeTruthy();
        // buckets count is rendered inside the mocked PickerPanel child component
        expect(await screen.findByTestId('picker-panel')).toBeTruthy();
    });

    it('renders sub-components', async () => {
        render(<PickerProfileDrawer />);
        // PickerPanel is rendered for the default "today" tab
        expect(await screen.findByTestId('picker-panel')).toBeTruthy();
    });

    it('can switch tabs', async () => {
        render(<PickerProfileDrawer />);
        const historyTab = await screen.findByTestId('tab-History');
        fireEvent.click(historyTab);

        // Tab buttons might update asynchronously, so we find it again
        const updatedHistoryTab = await screen.findByTestId('tab-History');
        expect(updatedHistoryTab.className).toContain('active');
    });

    it('calls close function when backdrop or close button is clicked', async () => {
        render(<PickerProfileDrawer />);
        const closeButton = await screen.findByText('close'); // usually an icon
        fireEvent.click(closeButton);
        expect(closePickerProfile).toHaveBeenCalled();
    });
});
