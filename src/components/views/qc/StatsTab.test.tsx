/**
 * StatsTab — Deep render tests
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('./DistributionBar', () => ({
    default: ({ distribution }: any) => (
        <div data-testid="distribution-bar">
            A:{distribution.A} B:{distribution.B} C:{distribution.C} R:{distribution.reject}
        </div>
    ),
}));

vi.mock('@/components/ui/EmptyState', () => ({
    default: ({ title, subtitle }: any) => (
        <div data-testid="empty-state">
            <span>{title}</span>
            <span>{subtitle}</span>
        </div>
    ),
}));

import StatsTab from './StatsTab';

describe('StatsTab', () => {
    const distribution = { A: 50, B: 25, C: 15, reject: 10, total: 100 };

    it('renders Grade Distribution heading', () => {
        render(<StatsTab distribution={distribution} />);
        expect(screen.getByText('Grade Distribution')).toBeTruthy();
    });

    it('renders DistributionBar component', () => {
        render(<StatsTab distribution={distribution} />);
        expect(screen.getByTestId('distribution-bar')).toBeTruthy();
    });

    it('shows grade counts', () => {
        render(<StatsTab distribution={distribution} />);
        expect(screen.getByText('50')).toBeTruthy();
        expect(screen.getByText('25')).toBeTruthy();
        expect(screen.getByText('15')).toBeTruthy();
        expect(screen.getByText('10')).toBeTruthy();
    });

    it('shows the picker-inspection grade labels (not fruit grades)', () => {
        render(<StatsTab distribution={distribution} />);
        expect(screen.getByText('Good')).toBeTruthy();
        expect(screen.getByText('Acceptable')).toBeTruthy();
        expect(screen.getByText('Needs correcting')).toBeTruthy();
        expect(screen.getByText('Severe')).toBeTruthy();
        expect(screen.queryByText('Export')).toBeNull();
    });

    it('shows percentages', () => {
        render(<StatsTab distribution={distribution} />);
        // 50% and 10% appear in both grade breakdown and summary
        expect(screen.getAllByText('50%').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('25%').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('15%').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('10%').length).toBeGreaterThanOrEqual(1);
    });

    it('shows Summary section', () => {
        render(<StatsTab distribution={distribution} />);
        expect(screen.getByText('Summary')).toBeTruthy();
    });

    it('shows Total Inspections', () => {
        render(<StatsTab distribution={distribution} />);
        expect(screen.getByText('Total Inspections')).toBeTruthy();
        expect(screen.getByText('100')).toBeTruthy();
    });

    it('shows the Good (A) rate', () => {
        render(<StatsTab distribution={distribution} />);
        expect(screen.getByText('Good (A) rate')).toBeTruthy();
    });

    it('shows Rejection Rate', () => {
        render(<StatsTab distribution={distribution} />);
        expect(screen.getByText('Rejection Rate')).toBeTruthy();
    });

    it('shows empty state when total is 0', () => {
        render(<StatsTab distribution={{ A: 0, B: 0, C: 0, reject: 0, total: 0 }} />);
        expect(screen.getByTestId('empty-state')).toBeTruthy();
        expect(screen.getByText('Grade distribution analytics')).toBeTruthy();
    });

    describe('most failed criterion', () => {
        const inspections = [
            { id: '1', grade: 'B', criteria: { ladder: 'ok', size: 'warn', damaged_fruit: 'bad' } },
            { id: '2', grade: 'C', criteria: { size: 'bad', bucket_fill: 'warn' } },
            { id: '3', grade: 'A', criteria: null },
            { id: '4', grade: 'A' },
        ] as any[];

        it('names the criterion with most warn/bad marks today and its counts', () => {
            render(<StatsTab distribution={distribution} inspections={inspections} />);
            const card = screen.getByTestId('top-failing');
            expect(within(card).getByText('Most failed criterion today')).toBeTruthy();
            // size: 1 bad + 1 so-so = 2; damaged_fruit y bucket_fill: 1 cada uno
            const [highlight] = within(card).getAllByText('Size');
            expect(highlight.closest('div')?.textContent).toContain('1 bad · 1 so-so');
            // Los seis criterios aparecen en el desglose
            expect(within(card).getAllByRole('listitem')).toHaveLength(6);
        });

        it('says so when nothing failed (only-grade inspections)', () => {
            render(<StatsTab distribution={distribution} inspections={[{ id: '4', grade: 'A' }] as any[]} />);
            expect(screen.getByText('No criterion failed today')).toBeTruthy();
        });

        it('works without the inspections prop', () => {
            render(<StatsTab distribution={distribution} />);
            expect(screen.getByText('No criterion failed today')).toBeTruthy();
        });
    });
});
