/**
 * Fotos de perfil (almacén privado "avatars", enlaces firmados con caché):
 * - useAvatarSignedUrl(ruta): la foto propia, cuya ruta ya viene en appUser.
 * - useUserAvatarUrl(idUsuario): la foto de otra cuenta (cajón de perfil,
 *   tarjetas de equipo); busca la ruta en el directorio y la firma.
 * Ambos devuelven null mientras cargan o si no hay foto (se pintan iniciales).
 */
import { useEffect, useState } from 'react';
import {
    getAvatarPathFor,
    getAvatarSignedUrl,
    peekAvatarPath,
    subscribeAvatarChanges,
} from '@/services/account/avatarCache';

export function useAvatarSignedUrl(path: string | null | undefined): string | null {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        setUrl(null);
        if (!path) return;
        void getAvatarSignedUrl(path).then(signed => {
            if (!cancelled) setUrl(signed);
        });
        return () => {
            cancelled = true;
        };
    }, [path]);
    return url;
}

export function useUserAvatarUrl(userId: string | null | undefined): string | null {
    // Ruta conocida de entrada (evita un render sin foto cuando ya está en caché)
    const [path, setPath] = useState<string | null>(() => (userId ? peekAvatarPath(userId) ?? null : null));
    useEffect(() => {
        let cancelled = false;
        if (!userId) {
            setPath(null);
            return;
        }
        setPath(peekAvatarPath(userId) ?? null);
        void getAvatarPathFor(userId).then(p => {
            if (!cancelled) setPath(p);
        });
        const unsubscribe = subscribeAvatarChanges((changedId, newPath) => {
            if (changedId === userId && !cancelled) setPath(newPath);
        });
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [userId]);
    return useAvatarSignedUrl(path);
}
