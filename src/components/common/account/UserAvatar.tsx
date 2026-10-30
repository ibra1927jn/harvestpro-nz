/**
 * UserAvatar — foto de perfil o iniciales (sin servicios externos: antes se
 * pedían a ui-avatars.com, que recibía el nombre de cada persona).
 *
 * - `url`: enlace ya firmado (la foto propia, resuelta por quien la pinta).
 * - `userId`: cuenta de la app; se busca su foto en el directorio y se firma.
 *   Sin foto (o persona sin cuenta, p. ej. pickers): iniciales.
 */
import React from 'react';
import { useUserAvatarUrl } from '@/hooks/useAvatarUrl';

// Sin cn()/tailwind-merge: este componente va en la cabecera de todas las
// páginas (ruta crítica) y tailwind-merge pesa 28 KB
const join = (...parts: Array<string | undefined>) => parts.filter(Boolean).join(' ');

/** "Liam O'Connor" → "LO"; "Admin" → "A"; "" → "?" */
export function initialsOf(name: string | null | undefined): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    const letters = parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
    return letters || '?';
}

interface UserAvatarProps {
    name: string;
    /** Enlace firmado ya resuelto; null = sin foto. Si se pasa, no se consulta el directorio. */
    url?: string | null;
    /** Id de la cuenta cuya foto se busca (cuando no se pasa `url`) */
    userId?: string | null;
    /** Tamaño, forma y colores del contenedor */
    className?: string;
    /** Clases del texto de las iniciales */
    textClassName?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({ name, url, userId, className, textClassName }) => {
    const lookedUp = useUserAvatarUrl(url === undefined ? userId : null);
    const src = url === undefined ? lookedUp : url;
    const base = 'flex items-center justify-center overflow-hidden select-none flex-shrink-0';

    if (src) {
        return (
            <span className={join(base, className)}>
                <img src={src} alt={name} className="w-full h-full object-cover" draggable={false} />
            </span>
        );
    }
    return (
        <span role="img" aria-label={name} className={join(base, className)}>
            <span aria-hidden="true" className={join('font-bold leading-none', textClassName)}>
                {initialsOf(name)}
            </span>
        </span>
    );
};

export default UserAvatar;
