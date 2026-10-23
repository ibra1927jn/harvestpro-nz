/**
 * UserAvatar — foto propia (url), foto de otra cuenta (userId → directorio) o iniciales.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const lookups = vi.hoisted(() => ({ calls: [] as Array<string | null | undefined>, byUser: {} as Record<string, string> }));
vi.mock('@/hooks/useAvatarUrl', () => ({
    useUserAvatarUrl: (userId: string | null | undefined) => {
        lookups.calls.push(userId);
        return userId ? lookups.byUser[userId] ?? null : null;
    },
}));

import { UserAvatar, initialsOf } from './UserAvatar';

describe('initialsOf', () => {
    it('takes the first letter of the first two words', () => {
        expect(initialsOf('Alice Manager')).toBe('AM');
        expect(initialsOf('  liam   o\'connor ')).toBe('LO');
        expect(initialsOf('Admin')).toBe('A');
        expect(initialsOf('Ana María Pérez')).toBe('AM');
        expect(initialsOf('')).toBe('?');
        expect(initialsOf(null)).toBe('?');
    });
});

describe('UserAvatar', () => {
    it('renders initials with an accessible name when there is no photo', () => {
        render(<UserAvatar name="Alice Manager" url={null} />);
        expect(screen.getByRole('img', { name: 'Alice Manager' })).toBeTruthy();
        expect(screen.getByText('AM')).toBeTruthy();
        // Con url explícita no se consulta el directorio
        expect(lookups.calls.at(-1)).toBeNull();
    });

    it('renders the photo when a signed url is given', () => {
        render(<UserAvatar name="Alice Manager" url="https://signed/a.jpg" />);
        const img = screen.getByRole('img', { name: 'Alice Manager' }) as HTMLImageElement;
        expect(img.tagName).toBe('IMG');
        expect(img.src).toBe('https://signed/a.jpg');
    });

    it('looks the photo up by user id when no url is passed', () => {
        lookups.byUser = { u7: 'https://signed/u7.jpg' };
        render(<UserAvatar name="Rangi" userId="u7" />);
        expect(lookups.calls.at(-1)).toBe('u7');
        expect((screen.getByRole('img', { name: 'Rangi' }) as HTMLImageElement).src).toBe('https://signed/u7.jpg');
        lookups.byUser = {};
    });

    it('falls back to initials for people without an account photo (pickers)', () => {
        render(<UserAvatar name="Bob Picker" userId="p2" />);
        expect(screen.getByText('BP')).toBeTruthy();
    });
});
