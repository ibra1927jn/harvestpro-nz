/**
 * account.schemas — mismos límites que update_my_profile() en la BD.
 */
import { describe, it, expect } from 'vitest';
import { PasswordChangeSchema, PreferredLocaleSchema, ProfileDetailsSchema } from './account.schemas';

describe('ProfileDetailsSchema', () => {
    it('trims and accepts a 2–80 character name with an optional phone', () => {
        const r = ProfileDetailsSchema.safeParse({ full_name: '  Ana Pérez ', phone: ' +64 21 123 456 ' });
        expect(r.success).toBe(true);
        if (r.success) expect(r.data).toEqual({ full_name: 'Ana Pérez', phone: '+64 21 123 456' });
    });

    it('rejects names shorter than 2 or longer than 80 and phones over 30', () => {
        expect(ProfileDetailsSchema.safeParse({ full_name: 'A', phone: '' }).success).toBe(false);
        expect(ProfileDetailsSchema.safeParse({ full_name: 'x'.repeat(81), phone: '' }).success).toBe(false);
        expect(ProfileDetailsSchema.safeParse({ full_name: 'Ana', phone: '1'.repeat(31) }).success).toBe(false);
        expect(ProfileDetailsSchema.safeParse({ full_name: 'Ana', phone: '1'.repeat(30) }).success).toBe(true);
    });
});

describe('PreferredLocaleSchema', () => {
    it('accepts only the app locales', () => {
        for (const code of ['en', 'es']) {
            expect(PreferredLocaleSchema.safeParse(code).success).toBe(true);
        }
        // Idiomas retirados (2026-10-21) y cualquier otro código
        for (const code of ['mi', 'sm', 'hi', 'to', 'tl', 'xx']) {
            expect(PreferredLocaleSchema.safeParse(code).success).toBe(false);
        }
        expect(PreferredLocaleSchema.safeParse('').success).toBe(false);
    });
});

describe('PasswordChangeSchema', () => {
    it('needs 8+ characters, a matching repeat and a different new password', () => {
        expect(PasswordChangeSchema.safeParse({ current: 'old', next: 'short1', repeat: 'short1' }).success).toBe(false);
        expect(PasswordChangeSchema.safeParse({ current: 'old', next: 'longenough', repeat: 'different' }).success).toBe(false);
        expect(PasswordChangeSchema.safeParse({ current: 'longenough', next: 'longenough', repeat: 'longenough' }).success).toBe(false);
        expect(PasswordChangeSchema.safeParse({ current: 'old', next: 'longenough', repeat: 'longenough' }).success).toBe(true);
    });
});
