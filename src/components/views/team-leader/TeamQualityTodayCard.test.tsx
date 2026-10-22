import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const auth = vi.hoisted(() => ({ user: { id: 'tl1', role: 'team_leader' } }));
vi.mock('@/services/supabase', () => ({
    supabase: { auth: { getSession: vi.fn() }, from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn(), getChannels: vi.fn(() => []) },
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ appUser: auth.user }) }));

import { TeamQualityTodayCard } from './TeamQualityTodayCard';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { __resetQcTodayCache } from '@/hooks/useQcAlerts';

const now = new Date().toISOString();

describe('TeamQualityTodayCard', () => {
    beforeEach(() => {
        __resetQcTodayCache();
        useHarvestStore.setState({
            orchard: null,
            pickerProfileId: null,
            crew: [
                { id: 'p1', name: 'Aroha Walker', team_leader_id: 'tl1' },
                { id: 'p2', name: 'Rua Hall', team_leader_id: 'tl2' },
            ] as never,
            recentQcInspections: [
                { id: 'q1', picker_id: 'p1', grade: 'C', criteria: { size: 'bad', ladder: 'ok' }, informed: false, created_at: now },
                { id: 'q2', picker_id: 'p2', grade: 'reject', criteria: null, created_at: now },
            ],
        });
    });

    it('lists only my team inspections with grade, worst criterion and wellbeing flag', () => {
        render(<TeamQualityTodayCard />);
        const card = screen.getByTestId('tl-quality-today');
        expect(card.textContent).toContain('Aroha Walker');
        expect(card.textContent).not.toContain('Rua Hall');
        expect(card.textContent).toContain('Bad: Size');
        expect(card.textContent).toContain('1 checks · 1 flagged');
        expect(screen.getAllByText('Wellbeing').length).toBeGreaterThan(0);
        fireEvent.click(screen.getByRole('button', { name: /Aroha Walker/ }));
        expect(useHarvestStore.getState().pickerProfileId).toBe('p1');
    });

    it('shows the empty state', () => {
        useHarvestStore.setState({ recentQcInspections: [] });
        render(<TeamQualityTodayCard />);
        expect(screen.getByText(/No quality checks for your team/)).toBeTruthy();
    });
});
