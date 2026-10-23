/**
 * Avatar Repository — lectura de fotos de perfil (almacén privado "avatars").
 * Módulo aparte y pequeño porque lo cargan la cabecera y los cajones de perfil
 * de todas las páginas; escribir (subir, borrar, guardar la ruta) está en
 * account.repository.ts, que solo carga la pantalla «Mi cuenta».
 */
import { supabase } from '@/services/supabase';

export const AVATARS_BUCKET = 'avatars';

/** Más de ~100 ids en un .in() dan URL demasiado larga (414) */
const IN_CHUNK = 100;

export const avatarRepository = {
    /** Rutas de foto de varias cuentas (cajones de perfil, tarjetas de equipo) */
    async getAvatarPaths(userIds: string[]): Promise<Record<string, string | null>> {
        const out: Record<string, string | null> = {};
        for (let i = 0; i < userIds.length; i += IN_CHUNK) {
            const chunk = userIds.slice(i, i + IN_CHUNK);
            const { data, error } = await supabase
                .from('users')
                .select('id, avatar_url')
                .in('id', chunk);
            if (error) throw error;
            for (const row of (data ?? []) as { id: string; avatar_url: string | null }[]) {
                out[row.id] = row.avatar_url;
            }
        }
        return out;
    },

    /** Enlace firmado para mostrar una foto del almacén privado */
    async createAvatarSignedUrl(path: string, expiresInSec: number): Promise<string> {
        const { data, error } = await supabase.storage
            .from(AVATARS_BUCKET)
            .createSignedUrl(path, expiresInSec);
        if (error) throw error;
        return data.signedUrl;
    },
};
