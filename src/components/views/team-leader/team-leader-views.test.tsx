/**
 * Tests for team-leader views: HomeView
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock the store — HomeView uses useHarvestStore() returning full object
vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: () => ({
        currentUser: { id: 'tl1', name: 'Maria Garcia', role: 'team_leader' },
        stats: { totalBuckets: 35, payEstimate: 105, tons: 2.8 },
        crew: [
            // Equipo de tl1, fichados hoy
            { id: 'p1', name: 'Picker A', total_buckets_today: 15, status: 'active', role: 'picker', orchard_id: 'o1', current_row: 2, qcStatus: [1, 1, 1], team_leader_id: 'tl1', check_in: '2026-10-12T07:00:00+13:00' },
            { id: 'p2', name: 'Picker B', total_buckets_today: 20, status: 'active', role: 'picker', orchard_id: 'o1', current_row: 5, qcStatus: [1, 0, 1], team_leader_id: 'tl1', check_in: '2026-10-12T07:00:00+13:00' },
            // De otro team leader: no sale en "mi equipo"
            { id: 'p9', name: 'Other Team', total_buckets_today: 40, status: 'active', role: 'picker', orchard_id: 'o1', current_row: 7, qcStatus: [], team_leader_id: 'tl2', check_in: '2026-10-12T07:00:00+13:00' },
        ],
        settings: { min_buckets_per_hour: 3.6 },
        bins: [],
        runners: [],
        orchardId: 'orchard1',
        daySettings: { piece_rate_per_bucket: 3.0 },
    }),
}));

vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ appUser: { id: 'tl1', full_name: 'Maria Garcia', role: 'team_leader' } }),
}));

import HomeView from './HomeView';

describe('HomeView (TeamLeader)', () => {
    it('renders greeting with user name', () => {
        render(<HomeView />);
        expect(screen.getByText(/Kia Ora, Maria/i)).toBeTruthy();
    });

    it('renders KPI labels', () => {
        render(<HomeView />);
        // 'Buckets' appears multiple times (KPI + crew cards)
        const bucketsElements = screen.getAllByText('Buckets');
        expect(bucketsElements.length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Pay Est.')).toBeTruthy();
        expect(screen.getByText('Tons')).toBeTruthy();
    });

    it('renders the team buckets (only my team: 15 + 20)', () => {
        render(<HomeView />);
        expect(screen.getAllByText('35').length).toBeGreaterThanOrEqual(1);
        expect(screen.queryByText('Other Team')).toBeNull();
    });

    it('renders Morning Huddle when all safe', () => {
        render(<HomeView />);
        expect(screen.getByText('Morning Huddle')).toBeTruthy();
    });

    it('renders Crew Performance section', () => {
        render(<HomeView />);
        expect(screen.getByText('Crew Performance')).toBeTruthy();
    });

    it('renders Active Crew count', () => {
        render(<HomeView />);
        expect(screen.getByText(/Active Crew \(2\)/)).toBeTruthy();
    });

    it('renders picker names in crew list', () => {
        render(<HomeView />);
        expect(screen.getByText('Picker A')).toBeTruthy();
        expect(screen.getByText('Picker B')).toBeTruthy();
    });
});
