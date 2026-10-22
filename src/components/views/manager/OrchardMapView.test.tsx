/**
 * OrchardMapView — realce de equipos por fila (vista del team leader, #8).
 * useOrchardMap se mockea con un bloque ya seleccionado (nivel 2: filas).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Picker } from '@/types';

const crew = [
    { id: 'tl1', name: 'Maria', role: 'team_leader', status: 'active', current_row: 0 },
    { id: 'tl2', name: 'Hemi', role: 'team_leader', status: 'active', current_row: 0 },
    { id: 'p1', name: 'Ana', role: 'picker', status: 'active', team_leader_id: 'tl1', current_row: 1 },
    { id: 'p3', name: 'Carl', role: 'picker', status: 'active', team_leader_id: 'tl2', current_row: 2 },
] as unknown as Picker[];
const byId = (id: string) => crew.find(p => p.id === id)!;

const rowAssignments = [
    { id: 'a1', row_number: 1, side: 'north', assigned_pickers: ['p1'], completion_percentage: 0, team_leader_id: 'tl1' },
    { id: 'a2', row_number: 2, side: 'north', assigned_pickers: ['p3'], completion_percentage: 0, team_leader_id: 'tl2' },
];

const row = (rowNum: number, pickers: Picker[]) => ({
    rowNum, buckets: 0, pickers, variety: 'Lapin', progress: 0, binsPerHour: null, rowTarget: 50,
});

vi.mock('@/hooks/useOrchardMap', () => ({
    useOrchardMap: () => ({
        orchardBlocks: [{ id: 'b1', name: 'Block A', startRow: 1, totalRows: 3, rowVarieties: { 1: 'Lapin', 2: 'Lapin', 3: 'Lapin' } }],
        selectedBlock: { id: 'b1', name: 'Block A', startRow: 1, totalRows: 3, rowVarieties: { 1: 'Lapin', 2: 'Lapin', 3: 'Lapin' } },
        selectedBlockId: 'b1',
        selectedVariety: 'ALL',
        setSelectedBlock: vi.fn(),
        setSelectedVariety: vi.fn(),
        orchardName: 'Sunrise',
        rowAssignments,
        blockStats: { b1: { buckets: 0, activePickers: 2, completedRows: 0, progress: 0 } },
        blockVarietySummaries: { b1: ['Lapin'] },
        blockVarieties: ['Lapin'],
        rowData: [row(1, [byId('p1')]), row(2, [byId('p3')]), row(3, [])],
        pickersByRow: { 1: [byId('p1')], 2: [byId('p3')] },
        totalActivePickers: 2,
        totalBuckets: 0,
        totalRows: 3,
    }),
}));

import OrchardMapView from './OrchardMapView';

const rowButton = (n: number) => screen.getByText(`R${n}`).closest('button')!;

describe('OrchardMapView — team highlight', () => {
    it('without highlightTeamLeaderId (manager) no row is marked and there is no legend', () => {
        render(<OrchardMapView crew={crew} bucketRecords={[]} />);
        expect(rowButton(1).getAttribute('data-team')).toBeNull();
        expect(rowButton(2).getAttribute('data-team')).toBeNull();
        expect(screen.queryByTestId('team-legend')).toBeNull();
        expect(screen.queryByText('My team')).toBeNull();
    });

    it("with highlightTeamLeaderId marks my team's rows, greys the other teams' rows and shows the legend", () => {
        render(<OrchardMapView crew={crew} bucketRecords={[]} highlightTeamLeaderId="tl1" />);
        expect(rowButton(1).getAttribute('data-team')).toBe('mine');
        expect(rowButton(2).getAttribute('data-team')).toBe('other');
        expect(rowButton(3).getAttribute('data-team')).toBeNull();
        expect(screen.getByText('My team')).toBeTruthy();
        expect(screen.getByText('Team of Hemi')).toBeTruthy();
        expect(screen.getByTestId('team-legend')).toBeTruthy();
    });
});
