/**
 * Avisos push en el service worker de la PWA.
 *
 * Lo carga el service worker de Workbox con importScripts (vite.config.ts,
 * workbox.importScripts): un solo service worker para el modo sin conexión y
 * para los avisos (antes push.service registraba este archivo como un segundo
 * service worker en el mismo ámbito y sustituía al de la PWA).
 *
 * - push: muestra el aviso (título, cuerpo, pantalla que abre). Un mensaje de
 *   chat no se muestra si la app está abierta y a la vista (ya lo ve en el chat).
 * - notificationclick: enfoca la app (y la lleva a la pantalla) o la abre.
 * - pushsubscriptionchange: el navegador renovó la suscripción; se vuelve a
 *   suscribir con la misma clave y se avisa a la app abierta para que la guarde
 *   (si está cerrada, la guarda al abrirse: notificationService.resume).
 */

/* eslint-disable no-restricted-globals */

const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

const DEFAULT_ICON = '/icons/icon-192x192.png';

/** La app está abierta y a la vista en algún sitio */
async function appIsVisible() {
    const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
    return windows.some(c => c.visibilityState === 'visible' && c.focused !== false);
}

sw.addEventListener('push', event => {
    if (!event.data) return;

    let payload;
    try {
        payload = event.data.json();
    } catch {
        payload = { title: 'HarvestPro', body: event.data.text() };
    }

    const show = async () => {
        if (payload.type === 'chat_message' && (await appIsVisible())) return;
        await sw.registration.showNotification(payload.title || 'HarvestPro', {
            body: payload.body || '',
            icon: payload.icon || DEFAULT_ICON,
            badge: DEFAULT_ICON,
            tag: payload.tag || 'harvestpro-notification',
            data: { url: payload.url || '/', type: payload.type || 'general' },
            timestamp: payload.timestamp || Date.now(),
        });
    };
    event.waitUntil(show());
});

sw.addEventListener('notificationclick', event => {
    event.notification.close();
    const target = new URL((event.notification.data && event.notification.data.url) || '/', sw.location.origin).href;

    event.waitUntil((async () => {
        const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of windows) {
            if (client.url.startsWith(sw.location.origin)) {
                await client.focus();
                if (client.url !== target && 'navigate' in client) {
                    try { await client.navigate(target); } catch { /* sin control: se queda enfocada */ }
                }
                return;
            }
        }
        await sw.clients.openWindow(target);
    })());
});

sw.addEventListener('pushsubscriptionchange', event => {
    const options = event.oldSubscription && event.oldSubscription.options;
    event.waitUntil((async () => {
        if (options && options.applicationServerKey) {
            try {
                await sw.registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: options.applicationServerKey,
                });
            } catch { /* se renueva al abrir la app */ }
        }
        const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of windows) client.postMessage({ type: 'push-subscription-changed' });
    })());
});
