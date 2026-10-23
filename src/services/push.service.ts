/**
 * push.service.ts — Notificaciones push de este dispositivo (con la app cerrada).
 *
 * - Usa el service worker de la PWA (Workbox), que carga /sw-push.js con
 *   importScripts: muestra el aviso y abre su pantalla al tocarlo. Antes se
 *   registraba un segundo service worker en el mismo ámbito, que sustituía al de
 *   la PWA (adiós al modo sin conexión).
 * - enable(): tras el permiso (que se pide desde un toque del usuario), suscribe
 *   con VITE_VAPID_PUBLIC_KEY y guarda la suscripción (una por dispositivo).
 * - resync(): al entrar, renueva la suscripción si el navegador la cambió o la perdió.
 * - disable() / forgetDevice(): borra la fila (al desactivar y al cerrar sesión).
 * - iOS: solo con la app instalada en la pantalla de inicio (Safari 16.4+).
 * El envío lo hace el servidor (triggers → notification_outbox → send-push).
 */
import { pushRepository, type PushMuteType } from '@/repositories/push.repository';
import { logger } from '@/utils/logger';

const VAPID_PUBLIC_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';
const ENDPOINT_KEY = 'harvestpro_push_endpoint';
const READY_TIMEOUT_MS = 8000;

export type PushUnavailableReason = 'unsupported' | 'ios_needs_install' | 'not_configured' | 'denied';

export type PushEnableResult = { ok: true } | { ok: false; reason: PushUnavailableReason | 'failed' };

/** URL-safe base64 → bytes (lo que pide pushManager.subscribe) */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
    for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
}

function isIOS(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    // iPadOS se presenta como Mac con pantalla táctil
    return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
}

function isStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    const nav = navigator as Navigator & { standalone?: boolean };
    return nav.standalone === true || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
}

function isSupported(): boolean {
    return typeof window !== 'undefined'
        && typeof navigator !== 'undefined'
        && 'serviceWorker' in navigator
        && 'PushManager' in window
        && 'Notification' in window;
}

/** Por qué no se pueden recibir avisos con la app cerrada aquí (null = sí se puede) */
function unavailableReason(): PushUnavailableReason | null {
    // En iPhone/iPad, Safari solo da PushManager a la app instalada
    if (isIOS() && !isStandalone()) return 'ios_needs_install';
    if (!isSupported()) return 'unsupported';
    if (!VAPID_PUBLIC_KEY) return 'not_configured';
    if (Notification.permission === 'denied') return 'denied';
    return null;
}

function getPermissionState(): NotificationPermission | 'unsupported' {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
}

/** El service worker de la PWA (sin él, en desarrollo, no hay push) */
async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) return null;
    const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), READY_TIMEOUT_MS));
    return Promise.race([navigator.serviceWorker.ready, timeout]);
}

async function currentSubscription(): Promise<PushSubscription | null> {
    if (!isSupported()) return null;
    const reg = await readyRegistration();
    return reg ? reg.pushManager.getSubscription() : null;
}

function rememberEndpoint(endpoint: string | null): void {
    try {
        if (endpoint) localStorage.setItem(ENDPOINT_KEY, endpoint);
        else localStorage.removeItem(ENDPOINT_KEY);
    } catch { /* almacenamiento lleno o bloqueado */ }
}

function rememberedEndpoint(): string | null {
    try {
        return localStorage.getItem(ENDPOINT_KEY);
    } catch {
        return null;
    }
}

async function save(subscription: PushSubscription, muted: PushMuteType[]): Promise<boolean> {
    const json = subscription.toJSON();
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!p256dh || !auth) return false;
    const { error } = await pushRepository.register({
        endpoint: subscription.endpoint,
        keys_p256dh: p256dh,
        keys_auth: auth,
        user_agent: navigator.userAgent,
        muted_types: muted,
    });
    if (error) {
        logger.error('[PushService] Could not save the subscription:', error.message);
        return false;
    }
    // El navegador cambió la suscripción: la anterior ya no sirve
    const previous = rememberedEndpoint();
    if (previous && previous !== subscription.endpoint) await pushRepository.delete(previous);
    rememberEndpoint(subscription.endpoint);
    return true;
}

async function subscribeAndSave(muted: PushMuteType[]): Promise<boolean> {
    const reg = await readyRegistration();
    if (!reg) {
        logger.warn('[PushService] No service worker: push needs the installed/built app');
        return false;
    }
    const existing = await reg.pushManager.getSubscription();
    const subscription = existing ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    return save(subscription, muted);
}

/**
 * Activa los avisos push en este dispositivo. El permiso ya debe estar concedido
 * (Notification.requestPermission desde el toque del usuario, notification.service).
 */
async function enable(muted: PushMuteType[]): Promise<PushEnableResult> {
    const reason = unavailableReason();
    if (reason) return { ok: false, reason };
    if (Notification.permission !== 'granted') return { ok: false, reason: 'denied' };
    try {
        return (await subscribeAndSave(muted)) ? { ok: true } : { ok: false, reason: 'failed' };
    } catch (err) {
        logger.error('[PushService] Subscribe failed:', err);
        return { ok: false, reason: 'failed' };
    }
}

/** Desactiva: borra la fila y la suscripción del navegador */
async function disable(): Promise<void> {
    try {
        const subscription = await currentSubscription();
        const endpoint = subscription?.endpoint ?? rememberedEndpoint();
        if (endpoint) await pushRepository.delete(endpoint);
        await subscription?.unsubscribe();
    } catch (err) {
        logger.warn('[PushService] Unsubscribe failed:', err);
    } finally {
        rememberEndpoint(null);
    }
}

/** Al cerrar sesión (con la sesión aún válida): este móvil deja de avisar a esta cuenta */
async function forgetDevice(): Promise<void> {
    const endpoint = rememberedEndpoint();
    if (!endpoint) return;
    try {
        await pushRepository.delete(endpoint);
    } catch (err) {
        logger.warn('[PushService] Could not remove the device on sign-out:', err);
    }
}

/**
 * Al entrar con los avisos activados: si el navegador cambió o perdió la
 * suscripción, se vuelve a suscribir y se guarda (y se borra la vieja).
 */
async function resync(muted: PushMuteType[]): Promise<void> {
    if (unavailableReason() || Notification.permission !== 'granted') return;
    try {
        await subscribeAndSave(muted);
    } catch (err) {
        logger.warn('[PushService] Resync failed:', err);
    }
}

/** Cambian las casillas de tipos: el servidor deja de mandar esos */
async function setMutedTypes(muted: PushMuteType[]): Promise<void> {
    const endpoint = rememberedEndpoint();
    if (!endpoint) return;
    const { error } = await pushRepository.setMutedTypes(endpoint, muted);
    if (error) logger.warn('[PushService] Could not save notification types:', error.message);
}

/** ¿Este dispositivo tiene suscripción guardada? */
function isRegistered(): boolean {
    return rememberedEndpoint() !== null;
}

let listening = false;
/** sw-push.js avisa cuando el navegador renueva la suscripción con la app abierta */
function listenForRenewals(getMuted: () => PushMuteType[]): void {
    if (listening || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    listening = true;
    navigator.serviceWorker.addEventListener('message', event => {
        const data = event.data as { type?: string } | null;
        if (data?.type === 'push-subscription-changed') void resync(getMuted());
    });
}

/** Aviso de prueba a los dispositivos propios (send-push action test) */
async function sendTestPush(title?: string, body?: string): Promise<boolean> {
    try {
        const { supabase } = await import('@/services/supabase');
        const { error } = await supabase.functions.invoke('send-push', { body: { action: 'test', title, body } });
        return !error;
    } catch {
        return false;
    }
}

export const pushService = {
    isSupported,
    isIOS,
    isStandalone,
    unavailableReason,
    getPermissionState,
    enable,
    disable,
    forgetDevice,
    resync,
    setMutedTypes,
    isRegistered,
    listenForRenewals,
    sendTestPush,
};
