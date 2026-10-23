/**
 * ChatInfoPanel — personas, gestionar un grupo, silenciar, directo → grupo y
 * adjuntos compartidos.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ChatInfoPanel from './ChatInfoPanel';
import { messagingRepository } from '@/repositories/messaging.repository';
import { chatAttachmentsService } from '@/services/chat-attachments.service';
import type { ChatGroup, DBMessage } from '@/context/messaging.types';

vi.mock('@/hooks/useAvatarUrl', () => ({ useUserAvatarUrl: () => null }));

const people = [
    { id: 'u1', full_name: 'Me Runner', role: 'runner', avatar_url: null, is_active: true },
    { id: 'u2', full_name: 'Bob Leader', role: 'team_leader', avatar_url: null, is_active: true },
    { id: 'u3', full_name: 'Old Hand', role: 'qc_inspector', avatar_url: null, is_active: false },
];
const group: ChatGroup = { id: 'g1', name: 'Block A', members: ['u1', 'u2', 'u3'], isGroup: true, createdBy: 'u1', muted: false };

function setup(over: Partial<React.ComponentProps<typeof ChatInfoPanel>> = {}) {
    const props = {
        chat: group,
        messages: [] as DBMessage[],
        appUserId: 'u1',
        canManageAny: false,
        availableUsers: [{ id: 'u2', name: 'Bob Leader', role: 'team_leader' }, { id: 'u9', name: 'Hana HR', role: 'hr_admin' }],
        onClose: vi.fn(),
        onUpdate: vi.fn().mockResolvedValue(true),
        onSetMuted: vi.fn().mockResolvedValue(true),
        onCreateGroup: vi.fn().mockResolvedValue(undefined),
        ...over,
    };
    render(<ChatInfoPanel {...props} />);
    return props;
}

beforeEach(() => {
    vi.spyOn(messagingRepository, 'getParticipants').mockResolvedValue(people);
    vi.spyOn(chatAttachmentsService, 'signedUrl').mockImplementation(async p => `https://signed/${p}`);
});
afterEach(() => vi.restoreAllMocks());

describe('ChatInfoPanel', () => {
    it('lists the people with their role and marks the creator and deactivated accounts', async () => {
        setup();
        expect(await screen.findByText('You')).toBeInTheDocument();
        expect(screen.getByText('Bob Leader')).toBeInTheDocument();
        expect(screen.getByText(/Team Leader/i)).toBeInTheDocument();
        expect(screen.getByText(/created the group/)).toBeInTheDocument();
        expect(screen.getByText(/account deactivated/)).toBeInTheDocument();
        expect(messagingRepository.getParticipants).toHaveBeenCalledWith(['u1', 'u2', 'u3']);
    });

    it('the creator renames the group, adds and removes people', async () => {
        const p = setup();
        await screen.findByText('Bob Leader');
        fireEvent.change(screen.getByLabelText('Group Name'), { target: { value: 'Block A pickers' } });
        fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
        await waitFor(() => expect(p.onUpdate).toHaveBeenCalledWith({ name: 'Block A pickers' }));

        fireEvent.click(screen.getByRole('button', { name: 'Remove Bob Leader from the group' }));
        await waitFor(() => expect(p.onUpdate).toHaveBeenCalledWith({ remove: ['u2'] }));

        fireEvent.click(screen.getByRole('button', { name: /Add people/ }));
        // Solo quien no está ya
        expect(screen.queryByRole('button', { name: /^Bob Leader/ })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Hana HR/ }));
        await waitFor(() => expect(p.onUpdate).toHaveBeenCalledWith({ add: ['u9'] }));
    });

    it('someone who did not create the group cannot change it (a manager can)', async () => {
        setup({ appUserId: 'u2' });
        await screen.findByText('Me Runner');
        expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Add people/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
    });

    it('a manager in the group can change it', async () => {
        setup({ appUserId: 'u2', canManageAny: true });
        await screen.findByText('Me Runner');
        expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
    });

    it('says when it could not save', async () => {
        setup({ onUpdate: vi.fn().mockResolvedValue(false) });
        await screen.findByText('Bob Leader');
        fireEvent.click(screen.getByRole('button', { name: 'Remove Bob Leader from the group' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/Not saved/);
    });

    it('mutes the chat for me', async () => {
        const p = setup();
        fireEvent.click(screen.getByRole('switch', { name: /Mute this chat/ }));
        await waitFor(() => expect(p.onSetMuted).toHaveBeenCalledWith(true));
    });

    it('a direct chat can become a group with this person and others', async () => {
        const p = setup({ chat: { id: 'd1', name: 'Bob Leader', members: ['u1', 'u2'], isGroup: false } });
        fireEvent.click(screen.getByRole('button', { name: 'Create a group with this person' }));
        fireEvent.change(screen.getByLabelText('Group Name'), { target: { value: 'Row 12' } });
        fireEvent.click(screen.getByLabelText(/Hana HR/));
        fireEvent.click(screen.getByRole('button', { name: 'Create Group (3 members)' }));
        await waitFor(() => expect(p.onCreateGroup).toHaveBeenCalledWith('Row 12', ['u2', 'u9']));
    });

    it('lists the shared photos and files', async () => {
        const base = { priority: 'normal' as const, read_by: [], created_at: new Date().toISOString(), sender_id: 'u2' };
        setup({
            messages: [
                { ...base, id: 'm1', content: 'hi' },
                { ...base, id: 'm2', content: '', attachment_path: 'g1/m2.jpg', attachment_type: 'image', attachment_name: 'tree.jpg', attachment_size: 10 },
                { ...base, id: 'm3', content: '', attachment_path: 'g1/m3.pdf', attachment_type: 'pdf', attachment_name: 'plan.pdf', attachment_size: 2048 },
            ],
        });
        const section = screen.getByRole('region', { name: 'Shared photos and files' });
        expect(await within(section).findByRole('img', { name: 'tree.jpg' })).toHaveAttribute('src', 'https://signed/g1/m2.jpg');
        expect(within(section).getByText(/plan\.pdf · 2 KB/)).toBeInTheDocument();
    });
});
