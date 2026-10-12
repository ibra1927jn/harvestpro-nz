/**
 * Tests for TeamsToolbar (manager/teams)
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/test-utils';
import TeamsToolbar from './TeamsToolbar';

describe('TeamsToolbar', () => {
    const defaultProps = {
        orchardId: 'orch-123',
        usersCount: 42,
        setIsAddTeamLeaderModalOpen: vi.fn(),
        setShowImportCSV: vi.fn(),
        canImportPickers: true,
        search: '',
        setSearch: vi.fn(),
    };

    it('renders title', () => {
        render(<TeamsToolbar {...defaultProps} />);
        expect(screen.getByText('Teams & Hierarchy')).toBeTruthy();
    });

    it('shows staff count', () => {
        render(<TeamsToolbar {...defaultProps} />);
        expect(screen.getByText('42 staff loaded')).toBeTruthy();
    });

    it('shows orchard ID truncated', () => {
        render(<TeamsToolbar {...defaultProps} />);
        // EntityId renders truncated ID with title showing the full value
        expect(screen.getByTitle('orch-123')).toBeTruthy();
    });

    it('renders Link Staff button', () => {
        render(<TeamsToolbar {...defaultProps} />);
        expect(screen.getByText('Link Staff')).toBeTruthy();
    });

    it('renders Import CSV button', () => {
        render(<TeamsToolbar {...defaultProps} />);
        expect(screen.getByText('Import CSV')).toBeTruthy();
    });

    it('calls setIsAddTeamLeaderModalOpen on Link Staff click', () => {
        const setOpen = vi.fn();
        render(<TeamsToolbar {...defaultProps} setIsAddTeamLeaderModalOpen={setOpen} />);
        fireEvent.click(screen.getByText('Link Staff'));
        expect(setOpen).toHaveBeenCalledWith(true);
    });

    it('calls setShowImportCSV on Import CSV click', () => {
        const setImport = vi.fn();
        render(<TeamsToolbar {...defaultProps} setShowImportCSV={setImport} />);
        fireEvent.click(screen.getByText('Import CSV'));
        expect(setImport).toHaveBeenCalledWith(true);
    });

    it('disables buttons when no orchardId', () => {
        render(<TeamsToolbar {...defaultProps} orchardId={undefined} />);
        expect(screen.getByText('Link Staff').closest('button')).toBeDisabled();
        expect(screen.getByText('Import CSV').closest('button')).toBeDisabled();
    });

    it('renders search input', () => {
        render(<TeamsToolbar {...defaultProps} />);
        expect(screen.getByPlaceholderText(/Search team leaders/)).toBeTruthy();
    });

    it('calls setSearch on input change', () => {
        const setSearch = vi.fn();
        render(<TeamsToolbar {...defaultProps} setSearch={setSearch} />);
        fireEvent.change(screen.getByPlaceholderText(/Search team leaders/), { target: { value: 'John' } });
        expect(setSearch).toHaveBeenCalledWith('John');
    });

    it('shows "No orchard" when orchardId is absent', () => {
        render(<TeamsToolbar {...defaultProps} orchardId={undefined} />);
        expect(screen.getByText('No orchard')).toBeTruthy();
    });
});
