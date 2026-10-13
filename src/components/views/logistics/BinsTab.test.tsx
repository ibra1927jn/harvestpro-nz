/**
 * BinsTab — Deep render tests
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/ui/EmptyState', () => ({
    default: ({ title, subtitle }: any) => (
        <div data-testid="empty-state"><span>{title}</span><span>{subtitle}</span></div>
    ),
}));

import BinsTab from './BinsTab';

const makeBin = (id: string, code: string, zone: string, status: string, fillPct: number) => ({
    id, bin_code: code, zone, status, fill_percentage: fillPct,
}) as any;

const makeSummary = (empty = 10, full = 3, transit = 2) => ({
    emptyBins: empty, fullBins: full, binsInTransit: transit,
}) as any;

describe('BinsTab', () => {
    const bins = [
        makeBin('b1', 'BIN-001', 'A1', 'filling', 45),
        makeBin('b2', 'BIN-002', 'B1', 'full', 100),
        makeBin('b3', 'BIN-003', 'A2', 'empty', 0),
    ];

    const summary = makeSummary();

    it('renders Bin Inventory Overview heading', () => {
        render(<BinsTab bins={bins} summary={summary} />);
        expect(screen.getByText('Bin Inventory Overview')).toBeTruthy();
    });

    it('renders summary stats labels', () => {
        render(<BinsTab bins={bins} summary={summary} />);
        expect(screen.getAllByText('Empty').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Filling').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Full').length).toBeGreaterThan(0);
        expect(screen.getByText('Transit')).toBeTruthy();
    });

    it('renders summary counts', () => {
        render(<BinsTab bins={bins} summary={summary} />);
        expect(screen.getByText('10')).toBeTruthy(); // empty
        expect(screen.getByText('3')).toBeTruthy();  // full
        expect(screen.getByText('2')).toBeTruthy();  // transit
    });

    it('renders bin codes', () => {
        render(<BinsTab bins={bins} summary={summary} />);
        expect(screen.getByText('#BIN-001')).toBeTruthy();
        expect(screen.getByText('#BIN-002')).toBeTruthy();
        expect(screen.getByText('#BIN-003')).toBeTruthy();
    });

    it('renders bin zones', () => {
        render(<BinsTab bins={bins} summary={summary} />);
        const zoneA1 = screen.getAllByText('Zone A1');
        expect(zoneA1.length).toBeGreaterThanOrEqual(1);
    });

    it('renders fill percentages', () => {
        render(<BinsTab bins={bins} summary={summary} />);
        expect(screen.getByText('45% full')).toBeTruthy();
        expect(screen.getByText('100% full')).toBeTruthy();
        expect(screen.getByText('0% full')).toBeTruthy();
    });

    it('renders bin status badges', () => {
        render(<BinsTab bins={bins} summary={summary} />);
        expect(screen.getAllByText(/^filling$/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/^full$/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/^empty$/i).length).toBeGreaterThan(0);
    });

    it('shows empty state when no bins', () => {
        render(<BinsTab bins={[]} summary={makeSummary(0, 0, 0)} />);
        expect(screen.getByTestId('empty-state')).toBeTruthy();
        expect(screen.getByText('No bin data available')).toBeTruthy();
    });
});
