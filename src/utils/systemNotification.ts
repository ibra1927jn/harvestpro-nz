/**
 * Notificación del sistema que funciona también en Android.
 * En Chrome para Android y en la app (WebView) `new Notification()` lanza un
 * error: hay que usar el service worker (registration.showNotification).
 */
import { logger } from '@/utils/logger';

export async function showSystemNotification(title: string, body: string, tag?: string): Promise<boolean> {
    try {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
        const options: NotificationOptions = { body, icon: '/pwa-192x192.png', tag };
        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) {
                await reg.showNotification(title, options);
                return true;
            }
        }
        new Notification(title, options);
        return true;
    } catch (e) {
        logger.warn('[Notify] Could not show notification:', e);
        return false;
    }
}
