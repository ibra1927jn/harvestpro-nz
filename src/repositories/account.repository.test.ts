/**
 * account.repository — mapeo de la RPC update_my_profile (undefined = no tocar,
 * null = borrar), lotes del directorio de fotos y comprobación de contraseña
 * sin tocar la sesión.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/supabase', () => {
    const rpc = vi.fn();
    const from = vi.fn();
    const storage = { from: vi.fn() };
    const auth = { updateUser: vi.fn() };
    return {
        supabase: { rpc, from, storage, auth },
        SUPABASE_URL: 'https://db.example',
        SUPABASE_ANON_KEY: 'anon-key',
    };
});

import { supabase } from '@/services/supabase';
import { accountRepository } from './account.repository';
import { avatarRepository } from './avatar.repository';

const sb = supabase as unknown as {
    rpc: ReturnType<typeof vi.fn>;
    from: ReturnType<typeof vi.fn>;
    storage: { from: ReturnType<typeof vi.fn> };
    auth: { updateUser: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
    vi.clearAllMocks();
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe('updateMyProfile', () => {
    it('maps undefined → NULL (keep) and null → "" (clear) for the RPC', async () => {
        sb.rpc.mockResolvedValue({ data: { id: 'u1', full_name: 'Ana', phone: null, preferred_locale: 'es', avatar_url: null }, error: null });
        const r = await accountRepository.updateMyProfile({ full_name: 'Ana', phone: null, preferred_locale: 'es' });
        expect(sb.rpc).toHaveBeenCalledWith('update_my_profile', {
            p_full_name: 'Ana',
            p_phone: '',
            p_preferred_locale: 'es',
            p_avatar_url: null,
        });
        expect(r.full_name).toBe('Ana');
    });

    it('throws the RPC error (validation lives in the database)', async () => {
        sb.rpc.mockResolvedValue({ data: null, error: { message: 'Display name must be 2 to 80 characters' } });
        await expect(accountRepository.updateMyProfile({ full_name: 'A' })).rejects.toBeTruthy();
    });
});

describe('getAvatarPaths', () => {
    it('queries users in chunks of 100 ids and merges the answers', async () => {
        const inFn = vi.fn().mockImplementation((_col: string, ids: string[]) =>
            Promise.resolve({ data: ids.filter(id => id === 'u1' || id === 'u150').map(id => ({ id, avatar_url: `${id}/a.jpg` })), error: null }));
        sb.from.mockReturnValue({ select: () => ({ in: inFn }) });
        const ids = Array.from({ length: 150 }, (_, i) => `u${i + 1}`);
        const out = await avatarRepository.getAvatarPaths(ids);
        expect(inFn).toHaveBeenCalledTimes(2);
        expect(inFn.mock.calls[0][1]).toHaveLength(100);
        expect(inFn.mock.calls[1][1]).toHaveLength(50);
        expect(out).toEqual({ u1: 'u1/a.jpg', u150: 'u150/a.jpg' });
    });
});

describe('storage', () => {
    it('uploads without overwriting and signs from the avatars bucket', async () => {
        const upload = vi.fn().mockResolvedValue({ error: null });
        const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://s/1' }, error: null });
        const remove = vi.fn().mockResolvedValue({ error: null });
        sb.storage.from.mockReturnValue({ upload, createSignedUrl, remove });
        const blob = new Blob(['x'], { type: 'image/jpeg' });
        await accountRepository.uploadAvatar('u1/avatar-1.jpg', blob, 'image/jpeg');
        expect(sb.storage.from).toHaveBeenCalledWith('avatars');
        expect(upload).toHaveBeenCalledWith('u1/avatar-1.jpg', blob, expect.objectContaining({ contentType: 'image/jpeg', upsert: false }));
        expect(await avatarRepository.createAvatarSignedUrl('u1/avatar-1.jpg', 3600)).toBe('https://s/1');
        await accountRepository.removeAvatarFiles([]);
        expect(remove).not.toHaveBeenCalled();
        await accountRepository.removeAvatarFiles(['u1/avatar-1.jpg']);
        expect(remove).toHaveBeenCalledWith(['u1/avatar-1.jpg']);
    });
});

describe('verifyPassword', () => {
    it('checks the credentials against GoTrue and revokes the probe session (never the app session)', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'probe-token' }) })
            .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) });
        vi.stubGlobal('fetch', fetchMock);
        expect(await accountRepository.verifyPassword('a@b.nz', 'secret12')).toBe(true);
        expect(fetchMock.mock.calls[0][0]).toBe('https://db.example/auth/v1/token?grant_type=password');
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'a@b.nz', password: 'secret12' });
        expect(fetchMock.mock.calls[1][0]).toBe('https://db.example/auth/v1/logout?scope=local');
        expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer probe-token');
        expect(sb.auth.updateUser).not.toHaveBeenCalled();
    });

    it('returns false on a rejected password and throws on server errors', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) }));
        expect(await accountRepository.verifyPassword('a@b.nz', 'nope')).toBe(false);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));
        await expect(accountRepository.verifyPassword('a@b.nz', 'nope')).rejects.toThrow(/503/);
    });

    it('updatePassword uses the app session', async () => {
        sb.auth.updateUser.mockResolvedValue({ error: null });
        await accountRepository.updatePassword('newpass123');
        expect(sb.auth.updateUser).toHaveBeenCalledWith({ password: 'newpass123' });
    });
});
