import { describe, it, expect } from 'vitest';
import {
    countByStatus, inviteEmailFromSearch, invitableRoles, invitationErrorKey, invitationStatus, isValidEmail, signupLink,
} from './invitationLogic';
import type { InvitationRow } from '@/repositories/invitations.repository';

const row = (over: Partial<InvitationRow>): InvitationRow => ({
    id: 'i1', email: 'a@b.nz', assigned_role: 'runner', orchard_id: null, full_name: null,
    used_at: null, expires_at: null, resent_at: null, created_by: null, created_at: null, ...over,
});
const NOW = new Date('2026-10-23T00:00:00Z');

describe('invitationLogic', () => {
    it('HR cannot invite admins; admin can invite every role', () => {
        expect(invitableRoles(false)).not.toContain('admin');
        expect(invitableRoles(false)).toHaveLength(7);
        expect(invitableRoles(true)).toHaveLength(8);
        expect(invitableRoles(true)).toContain('admin');
    });

    it('works out pending, used and expired', () => {
        expect(invitationStatus(row({}), NOW)).toBe('pending');
        expect(invitationStatus(row({ expires_at: '2026-10-30T00:00:00Z' }), NOW)).toBe('pending');
        expect(invitationStatus(row({ expires_at: '2026-10-22T00:00:00Z' }), NOW)).toBe('expired');
        expect(invitationStatus(row({ used_at: '2026-10-20T00:00:00Z', expires_at: '2026-10-22T00:00:00Z' }), NOW)).toBe('used');
        expect(countByStatus([
            row({}), row({ used_at: '2026-10-20T00:00:00Z' }), row({ expires_at: '2026-10-01T00:00:00Z' }),
        ], NOW)).toEqual({ pending: 1, used: 1, expired: 1 });
    });

    it('builds the sign-up link and reads it back', () => {
        const link = signupLink(' New.Person@Example.NZ ', 'https://app.example.nz/');
        expect(link).toBe('https://app.example.nz/login?invite=new.person%40example.nz');
        expect(inviteEmailFromSearch(new URL(link).search)).toBe('new.person@example.nz');
        expect(inviteEmailFromSearch('?invite=not-an-email')).toBeNull();
        expect(inviteEmailFromSearch('')).toBeNull();
    });

    it('validates emails', () => {
        expect(isValidEmail('a@b.nz')).toBe(true);
        expect(isValidEmail('a@b')).toBe(false);
        expect(isValidEmail('')).toBe(false);
    });

    it('maps database errors to a clear message', () => {
        expect(invitationErrorKey({ code: '23505', message: 'duplicate key value' })).toBe('invite.err.duplicate');
        expect(invitationErrorKey({ code: '42501', message: 'Not allowed to invite role admin' })).toBe('invite.err.not_allowed');
        expect(invitationErrorKey(new Error('new row violates row-level security policy'))).toBe('invite.err.not_allowed');
        expect(invitationErrorKey(new Error('boom'))).toBe('invite.err.generic');
    });
});
