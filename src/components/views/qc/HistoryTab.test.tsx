/**
 * HistoryTab — criterios con aviso por inspección, etiqueta de la nota y la
 * sección «Bienestar» (solo cuando el rol puede verla).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/components/ui/VirtualList', () => ({
    default: ({ items, renderItem, getKey }: any) => (
        <div data-testid="virtual-list">
            {items.map((item: any, i: number) => (
                <div key={getKey ? getKey(item, i) : i}>{renderItem(item, i)}</div>
            ))}
        </div>
    ),
}));

vi.mock('@/hooks/useQcPhotoUrl', () => ({ useQcPhotoUrl: (stored: string | null) => stored }));

import HistoryTab from './HistoryTab';

const crew = [
    { id: 'p1', name: 'Alice Apple' },
    { id: 'p2', name: 'Bob Berry' },
    { id: 'p3', name: 'Cara Cherry' },
] as any[];

const inspections = [
    {
        id: 'i1', picker_id: 'p1', grade: 'C', created_at: '2026-10-21T20:15:00Z', row_number: 7,
        criteria: { ladder: 'ok', size: 'warn', damaged_fruit: 'bad' }, informed: false, comfortable: true,
        wellbeing_notes: 'Did not get the size briefing',
    },
    { id: 'i2', picker_id: 'p2', grade: 'A', created_at: '2026-10-21T20:30:00Z', criteria: null, informed: true, comfortable: false },
    { id: 'i3', picker_id: 'p3', grade: 'reject', created_at: '2026-10-21T20:45:00Z' },
] as any[];

describe('HistoryTab', () => {
    it('lists the inspections with grade letter, label title and row', () => {
        render(<HistoryTab inspections={inspections} crew={crew} />);
        expect(screen.getByText('Recent Inspections (3)')).toBeTruthy();
        expect(screen.getByText('Alice Apple')).toBeTruthy();
        expect(screen.getByText('Row 7')).toBeTruthy();
        const pill = screen.getByText('REJ');
        expect(pill.getAttribute('title')).toBe('Severe');
        expect(screen.getByText('C').getAttribute('title')).toBe('Needs correcting');
    });

    it('shows the warn/bad criteria of each inspection as chips, never the ok ones', () => {
        render(<HistoryTab inspections={inspections} crew={crew} />);
        const alice = screen.getByText('Alice Apple').closest('div.px-4') as HTMLElement;
        expect(within(alice).getByText('Size').className).toContain('bg-amber-100');
        expect(within(alice).getByText('Damaged fruit').className).toContain('bg-red-100');
        expect(within(alice).queryByText('Ladder use')).toBeNull();
    });

    it('hides the wellbeing section by default (QC inspector, public profile)', () => {
        render(<HistoryTab inspections={inspections} crew={crew} />);
        expect(screen.queryByTestId('wellbeing-section')).toBeNull();
        expect(screen.queryByText('Not informed')).toBeNull();
        expect(screen.queryByText('Did not get the size briefing')).toBeNull();
    });

    it('shows the wellbeing section with the "no" answers for allowed roles', () => {
        render(<HistoryTab inspections={inspections} crew={crew} canViewWellbeing />);
        const section = screen.getByTestId('wellbeing-section');
        expect(within(section).getByText('2 to follow up today')).toBeTruthy();
        expect(within(section).getByText('Alice Apple')).toBeTruthy();
        expect(within(section).getByText('Not informed')).toBeTruthy();
        expect(within(section).getByText('Did not get the size briefing')).toBeTruthy();
        expect(within(section).getByText('Bob Berry')).toBeTruthy();
        expect(within(section).getByText('Not comfortable in the team')).toBeTruthy();
        // Cara no respondió nada: no sale
        expect(within(section).queryByText('Cara Cherry')).toBeNull();
    });

    it('says nobody is flagged when all answers are yes or missing', () => {
        render(<HistoryTab inspections={[inspections[2]]} crew={crew} canViewWellbeing />);
        expect(screen.getByText('Nobody flagged today')).toBeTruthy();
    });
});
