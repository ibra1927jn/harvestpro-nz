/**
 * account.service.ts — «Mi cuenta» (la misma pantalla para los 8 roles).
 *
 * - Perfil propio: nombre a mostrar, teléfono, idioma (RPC update_my_profile).
 * - Foto: se reduce en el cliente (≤ 512 px, JPEG), se sube al almacén privado
 *   "avatars" en <uid>/avatar-<ts>.jpg y se guarda la ruta en users.avatar_url.
 *   Enlaces firmados y directorio de fotos: ./account/avatarCache.ts (módulo
 *   ligero que también usan la cabecera y los cajones de perfil).
 * - Contraseña: se comprueba la actual sin tocar la sesión y se cambia la nueva.
 *
 * Todo requiere red: no se encola nada (la pantalla deshabilita Guardar sin conexión).
 */
import { logger } from '@/utils/logger';
import { Ok, Err, type Result } from '@/types/result';
import {
    accountRepository,
    type MyProfilePatch,
    type MyProfilePatchResult,
    type MyProfileRow,
} from '@/repositories/account.repository';
import {
    AVATAR_INPUT_MAX_BYTES,
    PASSWORD_MIN,
    PreferredLocaleSchema,
    ProfileDetailsSchema,
} from '@/schemas/account.schemas';
import { resizeImageToJpeg } from './account/imageResize';
import {
    forgetSignedUrl,
    getAvatarPathFor,
    getAvatarSignedUrl,
    peekAvatarPath,
    resetAvatarCaches,
    setAvatarPath,
    subscribeAvatarChanges,
} from './account/avatarCache';

export {
    getAvatarPathFor,
    getAvatarSignedUrl,
    peekAvatarPath,
    setAvatarPath,
    subscribeAvatarChanges,
    resetAvatarCaches as resetAccountCaches,
};

/** Códigos de error → la pantalla los traduce (account.error.<código en minúsculas>) */
export type AccountErrorCode =
    | 'OFFLINE'
    | 'NOT_SIGNED_IN'
    | 'INVALID_NAME'
    | 'INVALID_PHONE'
    | 'INVALID_LOCALE'
    | 'INVALID_FILE'
    | 'FILE_TOO_LARGE'
    | 'UPLOAD_FAILED'
    | 'SAVE_FAILED'
    | 'PASSWORD_TOO_SHORT'
    | 'PASSWORD_MISMATCH'
    | 'PASSWORD_SAME'
    | 'WRONG_PASSWORD'
    | 'PASSWORD_FAILED';

function isOffline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

// ─── Perfil ──────────────────────────────────────────────────────────────────

export async function getMyProfile(userId: string): Promise<Result<MyProfileRow | null>> {
    try {
        const row = await accountRepository.getMyProfile(userId);
        if (row) setAvatarPath(row.id, row.avatar_url);
        return Ok(row);
    } catch (e) {
        return Err('SAVE_FAILED', errorMessage(e), e);
    }
}

/** Nombre a mostrar y teléfono (teléfono vacío = borrar) */
export async function updateMyDetails(input: { full_name: string; phone: string }): Promise<Result<MyProfilePatchResult>> {
    if (isOffline()) return Err('OFFLINE', 'No connection');
    const parsed = ProfileDetailsSchema.safeParse(input);
    if (!parsed.success) {
        const field = parsed.error.issues[0]?.path[0];
        return Err(field === 'phone' ? 'INVALID_PHONE' : 'INVALID_NAME', parsed.error.message);
    }
    const patch: MyProfilePatch = {
        full_name: parsed.data.full_name,
        phone: parsed.data.phone === '' ? null : parsed.data.phone,
    };
    try {
        return Ok(await accountRepository.updateMyProfile(patch));
    } catch (e) {
        return Err('SAVE_FAILED', errorMessage(e), e);
    }
}

/** Idioma preferido (se guarda en la cuenta para aplicarlo al iniciar sesión en cualquier dispositivo) */
export async function updatePreferredLocale(locale: string): Promise<Result<MyProfilePatchResult>> {
    if (isOffline()) return Err('OFFLINE', 'No connection');
    if (!PreferredLocaleSchema.safeParse(locale).success) return Err('INVALID_LOCALE', `Unknown locale ${locale}`);
    try {
        return Ok(await accountRepository.updateMyProfile({ preferred_locale: locale }));
    } catch (e) {
        return Err('SAVE_FAILED', errorMessage(e), e);
    }
}

// ─── Foto ────────────────────────────────────────────────────────────────────

/** Ruta del fichero nuevo: carpeta propia (la política del almacén solo deja esa) */
export function avatarPathFor(userId: string, now: number = Date.now()): string {
    return `${userId}/avatar-${now}.jpg`;
}

/**
 * Reduce, sube y guarda la foto. Borra la anterior (best-effort).
 * Devuelve la ruta nueva guardada en users.avatar_url.
 */
export async function uploadAvatar(
    file: File,
    userId: string,
    previousPath: string | null | undefined,
): Promise<Result<string>> {
    if (isOffline()) return Err('OFFLINE', 'No connection');
    if (!file.type.startsWith('image/')) return Err('INVALID_FILE', `Not an image: ${file.type}`);
    if (file.size > AVATAR_INPUT_MAX_BYTES) return Err('FILE_TOO_LARGE', `${file.size} bytes`);

    let blob: Blob;
    try {
        blob = await resizeImageToJpeg(file);
    } catch (e) {
        return Err('INVALID_FILE', errorMessage(e), e);
    }

    const path = avatarPathFor(userId);
    try {
        await accountRepository.uploadAvatar(path, blob, 'image/jpeg');
    } catch (e) {
        return Err('UPLOAD_FAILED', errorMessage(e), e);
    }

    try {
        await accountRepository.updateMyProfile({ avatar_url: path });
    } catch (e) {
        // La fila no cambió: no dejar el fichero huérfano
        await accountRepository.removeAvatarFiles([path]).catch(() => undefined);
        return Err('SAVE_FAILED', errorMessage(e), e);
    }

    if (previousPath && previousPath !== path) {
        await accountRepository.removeAvatarFiles([previousPath]).catch(e =>
            logger.warn('[Account] Could not delete previous avatar:', errorMessage(e)));
        forgetSignedUrl(previousPath);
    }
    setAvatarPath(userId, path);
    return Ok(path);
}

/** Quita la foto: users.avatar_url = NULL y se borra el fichero (best-effort) */
export async function removeAvatar(userId: string, currentPath: string | null | undefined): Promise<Result<null>> {
    if (isOffline()) return Err('OFFLINE', 'No connection');
    try {
        await accountRepository.updateMyProfile({ avatar_url: null });
    } catch (e) {
        return Err('SAVE_FAILED', errorMessage(e), e);
    }
    if (currentPath) {
        await accountRepository.removeAvatarFiles([currentPath]).catch(e =>
            logger.warn('[Account] Could not delete avatar file:', errorMessage(e)));
        forgetSignedUrl(currentPath);
    }
    setAvatarPath(userId, null);
    return Ok(null);
}

// ─── Contraseña ──────────────────────────────────────────────────────────────

/** Comprueba la contraseña actual (sin tocar la sesión) y pone la nueva */
export async function changePassword(
    email: string,
    current: string,
    next: string,
    repeat: string,
): Promise<Result<null>> {
    if (isOffline()) return Err('OFFLINE', 'No connection');
    if (!email) return Err('NOT_SIGNED_IN', 'No email in session');
    if (next.length < PASSWORD_MIN) return Err('PASSWORD_TOO_SHORT', `min ${PASSWORD_MIN}`);
    if (next !== repeat) return Err('PASSWORD_MISMATCH', 'repeat differs');
    if (next === current) return Err('PASSWORD_SAME', 'same as current');

    let valid: boolean;
    try {
        valid = await accountRepository.verifyPassword(email, current);
    } catch (e) {
        return Err('PASSWORD_FAILED', errorMessage(e), e);
    }
    if (!valid) return Err('WRONG_PASSWORD', 'current password rejected');

    try {
        await accountRepository.updatePassword(next);
    } catch (e) {
        return Err('PASSWORD_FAILED', errorMessage(e), e);
    }
    return Ok(null);
}

export const accountService = {
    getMyProfile,
    updateMyDetails,
    updatePreferredLocale,
    uploadAvatar,
    removeAvatar,
    changePassword,
    getAvatarSignedUrl,
    getAvatarPathFor,
    peekAvatarPath,
    setAvatarPath,
    subscribeAvatarChanges,
    avatarPathFor,
    resetAccountCaches: resetAvatarCaches,
};
