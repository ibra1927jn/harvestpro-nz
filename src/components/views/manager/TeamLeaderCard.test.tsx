/**
 * TeamLeaderCard — Deep render + interaction tests
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/test-utils';

vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: vi.fn((sel: (s: Record<string, unknown>) => unknown) =>
        sel({
            rowAssignments: [
                { row_number: 1, assigned_pickers: ['leader1', 'p1'] },
                { row_number: 3, assigned_pickers: ['leader1'] },
                { row_number: 5, assigned_pickers: ['p2'] },
            ],
        })
    ),
}));

// Foto de la cuenta del team leader (Mi cuenta): el enlace firmado llega ya resuelto
const avatarMocks = vi.hoisted(() => ({ byUser: {} as Record<string, string> }));
vi.mock('@/hooks/useAvatarUrl', () => ({
    useAvatarSignedUrl: () => null,
    useUserAvatarUrl: (userId: string | null | undefined) => (userId ? avatarMocks.byUser[userId] ?? null : null),
}));

import TeamLeaderCard from './TeamLeaderCard';

const makeLeader = () => ({
    id: 'leader1',
    name: 'John Leader',
    role: 'team_leader',
    picker_id: 'TL-001',
    status: 'active' as const,
    current_row: 1,
    total_buckets_today: 10,
    hours: 6,
    team_leader_id: null,
    orchard_id: 'o1',
}) as any;

const makeMember = (id: string, name: string, buckets: number, hours = 4) => ({
    id, name, role: 'picker',
    picker_id: `PK-${id}`,
    status: 'active' as const,
    current_row: 1,
    total_buckets_today: buckets,
    hours,
    team_leader_id: 'leader1',
    orchard_id: 'o1',
}) as any;

describe('TeamLeaderCard', () => {
    const leader = makeLeader();
    const crew = [
        makeMember('p1', 'Alice', 15),
        makeMember('p2', 'Bob', 8, 5),
    ];

    const defaultProps = {
        leader,
        crew,
        onSelectUser: vi.fn(),
        settings: { min_buckets_per_hour: 3.6 } as any,
    };

    it('renders leader name', () => {
        render(<TeamLeaderCard {...defaultProps} />);
        expect(screen.getByText('John Leader')).toBeTruthy();
    });

    it('shows Team Leader badge', () => {
        render(<TeamLeaderCard {...defaultProps} />);
        // teams.team_leader_role = "TEAM LEADER" (all-caps label)
        expect(screen.getByText('TEAM LEADER')).toBeTruthy();
    });

    it('shows crew member count', () => {
        render(<TeamLeaderCard {...defaultProps} />);
        // teams.members_count_other = "{n} members" (lowercase m)
        expect(screen.getByText('2 members')).toBeTruthy();
    });

    it('calculates total team buckets (leader + crew)', () => {
        render(<TeamLeaderCard {...defaultProps} />);
        // 10 (leader) + 15 (Alice) + 8 (Bob) = 33
        expect(screen.getByText('33')).toBeTruthy();
    });

    it('shows Team Buckets label', () => {
        render(<TeamLeaderCard {...defaultProps} />);
        expect(screen.getByText('Team Buckets')).toBeTruthy();
    });

    it('shows row assignments for the leader', () => {
        render(<TeamLeaderCard {...defaultProps} />);
        // Leader is assigned to row 1 and row 3 → "R1, R3" format
        expect(screen.getByText(/R1.*R3/)).toBeTruthy();
    });

    it('expands crew list when header is clicked', () => {
        render(<TeamLeaderCard {...defaultProps} />);
        // Click header to expand
        fireEvent.click(screen.getByText('John Leader'));
        // Crew members should now be visible
        expect(screen.getByText('Alice')).toBeTruthy();
        expect(screen.getByText('Bob')).toBeTruthy();
    });

    it('shows empty crew message when no crew members', () => {
        render(<TeamLeaderCard {...defaultProps} crew={[]} />);
        fireEvent.click(screen.getByText('John Leader'));
        expect(screen.getByText('No crew members assigned yet.')).toBeTruthy();
    });

    it('shows leader avatar (initials, no external avatar service)', () => {
        render(<TeamLeaderCard {...defaultProps} />);
        const imgs = screen.getAllByRole('img', { name: 'John Leader' });
        expect(imgs.length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('JL').length).toBeGreaterThanOrEqual(1);
        expect(document.querySelector('img[src*="ui-avatars"]')).toBeNull();
    });

    it('shows the account photo when the team leader uploaded one in My account', () => {
        avatarMocks.byUser = { leader1: 'https://signed.example/leader1.jpg' };
        try {
            render(<TeamLeaderCard {...defaultProps} />);
            const photo = document.querySelector('img[src="https://signed.example/leader1.jpg"]');
            expect(photo).not.toBeNull();
        } finally {
            avatarMocks.byUser = {};
        }
    });

    it('calls onSelectUser when avatar is clicked', () => {
        const onSelectUser = vi.fn();
        render(<TeamLeaderCard {...defaultProps} onSelectUser={onSelectUser} />);
        const avatar = screen.getByTitle("View John Leader's profile");
        fireEvent.click(avatar);
        expect(onSelectUser).toHaveBeenCalledWith(leader);
    });

    it('shows leader as first item in expanded crew list', () => {
        render(<TeamLeaderCard {...defaultProps} />);
        fireEvent.click(screen.getByText('John Leader'));
        expect(screen.getByText('John Leader (Lead)')).toBeTruthy();
    });

    it('shows unlink button when onRemoveUser is provided', () => {
        render(<TeamLeaderCard {...defaultProps} onRemoveUser={vi.fn()} />);
        const unlinkButtons = screen.getAllByTitle('Unlink from orchard');
        expect(unlinkButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('does not show unlink button when onRemoveUser is not provided', () => {
        render(<TeamLeaderCard {...defaultProps} />);
        expect(screen.queryByTitle('Unlink from orchard')).toBeNull();
    });

    it('shows confirm on first unlink click', () => {
        render(<TeamLeaderCard {...defaultProps} onRemoveUser={vi.fn()} />);
        const unlinkBtn = screen.getAllByTitle('Unlink from orchard')[0];
        fireEvent.click(unlinkBtn);
        expect(screen.getByText('Confirm?')).toBeTruthy();
    });

    it('executes unlink on second click (confirm)', async () => {
        const onRemoveUser = vi.fn().mockResolvedValue(undefined);
        render(<TeamLeaderCard {...defaultProps} onRemoveUser={onRemoveUser} />);
        // First click (shows confirm)
        const unlinkBtn = screen.getAllByTitle('Unlink from orchard')[0];
        fireEvent.click(unlinkBtn);
        // Second click (confirm) — title uses t('teams.confirm_q') = "Confirm?"
        const confirmBtn = screen.getByTitle('Confirm?');
        fireEvent.click(confirmBtn);
        expect(onRemoveUser).toHaveBeenCalledWith('leader1');
    });

    it('displays member bucket count in expanded view', () => {
        render(<TeamLeaderCard {...defaultProps} />);
        fireEvent.click(screen.getByText('John Leader'));
        expect(screen.getByText('15')).toBeTruthy(); // Alice's buckets
    });

    it('renders with staggerIndex for animation', () => {
        const { container } = render(<TeamLeaderCard {...defaultProps} staggerIndex={3} />);
        expect(container.querySelector('.stagger-4')).toBeTruthy();
    });
});
