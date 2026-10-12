/**
 * TeamsToolbar — Teams header with search and action buttons tests
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/test-utils';
import TeamsToolbar from './TeamsToolbar';

describe('TeamsToolbar', () => {
    const defaultProps = {
        orchardId: 'test-orchard-123',
        usersCount: 15,
        setIsAddTeamLeaderModalOpen: vi.fn(),
        setShowImportCSV: vi.fn(),
        canImportPickers: true,
        search: '',
        setSearch: vi.fn(),
    };

    it('renders Teams & Hierarchy heading', () => {
        render(<TeamsToolbar {...defaultProps} />);
        expect(screen.getByText('Teams & Hierarchy')).toBeTruthy();
    });

    it('renders staff count badge', () => {
        render(<TeamsToolbar {...defaultProps} />);
        expect(screen.getByText('15 staff loaded')).toBeTruthy();
    });

    it('renders Link Staff button', () => {
        render(<TeamsToolbar {...defaultProps} />);
        expect(screen.getByText('Link Staff')).toBeTruthy();
    });

    it('renders Import CSV button', () => {
        render(<TeamsToolbar {...defaultProps} />);
        expect(screen.getByText('Import CSV')).toBeTruthy();
    });

    it('opens add team leader modal when Link Staff clicked', () => {
        render(<TeamsToolbar {...defaultProps} />);
        fireEvent.click(screen.getByText('Link Staff'));
        expect(defaultProps.setIsAddTeamLeaderModalOpen).toHaveBeenCalledWith(true);
    });

    it('opens CSV import when Import CSV clicked', () => {
        render(<TeamsToolbar {...defaultProps} />);
        fireEvent.click(screen.getByText('Import CSV'));
        expect(defaultProps.setShowImportCSV).toHaveBeenCalledWith(true);
    });

    it('renders search input', () => {
        render(<TeamsToolbar {...defaultProps} />);
        expect(screen.getByPlaceholderText('Search team leaders, runners, pickers...')).toBeTruthy();
    });

    it('calls setSearch on input change', () => {
        render(<TeamsToolbar {...defaultProps} />);
        const input = screen.getByPlaceholderText('Search team leaders, runners, pickers...');
        fireEvent.change(input, { target: { value: 'alice' } });
        expect(defaultProps.setSearch).toHaveBeenCalledWith('alice');
    });

    it('disables buttons when no orchardId', () => {
        render(<TeamsToolbar {...defaultProps} orchardId={undefined} />);
        const linkBtn = screen.getByText('Link Staff').closest('button')!;
        const csvBtn = screen.getByText('Import CSV').closest('button')!;
        expect(linkBtn.disabled).toBe(true);
        expect(csvBtn.disabled).toBe(true);
    });

    it('hides Import CSV for the manager (pickers are added by team leaders or HR)', () => {
        render(<TeamsToolbar {...defaultProps} canImportPickers={false} />);
        expect(screen.queryByText(/Import CSV/i)).toBeNull();
    });
});
