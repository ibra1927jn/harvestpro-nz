/**
 * Fotos de perfil: enlaces firmados con caché y directorio «id de usuario → ruta».
 *
 * Módulo pequeño y sin zod a propósito: lo importan la cabecera y los cajones de
 * perfil (ruta crítica del runner); el resto de «Mi cuenta» vive en
 * account.service.ts y se carga al abrir la pantalla.
 *
 * - Las firmadas duran 60 min: se reutilizan 50 y se vuelven a pedir antes de caducar.
 * - El directorio junta las peticiones del mismo tick en una consulta y avisa a
 *   los componentes cuando la foto propia cambia (subir / quitar).
 */
import { logger } from '@/utils/logger';
import { avatarRepository } from '@/repositories/avatar.repository';

const SIGNED_URL_SECONDS = 60 * 60;
const SIGNED_CACHE_MS = 50 * 60 * 1000;
/** Ruta de foto por usuario: suficiente para una sesión de trabajo sin repetir consultas */
const DIRECTORY_CACHE_MS = 10 * 60 * 1000;
/** Si la consulta falla (sin red), no se insiste durante un minuto */
const DIRECTORY_FAIL_MS = 60 * 1000;

function isOffline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

// ─── Enlaces firmados ────────────────────────────────────────────────────────

const signedCache = new Map<string, { url: string; expiresAt: number }>();
const signedInflight = new Map<string, Promise<string | null>>();

/** Enlace firmado de una ruta del almacén "avatars" (null si no se puede firmar) */
export function getAvatarSignedUrl(path: string | null | undefined): Promise<string | null> {
    if (!path) return Promise.resolve(null);
    const hit = signedCache.get(path);
    if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.url);
    const pending = signedInflight.get(path);
    if (pending) return pending;
    const p = avatarRepository
        .createAvatarSignedUrl(path, SIGNED_URL_SECONDS)
        .then(url => {
            signedCache.set(path, { url, expiresAt: Date.now() + SIGNED_CACHE_MS });
            return url;
        })
        .catch(e => {
            logger.warn('[Account] Could not sign avatar URL:', errorMessage(e));
            return null;
        })
        .finally(() => signedInflight.delete(path));
    signedInflight.set(path, p);
    return p;
}

/** Olvida el enlace firmado de una ruta (el fichero se borró) */
export function forgetSignedUrl(path: string): void {
    signedCache.delete(path);
}

// ─── Directorio: ruta de foto por id de usuario ──────────────────────────────

interface DirectoryEntry {
    path: string | null;
    expiresAt: number;
}
const directory = new Map<string, DirectoryEntry>();
const directoryWaiters = new Map<string, Array<(path: string | null) => void>>();
let directoryFlush: ReturnType<typeof setTimeout> | null = null;

type AvatarListener = (userId: string, path: string | null) => void;
const listeners = new Set<AvatarListener>();

/** Avisa cuando cambia la foto de alguien (la propia, tras subir o quitar) */
export function subscribeAvatarChanges(listener: AvatarListener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Ruta conocida de la foto de una cuenta (sin pedirla al servidor); undefined = no se sabe */
export function peekAvatarPath(userId: string): string | null | undefined {
    const hit = directory.get(userId);
    return hit && hit.expiresAt > Date.now() ? hit.path : undefined;
}

/** Fija la ruta de foto de una cuenta en el directorio y avisa a quien la enseña */
export function setAvatarPath(userId: string, path: string | null): void {
    directory.set(userId, { path, expiresAt: Date.now() + DIRECTORY_CACHE_MS });
    listeners.forEach(fn => fn(userId, path));
}

async function flushDirectory(): Promise<void> {
    directoryFlush = null;
    const ids = Array.from(directoryWaiters.keys());
    const waiters = new Map(directoryWaiters);
    directoryWaiters.clear();
    let paths: Record<string, string | null> = {};
    let failed = false;
    try {
        paths = await avatarRepository.getAvatarPaths(ids);
    } catch (e) {
        failed = true;
        logger.warn('[Account] Could not load avatar directory:', errorMessage(e));
    }
    const ttl = failed ? DIRECTORY_FAIL_MS : DIRECTORY_CACHE_MS;
    for (const id of ids) {
        const path = paths[id] ?? null;
        directory.set(id, { path, expiresAt: Date.now() + ttl });
        waiters.get(id)?.forEach(fn => fn(path));
    }
}

/**
 * Ruta de la foto de una cuenta (null si no tiene o no es una cuenta de la app).
 * Las peticiones del mismo tick se juntan en una consulta.
 */
export function getAvatarPathFor(userId: string | null | undefined): Promise<string | null> {
    if (!userId) return Promise.resolve(null);
    const known = peekAvatarPath(userId);
    if (known !== undefined) return Promise.resolve(known);
    if (isOffline()) return Promise.resolve(null);
    return new Promise(resolve => {
        const list = directoryWaiters.get(userId) ?? [];
        list.push(resolve);
        directoryWaiters.set(userId, list);
        if (!directoryFlush) directoryFlush = setTimeout(() => void flushDirectory(), 0);
    });
}

/** Tests: vacía las cachés del módulo */
export function resetAvatarCaches(): void {
    signedCache.clear();
    signedInflight.clear();
    directory.clear();
    directoryWaiters.clear();
    if (directoryFlush) clearTimeout(directoryFlush);
    directoryFlush = null;
}
