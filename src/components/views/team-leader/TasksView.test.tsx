/**
 * TasksView (pestaña Mapa del team leader, #8):
 * mapa táctico con mi equipo resaltado y «Filas activas» solo de mi equipo.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { mapProps, modalProps, mockAssignRow, auth, crew, rowAssignments } = vi.hoisted(() => ({
    mapProps: { last: null as Record<string, unknown> | null },
    modalProps: { last: null as Record<string, unknown> | null },
    mockAssignRow: vi.fn(),
    auth: { userId: 'tl1' },
    crew: [
        { id: 'tl1', name: 'Maria', role: 'team_leader', status: 'active', picker_id: 'TL-1', current_row: 0 },
        { id: 'tl2', name: 'Hemi', role: 'team_leader', status: 'active', picker_id: 'TL-2', current_row: 0 },
        { id: 'p1', name: 'Ana', role: 'picker', status: 'active', picker_id: 'P-1', team_leader_id: 'tl1', current_row: 3 },
        { id: 'p2', name: 'Bea', role: 'picker', status: 'active', picker_id: 'P-2', team_leader_id: 'tl1', current_row: 3 },
        { id: 'p3', name: 'Carl', role: 'picker', status: 'active', picker_id: 'P-3', team_leader_id: 'tl2', current_row: 7 },
    ],
    rowAssignments: [
        { id: 'a1', row_number: 3, side: 'north', assigned_pickers: ['p1', 'p2'], completion_percentage: 0, team_leader_id: 'tl1' },
        { id: 'a2', row_number: 7, side: 'south', assigned_pickers: ['p3'], completion_percentage: 0, team_leader_id: 'tl2' },
    ],
}));

vi.mock('@/stores/useHarvestStore', () => {
    const state = {
        crew,
        rowAssignments,
        bucketRecords: [],
        settings: { min_buckets_per_hour: 4 },
        orchard: { id: 'o1', name: 'Sunrise' },
        assignRow: mockAssignRow,
    };
    return {
        useHarvestStore: (selector?: (st: typeof state) => unknown) => (selector ? selector(state) : state),
    };
});

vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ appUser: { id: auth.userId, full_name: 'Maria', role: 'team_leader', orchard_id: 'o1' } }),
}));

vi.mock('../../../context/MessagingContext', () => ({
    useMessaging: () => ({ broadcasts: [] }),
}));

vi.mock('@/components/common/row-history/RowHistory', () => ({
    default: ({ teamLeaderId, title }: { teamLeaderId?: string; title: string }) => (
        <div data-testid="row-history" data-team-leader={teamLeaderId}>{title}</div>
    ),
}));

vi.mock('../manager/OrchardMapView', () => ({
    default: (props: Record<string, unknown>) => {
        mapProps.last = props;
        return (
            <div data-testid="orchard-map">
                <button onClick={() => (props.onRowClick as (n: number) => void)?.(5)}>row-5</button>
            </div>
        );
    },
}));

vi.mock('../../modals/RowAssignmentModal', () => ({
    default: (props: Record<string, unknown>) => {
        modalProps.last = props;
        return <div data-testid="assign-modal" />;
    },
}));

import TasksView from './TasksView';

describe('TasksView (team leader map)', () => {
    beforeEach(() => {
        mapProps.last = null;
        modalProps.last = null;
        auth.userId = 'tl1';
    });

    it('renders the tactical map with my team highlighted (no heat map, no target widget)', () => {
        render(<TasksView />);
        expect(screen.getByTestId('orchard-map')).toBeTruthy();
        expect(mapProps.last?.highlightTeamLeaderId).toBe('tl1');
        expect(mapProps.last?.crew).toBe(crew);
        expect(screen.queryByText('Min. Target')).toBeNull();
        expect(screen.queryByText(/bkts\/hr/)).toBeNull();
    });

    it('keeps "My team\'s rows" (RowHistory of my team) below the map', () => {
        render(<TasksView />);
        const history = screen.getByTestId('row-history');
        expect(history.getAttribute('data-team-leader')).toBe('tl1');
        expect(history.textContent).toBe("My team's rows");
    });

    it("lists only my team's active rows (other teams are only on the map)", () => {
        render(<TasksView />);
        expect(screen.getByText('Active Rows')).toBeTruthy();
        // Fila 3 (mi equipo, 2 pickers) sí; fila 7 (equipo de Hemi) no
        expect(screen.getByText('3')).toBeTruthy();
        expect(screen.getByText('2 Pickers')).toBeTruthy();
        expect(screen.queryByText('7')).toBeNull();
        expect(screen.queryByText('1 Pickers')).toBeNull();
    });

    it('shows the empty state when my team has no rows, even if other teams do', () => {
        auth.userId = 'tl3';
        render(<TasksView />);
        expect(screen.getByText('No rows assigned.')).toBeTruthy();
        expect(screen.queryByText('2 Pickers')).toBeNull();
    });

    it('offers only my team in the assignment modal, preselecting the row tapped on the map', () => {
        render(<TasksView />);
        fireEvent.click(screen.getByText('row-5'));
        expect(screen.getByTestId('assign-modal')).toBeTruthy();
        const pickers = modalProps.last?.pickers as { id: string }[];
        expect(pickers.map(p => p.id).sort()).toEqual(['p1', 'p2']);
        expect(modalProps.last?.initialRow).toBe(5);
    });

    it('the Assign button opens the modal without a preselected row', () => {
        render(<TasksView />);
        fireEvent.click(screen.getByRole('button', { name: /Assign/ }));
        expect(modalProps.last?.initialRow).toBeUndefined();
    });
});
