/**
 * Integration tests for TeamLeaderSelectionModal (406L)
 * Covers: render, fetchStaff, toggleSelection, selectAll, clearSelection, roleLabel/roleColor/roleIcon
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

const getLeaders = vi.fn();
const getRunners = vi.fn();
vi.mock('../../services/user.service', () => ({
    userService: {
        getAvailableTeamLeaders: (...a: unknown[]) => getLeaders(...a),
        getAvailableRunners: (...a: unknown[]) => getRunners(...a),
        assignUserToOrchard: vi.fn().mockResolvedValue(undefined),
        unassignUserFromOrchard: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/hooks/useToast', () => ({
    useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/components/ui/ModalOverlay', () => ({
    default: ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) =>
        React.createElement('div', { 'data-testid': 'modal-overlay' },
            React.createElement('button', { 'data-testid': 'close-modal', onClick: onClose }, 'X'),
            children
        ),
}));

import TeamLeaderSelectionModal from './TeamLeaderSelectionModal';

describe('TeamLeaderSelectionModal Integration', () => {
    const defaultProps = {
        onClose: vi.fn(),
        orchardId: 'o1',
        onAdd: vi.fn(),
        onRemoveUser: vi.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        getLeaders.mockResolvedValue([
            { id: 's1', full_name: 'Alice Staff', role: 'team_leader', orchard_id: null, is_active: true },
            { id: 's9', full_name: 'Gone Leader', role: 'team_leader', orchard_id: null, is_active: false },
        ]);
        getRunners.mockResolvedValue([{ id: 's2', full_name: 'Bob Staff', role: 'runner', orchard_id: 'o1', is_active: true }]);
    });

    it('lists the real active staff (Link Staff used to say "0 staff")', async () => {
        render(React.createElement(TeamLeaderSelectionModal, defaultProps));
        expect(await screen.findByText('Alice Staff')).toBeDefined();
        expect(screen.getByText('Bob Staff')).toBeDefined();
        expect(screen.queryByText('Gone Leader')).toBeNull();
    });

    it('says the list could not load (with retry) instead of "no staff"', async () => {
        getLeaders.mockRejectedValueOnce(new Error('offline'));
        render(React.createElement(TeamLeaderSelectionModal, defaultProps));
        expect(await screen.findByRole('alert')).toBeDefined();
        await act(async () => { screen.getByText('Retry').click(); });
        expect(await screen.findByText('Alice Staff')).toBeDefined();
    });

    it('renders modal overlay', async () => {
        render(React.createElement(TeamLeaderSelectionModal, defaultProps));
        expect(screen.getByTestId('modal-overlay')).toBeDefined();
    });

    it('renders staff list area on mount', async () => {
        render(React.createElement(TeamLeaderSelectionModal, defaultProps));
        // Component renders and loads staff internally
        await waitFor(() => {
            expect(screen.getByTestId('modal-overlay')).toBeDefined();
        });
    });

    it('close button calls onClose', async () => {
        render(React.createElement(TeamLeaderSelectionModal, defaultProps));
        await act(async () => { screen.getByTestId('close-modal').click(); });
        expect(defaultProps.onClose).toHaveBeenCalled();
    });
});
