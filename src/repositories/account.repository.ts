/**
 * Account Repository — «Mi cuenta»: perfil propio, escritura de la foto en el
 * almacén privado "avatars" y operaciones de auth (verificar y cambiar la
 * contraseña). Leer fotos (enlaces firmados, directorio): avatar.repository.ts.
 * Migración 20261022050000_my_account.
 */
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/services/supabase';
import { AVATARS_BUCKET } from './avatar.repository';

export { AVATARS_BUCKET };

/** Columnas de users que enseña / edita Mi cuenta */
export interface MyProfileRow {
    id: string;
    email: string | null;
    full_name: string | null;
    role: string | null;
    orchard_id: string | null;
    team_id: string | null;
    phone: string | null;
    preferred_locale: string | null;
    avatar_url: string | null;
}

/** Lo que devuelve update_my_profile() */
export interface MyProfilePatchResult {
    id: string;
    full_name: string | null;
    phone: string | null;
    preferred_locale: string | null;
    avatar_url: string | null;
}

/**
 * Cambios de perfil. `undefined` = no tocar; `null` = borrar el valor.
 * (La RPC usa NULL = no tocar y '' = borrar; la conversión se hace aquí.)
 */
export interface MyProfilePatch {
    full_name?: string;
    phone?: string | null;
    preferred_locale?: string | null;
    avatar_url?: string | null;
}

const MY_PROFILE_COLUMNS = 'id, email, full_name, role, orchard_id, team_id, phone, preferred_locale, avatar_url';

/** undefined → null (no tocar), null → '' (borrar), texto → texto */
function rpcArg(value: string | null | undefined): string | null {
    if (value === undefined) return null;
    if (value === null) return '';
    return value;
}

export const accountRepository = {
    /** Fila propia de users (RLS: id = auth.uid()) */
    async getMyProfile(userId: string): Promise<MyProfileRow | null> {
        const { data, error } = await supabase
            .from('users')
            .select(MY_PROFILE_COLUMNS)
            .eq('id', userId)
            .maybeSingle();
        if (error) throw error;
        return (data as MyProfileRow | null) ?? null;
    },

    /** Edita SOLO nombre a mostrar, teléfono, idioma y foto de la fila propia (RPC validada en BD) */
    async updateMyProfile(patch: MyProfilePatch): Promise<MyProfilePatchResult> {
        const { data, error } = await supabase.rpc('update_my_profile', {
            p_full_name: patch.full_name ?? null,
            p_phone: rpcArg(patch.phone),
            p_preferred_locale: rpcArg(patch.preferred_locale),
            p_avatar_url: rpcArg(patch.avatar_url),
        });
        if (error) throw error;
        return data as MyProfilePatchResult;
    },

    /** Sube la foto ya reducida a avatars/<uid>/… (la política solo deja la carpeta propia) */
    async uploadAvatar(path: string, blob: Blob, contentType: string): Promise<void> {
        const { error } = await supabase.storage
            .from(AVATARS_BUCKET)
            .upload(path, blob, { contentType, cacheControl: '3600', upsert: false });
        if (error) throw error;
    },

    /** Borra ficheros de foto (la anterior al cambiar, la actual al quitar). Best-effort. */
    async removeAvatarFiles(paths: string[]): Promise<void> {
        if (paths.length === 0) return;
        const { error } = await supabase.storage.from(AVATARS_BUCKET).remove(paths);
        if (error) throw error;
    },

    /**
     * ¿Es esta la contraseña actual? Se comprueba contra GoTrue SIN tocar la
     * sesión de la app: un signInWithPassword con el cliente principal
     * sustituiría la sesión (y un manager perdería el nivel aal2 del 2FA).
     * La sesión de prueba se revoca enseguida (logout con scope=local).
     */
    async verifyPassword(email: string, password: string): Promise<boolean> {
        const headers = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ email, password }),
        });
        if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 422) return false;
        if (!res.ok) throw new Error(`Password check failed (${res.status})`);
        const body = (await res.json()) as { access_token?: string };
        if (body.access_token) {
            await fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
                method: 'POST',
                headers: { ...headers, Authorization: `Bearer ${body.access_token}` },
            }).catch(() => undefined);
        }
        return true;
    },

    /** Nueva contraseña para la sesión actual */
    async updatePassword(password: string): Promise<void> {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
    },
};
