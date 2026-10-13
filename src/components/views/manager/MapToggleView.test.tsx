/**
 * MapToggleView — Deep render + tab toggle tests
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('./OrchardMapView', () => ({
    default: () => <div data-testid="orchard-map">OrchardMap</div>,
}));
vi.mock('./HeatMapView', () => ({
    HeatMapView: () => <div data-testid="heat-map">HeatMap</div>,
}));
vi.mock('./RowListView', () => ({
    default: (props: any) => <div data-testid="row-list">RowList - {props.blockName}</div>,
}));
vi.mock('@/components/ui/ComponentErrorBoundary', () => ({
    default: ({ children }: any) => <div>{children}</div>,
}));

import MapToggleView from './MapToggleView';

describe('MapToggleView', () => {
    const defaultProps = {
        totalRows: 30,
        crew: [
            { id: 'p1', role: 'picker' } as any,
            { id: 'r1', role: 'runner' } as any,
        ],
        bucketRecords: [],
        blockName: 'Block A',
        setActiveTab: vi.fn(),
    };

    it('renders toggle buttons', () => {
        render(<MapToggleView {...defaultProps} />);
        expect(screen.getByText('Tactical')).toBeTruthy();
        expect(screen.getByText('Heat')).toBeTruthy();
        expect(screen.getByText('List')).toBeTruthy();
    });

    it('shows tactical map by default', () => {
        render(<MapToggleView {...defaultProps} />);
        expect(screen.getByTestId('orchard-map')).toBeTruthy();
    });

    it('switches to heat map', () => {
        render(<MapToggleView {...defaultProps} />);
        fireEvent.click(screen.getByText('Heat'));
        expect(screen.getByTestId('heat-map')).toBeTruthy();
    });

    it('switches to list view', () => {
        render(<MapToggleView {...defaultProps} />);
        fireEvent.click(screen.getByText('List'));
        expect(screen.getByTestId('row-list')).toBeTruthy();
    });

    it('passes blockName to RowListView', () => {
        render(<MapToggleView {...defaultProps} />);
        fireEvent.click(screen.getByText('List'));
        expect(screen.getByText('RowList - Block A')).toBeTruthy();
    });
});
