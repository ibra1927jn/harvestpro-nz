/**
 * Tests for Logistics views: BinsTab
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import BinsTab from './BinsTab';

const mockBins = [
    { id: 'b1', bin_code: 'BIN001', zone: 'A1', status: 'filling' as const, fill_percentage: 60 },
    { id: 'b2', bin_code: 'BIN002', zone: 'B2', status: 'full' as const, fill_percentage: 100 },
    { id: 'b3', bin_code: 'BIN003', zone: 'A3', status: 'in_transit' as const, fill_percentage: 80 },
] as any[];

const mockSummary = {
    emptyBins: 5,
    fullBins: 3,
    binsInTransit: 2,
} as any;

describe('BinsTab', () => {
    it('renders Bin Inventory Overview heading', () => {
        render(<BinsTab bins={mockBins} summary={mockSummary} />);
        expect(screen.getByText('Bin Inventory Overview')).toBeTruthy();
    });

    it('renders summary counts', () => {
        render(<BinsTab bins={mockBins} summary={mockSummary} />);
        expect(screen.getByText('5')).toBeTruthy(); // empty
        expect(screen.getByText('3')).toBeTruthy(); // full
        expect(screen.getByText('2')).toBeTruthy(); // transit
    });

    it('renders bin cards', () => {
        render(<BinsTab bins={mockBins} summary={mockSummary} />);
        expect(screen.getByText('#BIN001')).toBeTruthy();
        expect(screen.getByText('#BIN002')).toBeTruthy();
        expect(screen.getByText('#BIN003')).toBeTruthy();
    });

    it('renders bin zones', () => {
        render(<BinsTab bins={mockBins} summary={mockSummary} />);
        expect(screen.getByText('Zone A1')).toBeTruthy();
        expect(screen.getByText('Zone B2')).toBeTruthy();
    });

    it('renders bin fill percentages', () => {
        render(<BinsTab bins={mockBins} summary={mockSummary} />);
        expect(screen.getByText('60% full')).toBeTruthy();
        expect(screen.getByText('100% full')).toBeTruthy();
    });

    it('renders empty state when no bins', () => {
        render(<BinsTab bins={[]} summary={{ ...mockSummary, emptyBins: 0, fullBins: 0, binsInTransit: 0 }} />);
        expect(screen.getByText('No bin data available')).toBeTruthy();
    });

    it('renders bin status badges', () => {
        render(<BinsTab bins={mockBins} summary={mockSummary} />);
        expect(screen.getAllByText(/^filling$/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/^full$/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/^in transit$/i).length).toBeGreaterThan(0);
    });
});
