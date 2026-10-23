/**
 * account.service — foto (reducción simulada, ruta, borrado de la anterior,
 * marcha atrás), contraseña (comprueba la actual ANTES de cambiarla), cachés
 * de enlaces firmados y del directorio de fotos, y guardas sin conexión.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const repo = vi.hoisted(() => ({
    getMyProfile: vi.fn(),
    updateMyProfile: vi.fn(),
    getAvatarPaths: vi.fn(),
    uploadAvatar: vi.fn(),
    removeAvatarFiles: vi.fn(),
    createAvatarSignedUrl: vi.fn(),
    verifyPassword: vi.fn(),
    updatePassword: vi.fn(),
}));
const resize = vi.hoisted(() => ({ resizeImageToJpeg: vi.fn() }));

vi.mock('@/repositories/account.repository', () => ({ accountRepository: repo, AVATARS_BUCKET: 'avatars' }));
vi.mock('@/repositories/avatar.repository', () => ({
    avatarRepository: { getAvatarPaths: repo.getAvatarPaths, createAvatarSignedUrl: repo.createAvatarSignedUrl },
    AVATARS_BUCKET: 'avatars',
}));
vi.mock('./account/imageResize', () => ({ resizeImageToJpeg: resize.resizeImageToJpeg, AVATAR_MAX_PX: 512 }));

import {
    accountService,
    avatarPathFor,
    changePassword,
    getAvatarPathFor,
    getAvatarSignedUrl,
    removeAvatar,
    resetAccountCaches,
    setAvatarPath,
    subscribeAvatarChanges,
    updateMyDetails,
    updatePreferredLocale,
    uploadAvatar,
} from './account.service';

const png = () => new File([new Uint8Array(1024)], 'me.png', { type: 'image/png' });
const setOnline = (online: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });

beforeEach(() => {
    vi.clearAllMocks();
    resetAccountCaches();
    setOnline(true);
    resize.resizeImageToJpeg.mockResolvedValue(new Blob([new Uint8Array(200)], { type: 'image/jpeg' }));
    repo.uploadAvatar.mockResolvedValue(undefined);
    repo.removeAvatarFiles.mockResolvedValue(undefined);
    repo.updateMyProfile.mockImplementation(async (patch: Record<string, unknown>) => ({ id: 'u1', ...patch }));
});
afterEach(() => {
    setOnline(true);
    vi.useRealTimers();
});

describe('uploadAvatar', () => {
    it('resizes, uploads to the own folder, saves the path and deletes the previous file', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
        const r = await uploadAvatar(png(), 'u1', 'u1/avatar-1.jpg');
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.data).toBe('u1/avatar-1700000000000.jpg');
        expect(resize.resizeImageToJpeg).toHaveBeenCalledTimes(1);
        const [path, blob, type] = repo.uploadAvatar.mock.calls[0];
        expect(path).toBe('u1/avatar-1700000000000.jpg');
        expect(blob).toBeInstanceOf(Blob);
        expect(type).toBe('image/jpeg');
        expect(repo.updateMyProfile).toHaveBeenCalledWith({ avatar_url: 'u1/avatar-1700000000000.jpg' });
        expect(repo.removeAvatarFiles).toHaveBeenCalledWith(['u1/avatar-1.jpg']);
        // El orden importa: primero subir, luego guardar la fila, luego borrar la vieja
        expect(repo.uploadAvatar.mock.invocationCallOrder[0]).toBeLessThan(repo.updateMyProfile.mock.invocationCallOrder[0]);
        expect(repo.updateMyProfile.mock.invocationCallOrder[0]).toBeLessThan(repo.removeAvatarFiles.mock.invocationCallOrder[0]);
    });

    it('removes the uploaded file again when saving the row fails (no orphan files)', async () => {
        repo.updateMyProfile.mockRejectedValueOnce(new Error('rls'));
        const r = await uploadAvatar(png(), 'u1', null);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.error.code).toBe('SAVE_FAILED');
        expect(repo.removeAvatarFiles).toHaveBeenCalledWith([repo.uploadAvatar.mock.calls[0][0]]);
    });

    it('rejects non-images, huge files and undecodable files before touching the network', async () => {
        const txt = new File(['x'], 'a.txt', { type: 'text/plain' });
        expect((await uploadAvatar(txt, 'u1', null))).toMatchObject({ ok: false, error: { code: 'INVALID_FILE' } });
        const huge = new File([new Uint8Array(21 * 1024 * 1024)], 'big.png', { type: 'image/png' });
        expect((await uploadAvatar(huge, 'u1', null))).toMatchObject({ ok: false, error: { code: 'FILE_TOO_LARGE' } });
        resize.resizeImageToJpeg.mockRejectedValueOnce(new Error('Could not decode image'));
        expect((await uploadAvatar(png(), 'u1', null))).toMatchObject({ ok: false, error: { code: 'INVALID_FILE' } });
        expect(repo.uploadAvatar).not.toHaveBeenCalled();
    });

    it('needs a connection (nothing is queued)', async () => {
        setOnline(false);
        expect(await uploadAvatar(png(), 'u1', null)).toMatchObject({ ok: false, error: { code: 'OFFLINE' } });
        expect(await removeAvatar('u1', 'u1/a.jpg')).toMatchObject({ ok: false, error: { code: 'OFFLINE' } });
        expect(await updateMyDetails({ full_name: 'Ana', phone: '' })).toMatchObject({ ok: false, error: { code: 'OFFLINE' } });
        expect(repo.uploadAvatar).not.toHaveBeenCalled();
        expect(repo.updateMyProfile).not.toHaveBeenCalled();
    });

    it('notifies subscribers with the new path', async () => {
        const seen: Array<[string, string | null]> = [];
        const off = subscribeAvatarChanges((id, p) => seen.push([id, p]));
        await uploadAvatar(png(), 'u1', null);
        await removeAvatar('u1', 'u1/avatar-x.jpg');
        off();
        expect(seen[0][0]).toBe('u1');
        expect(seen[0][1]).toMatch(/^u1\/avatar-\d+\.jpg$/);
        expect(seen[1]).toEqual(['u1', null]);
        expect(repo.updateMyProfile).toHaveBeenLastCalledWith({ avatar_url: null });
        expect(repo.removeAvatarFiles).toHaveBeenLastCalledWith(['u1/avatar-x.jpg']);
    });

    it('avatarPathFor keeps the file inside the user folder', () => {
        expect(avatarPathFor('abc', 5)).toBe('abc/avatar-5.jpg');
    });
});

describe('updateMyDetails / updatePreferredLocale', () => {
    it('validates like the database function and clears an empty phone', async () => {
        expect(await updateMyDetails({ full_name: 'A', phone: '' })).toMatchObject({ ok: false, error: { code: 'INVALID_NAME' } });
        expect(await updateMyDetails({ full_name: 'Ana', phone: 'x'.repeat(31) })).toMatchObject({ ok: false, error: { code: 'INVALID_PHONE' } });
        const r = await updateMyDetails({ full_name: '  Ana Pérez ', phone: '  ' });
        expect(r.ok).toBe(true);
        expect(repo.updateMyProfile).toHaveBeenCalledWith({ full_name: 'Ana Pérez', phone: null });
    });

    it('saves only known locales', async () => {
        // Idioma retirado (2026-10-21) y código desconocido
        expect(await updatePreferredLocale('to')).toMatchObject({ ok: false, error: { code: 'INVALID_LOCALE' } });
        expect(await updatePreferredLocale('xx')).toMatchObject({ ok: false, error: { code: 'INVALID_LOCALE' } });
        expect(await updatePreferredLocale('es')).toMatchObject({ ok: true });
        expect(repo.updateMyProfile).toHaveBeenCalledWith({ preferred_locale: 'es' });
        expect(await updatePreferredLocale('fr')).toMatchObject({ ok: true });
        expect(repo.updateMyProfile).toHaveBeenCalledWith({ preferred_locale: 'fr' });
    });
});

describe('changePassword', () => {
    it('verifies the current password BEFORE updating, without touching the session', async () => {
        repo.verifyPassword.mockResolvedValue(true);
        repo.updatePassword.mockResolvedValue(undefined);
        const r = await changePassword('a@b.nz', 'oldpass123', 'newpass123', 'newpass123');
        expect(r.ok).toBe(true);
        expect(repo.verifyPassword).toHaveBeenCalledWith('a@b.nz', 'oldpass123');
        expect(repo.updatePassword).toHaveBeenCalledWith('newpass123');
        expect(repo.verifyPassword.mock.invocationCallOrder[0]).toBeLessThan(repo.updatePassword.mock.invocationCallOrder[0]);
    });

    it('does not change anything when the current password is wrong', async () => {
        repo.verifyPassword.mockResolvedValue(false);
        const r = await changePassword('a@b.nz', 'bad', 'newpass123', 'newpass123');
        expect(r).toMatchObject({ ok: false, error: { code: 'WRONG_PASSWORD' } });
        expect(repo.updatePassword).not.toHaveBeenCalled();
    });

    it('checks length, repeat and sameness locally first', async () => {
        expect(await changePassword('a@b.nz', 'old', 'short', 'short')).toMatchObject({ ok: false, error: { code: 'PASSWORD_TOO_SHORT' } });
        expect(await changePassword('a@b.nz', 'old', 'newpass123', 'other')).toMatchObject({ ok: false, error: { code: 'PASSWORD_MISMATCH' } });
        expect(await changePassword('a@b.nz', 'samepass1', 'samepass1', 'samepass1')).toMatchObject({ ok: false, error: { code: 'PASSWORD_SAME' } });
        expect(await changePassword('', 'old', 'newpass123', 'newpass123')).toMatchObject({ ok: false, error: { code: 'NOT_SIGNED_IN' } });
        expect(repo.verifyPassword).not.toHaveBeenCalled();
    });
});

describe('signed URL cache', () => {
    it('signs once per path and reuses the link for 50 minutes', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-22T08:00:00+13:00'));
        repo.createAvatarSignedUrl.mockResolvedValue('https://signed/1');
        expect(await getAvatarSignedUrl('u1/a.jpg')).toBe('https://signed/1');
        expect(await getAvatarSignedUrl('u1/a.jpg')).toBe('https://signed/1');
        expect(repo.createAvatarSignedUrl).toHaveBeenCalledTimes(1);
        expect(repo.createAvatarSignedUrl).toHaveBeenCalledWith('u1/a.jpg', 3600);
        vi.setSystemTime(new Date('2026-10-22T08:51:00+13:00'));
        repo.createAvatarSignedUrl.mockResolvedValue('https://signed/2');
        expect(await getAvatarSignedUrl('u1/a.jpg')).toBe('https://signed/2');
        expect(repo.createAvatarSignedUrl).toHaveBeenCalledTimes(2);
    });

    it('returns null (initials) when signing fails or there is no path', async () => {
        repo.createAvatarSignedUrl.mockRejectedValue(new Error('403'));
        expect(await getAvatarSignedUrl('u1/a.jpg')).toBeNull();
        expect(await getAvatarSignedUrl(null)).toBeNull();
    });
});

describe('avatar directory', () => {
    it('batches lookups of the same tick into one query and caches the answer', async () => {
        repo.getAvatarPaths.mockResolvedValue({ u1: 'u1/a.jpg' });
        const [a, b, c] = await Promise.all([getAvatarPathFor('u1'), getAvatarPathFor('u2'), getAvatarPathFor('u1')]);
        expect([a, b, c]).toEqual(['u1/a.jpg', null, 'u1/a.jpg']);
        expect(repo.getAvatarPaths).toHaveBeenCalledTimes(1);
        expect(repo.getAvatarPaths.mock.calls[0][0].sort()).toEqual(['u1', 'u2']);
        expect(await getAvatarPathFor('u2')).toBeNull();
        expect(repo.getAvatarPaths).toHaveBeenCalledTimes(1);
    });

    it('setAvatarPath overrides the directory (own photo just changed) and offline returns null without querying', async () => {
        setAvatarPath('u9', 'u9/new.jpg');
        expect(await getAvatarPathFor('u9')).toBe('u9/new.jpg');
        setOnline(false);
        expect(await getAvatarPathFor('u3')).toBeNull();
        expect(repo.getAvatarPaths).not.toHaveBeenCalled();
    });

    it('exposes everything through accountService', () => {
        expect(typeof accountService.uploadAvatar).toBe('function');
        expect(typeof accountService.changePassword).toBe('function');
    });
});
