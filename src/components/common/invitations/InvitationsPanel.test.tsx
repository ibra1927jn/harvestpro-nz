import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const list = vi.fn();
const create = vi.fn();
const resend = vi.fn();
const revoke = vi.fn();
vi.mock('@/repositories/invitations.repository', () => ({
    INVITATION_DAYS: 14,
    invitationsRepository: {
        list: (...a: unknown[]) => list(...a),
        create: (...a: unknown[]) => create(...a),
        resend: (...a: unknown[]) => resend(...a),
        revoke: (...a: unknown[]) => revoke(...a),
    },
}));
vi.mock('@/repositories/pay-rates.repository', () => ({
    loadOrchardNames: () => Promise.resolve({ o1: 'Cromwell Block' }),
}));

import InvitationsPanel from './InvitationsPanel';

const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();
const base = { orchard_id: 'o1', full_name: null, resent_at: null, created_by: 'u', created_at: '2026-10-20T00:00:00Z' };

beforeEach(() => {
    list.mockReset(); create.mockReset(); resend.mockReset(); revoke.mockReset();
    list.mockResolvedValue([
        { ...base, id: 'p1', email: 'pending@x.nz', assigned_role: 'runner', used_at: null, expires_at: future },
        { ...base, id: 'e1', email: 'old@x.nz', assigned_role: 'team_leader', used_at: null, expires_at: past },
        { ...base, id: 'u1', email: 'done@x.nz', assigned_role: 'qc_inspector', used_at: past, expires_at: past },
    ]);
});

describe('InvitationsPanel', () => {
    it('lists pending invitations by default and counts each status', async () => {
        render(<InvitationsPanel canInviteAdmin={false} />);
        expect(await screen.findByText('pending@x.nz')).toBeInTheDocument();
        expect(screen.queryByText('old@x.nz')).not.toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /Pending \(1\)/ })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: /Expired \(1\)/ }));
        expect(screen.getByText('old@x.nz')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: /Used \(1\)/ }));
        expect(screen.getByText('done@x.nz')).toBeInTheDocument();
    });

    it('HR does not get the admin role in the form', async () => {
        render(<InvitationsPanel canInviteAdmin={false} />);
        await screen.findByText('pending@x.nz');
        fireEvent.click(screen.getByRole('button', { name: 'Invite user' }));
        const roleSelect = screen.getByLabelText('Role') as HTMLSelectElement;
        expect([...roleSelect.options].map(o => o.value)).not.toContain('admin');
    });

    it('creates an invitation and shows the sign-up link to share', async () => {
        create.mockResolvedValue({ ...base, id: 'n1', email: 'new@x.nz', assigned_role: 'admin', used_at: null, expires_at: future });
        render(<InvitationsPanel canInviteAdmin />);
        await screen.findByText('pending@x.nz');
        fireEvent.click(screen.getByRole('button', { name: 'Invite user' }));
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@x.nz' } });
        fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'admin' } });
        fireEvent.change(screen.getByLabelText('Orchard'), { target: { value: 'o1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create invitation' }));
        await waitFor(() => expect(create).toHaveBeenCalledWith({ email: 'new@x.nz', role: 'admin', orchardId: 'o1', fullName: '' }));
        expect(await screen.findByText('new@x.nz')).toBeInTheDocument();
        expect((screen.getByLabelText('Sign-up link') as HTMLInputElement).value).toMatch(/\/login\?invite=new%40x\.nz$/);
    });

    it('explains a duplicate email instead of failing silently', async () => {
        create.mockRejectedValue({ code: '23505', message: 'duplicate key value violates unique constraint "allowed_registrations_email_key"' });
        render(<InvitationsPanel canInviteAdmin />);
        await screen.findByText('pending@x.nz');
        fireEvent.click(screen.getByRole('button', { name: 'Invite user' }));
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'pending@x.nz' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create invitation' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/already has an invitation/);
    });

    it('resends and revokes (with confirmation)', async () => {
        resend.mockResolvedValue({ ...base, id: 'p1', email: 'pending@x.nz', assigned_role: 'runner', used_at: null, expires_at: future });
        revoke.mockResolvedValue(undefined);
        render(<InvitationsPanel canInviteAdmin />);
        await screen.findByText('pending@x.nz');
        fireEvent.click(screen.getByRole('button', { name: 'Resend invitation for pending@x.nz' }));
        await waitFor(() => expect(resend).toHaveBeenCalledWith('p1'));
        const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel invitation for pending@x.nz' }));
        expect(revoke).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel invitation for pending@x.nz' }));
        await waitFor(() => expect(revoke).toHaveBeenCalledWith('p1'));
        await waitFor(() => expect(screen.queryByText('pending@x.nz')).not.toBeInTheDocument());
        confirm.mockRestore();
    });

    it('shows a retry when the list cannot be loaded', async () => {
        list.mockRejectedValueOnce(new Error('offline'));
        render(<InvitationsPanel canInviteAdmin />);
        expect(await screen.findByText('Could not load invitations.')).toBeInTheDocument();
    });
});
