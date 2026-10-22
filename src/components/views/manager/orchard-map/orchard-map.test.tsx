/**
 * Tests for orchard-map components: BlockCard, RowCard
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/test-utils';

// Mock utils
vi.mock('@/utils/orchardMapUtils', () => ({
    getBlockStatusColor: vi.fn().mockReturnValue('#f0fdf4'),
    getBlockStatusBorder: vi.fn().mockReturnValue('#86efac'),
    getBlockTextColor: vi.fn().mockReturnValue('#166534'),
    getStatusLabel: vi.fn().mockReturnValue({ label: 'Active', icon: 'play_circle' }),
    getVarietyStyle: vi.fn().mockReturnValue({ bg: '#ecfdf5', text: '#065f46', dot: '#10b981' }),
    getRowGradient: vi.fn().mockReturnValue('#ffffff'),
    AVATAR_COLORS: ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'],
}));

import BlockCard from './BlockCard';

describe('BlockCard', () => {
    const defaultProps = {
        block: {
            id: 'b1', name: 'Block A', status: 'active' as const,
            totalRows: 20, orchard_id: 'o1',
            startRow: 1, colorCode: '#10b981', rowVarieties: {} as Record<number, string>,
        },
        stats: { activePickers: 5, buckets: 120, completedRows: 8, progress: 0.4 },
        varieties: ['Sweetheart', 'Lapin'],
        index: 0,
        onClick: vi.fn(),
    };

    it('renders block name', () => {
        render(<BlockCard {...defaultProps} />);
        expect(screen.getByText('Block A')).toBeTruthy();
    });

    it('shows active status label', () => {
        render(<BlockCard {...defaultProps} />);
        // 'active' maps to orchardMap.status.in_progress = "In Progress"
        expect(screen.getByText('In Progress')).toBeTruthy();
    });

    it('displays variety badges', () => {
        render(<BlockCard {...defaultProps} />);
        expect(screen.getByText('Sweetheart')).toBeTruthy();
        expect(screen.getByText('Lapin')).toBeTruthy();
    });

    it('shows row count', () => {
        render(<BlockCard {...defaultProps} />);
        expect(screen.getByText('ROWS')).toBeTruthy();
        expect(screen.getByText('20')).toBeTruthy();
    });

    it('shows picker count', () => {
        render(<BlockCard {...defaultProps} />);
        expect(screen.getByText('PICKERS')).toBeTruthy();
        expect(screen.getByText('5')).toBeTruthy();
    });

    it('shows progress text', () => {
        render(<BlockCard {...defaultProps} />);
        expect(screen.getByText('8/20 rows')).toBeTruthy();
    });

    it('calls onClick when clicked', () => {
        const onClick = vi.fn();
        render(<BlockCard {...defaultProps} onClick={onClick} />);
        fireEvent.click(screen.getByText('Block A').closest('button')!);
        expect(onClick).toHaveBeenCalled();
    });

    it('shows View Rows drill-in hint', () => {
        render(<BlockCard {...defaultProps} />);
        expect(screen.getByText('View Rows')).toBeTruthy();
    });
});

import RowCard from './RowCard';

describe('RowCard', () => {
    const defaultProps = {
        rd: {
            rowNum: 5,
            variety: 'Sweetheart',
            buckets: 30,
            progress: 0.6,
            pickers: [],
            rowTarget: 50,
            binsPerHour: null,
        },
        index: 0,
        isDimmed: false,
        rowAssignments: [],
    };

    it('renders row number', () => {
        render(<RowCard {...defaultProps} />);
        expect(screen.getByText('R5')).toBeTruthy();
    });

    it('renders variety badge', () => {
        render(<RowCard {...defaultProps} />);
        expect(screen.getByText('Sweetheart')).toBeTruthy();
    });

    it('shows bucket count', () => {
        render(<RowCard {...defaultProps} />);
        expect(screen.getByText(/30\/50/)).toBeTruthy();
    });

    it('shows Tap to assign hint when empty row', () => {
        const emptyRd = { ...defaultProps.rd, buckets: 0, progress: 0, pickers: [] };
        render(<RowCard {...defaultProps} rd={emptyRd} />);
        expect(screen.getByText('Tap to assign')).toBeTruthy();
    });

    it('calls onRowClick when clicked', () => {
        const onRowClick = vi.fn();
        render(<RowCard {...defaultProps} onRowClick={onRowClick} />);
        fireEvent.click(screen.getByText('R5').closest('button')!);
        expect(onRowClick).toHaveBeenCalledWith(5);
    });

    it('is disabled when isDimmed', () => {
        render(<RowCard {...defaultProps} isDimmed={true} />);
        expect(screen.getByText('R5').closest('button')).toBeDisabled();
    });
});

// #8: realce de equipos en la vista del team leader (sin la prop, nada cambia)
describe('RowCard team highlight (team leader map)', () => {
    const rd = {
        rowNum: 8, variety: 'Lapin', buckets: 10, progress: 0.2, pickers: [], rowTarget: 50, binsPerHour: null,
    };
    const base = { rd, index: 0, rowAssignments: [] };

    it('renders no team badge without the prop (manager view unchanged)', () => {
        render(<RowCard {...base} />);
        expect(screen.queryByText('My team')).toBeNull();
        expect(screen.getByText('R8').closest('button')!.getAttribute('data-team')).toBeNull();
    });

    it("marks my team's row with the team leader colour and a badge", () => {
        render(<RowCard {...base} teamHighlight={{ kind: 'mine' }} />);
        const btn = screen.getByText('R8').closest('button')!;
        expect(screen.getByText('My team')).toBeTruthy();
        expect(btn.getAttribute('data-team')).toBe('mine');
        expect(btn.className).toContain('ring-indigo-500');
        expect(btn.className).not.toContain('grayscale');
    });

    it("greys out another team's row and names its team leader", () => {
        render(<RowCard {...base} teamHighlight={{ kind: 'other', leaderNames: ['Hemi'] }} />);
        const btn = screen.getByText('R8').closest('button')!;
        expect(screen.getByText('Team of Hemi')).toBeTruthy();
        expect(btn.getAttribute('data-team')).toBe('other');
        expect(btn.className).toContain('grayscale');
    });

    it('falls back to a generic label when the other team leader is not in the crew', () => {
        render(<RowCard {...base} teamHighlight={{ kind: 'other', leaderNames: [] }} />);
        expect(screen.getByText('Another team')).toBeTruthy();
    });

    it('stays clickable for other teams (the TL can still open the row)', () => {
        const onRowClick = vi.fn();
        render(<RowCard {...base} teamHighlight={{ kind: 'other', leaderNames: ['Hemi'] }} onRowClick={onRowClick} />);
        fireEvent.click(screen.getByText('R8').closest('button')!);
        expect(onRowClick).toHaveBeenCalledWith(8);
    });
});
