import { logger } from '@/utils/logger';
import { todayNZST, nzMidnight } from '@/utils/nzst';
import { showSystemNotification } from '@/utils/systemNotification';
/**
 * notification.service.ts — Web Push Notifications for HarvestPro
 *
 * Uses the Notification API for local browser notifications.
 * Supports: permission requests, sending notifications, and periodic alert checks.
 */

type AlertType = 'visa_expiry' | 'qc_reject' | 'transport' | 'attendance';

interface NotificationPrefs {
    enabled: boolean;
    types: Record<AlertType, boolean>;
}

const STORAGE_KEY = 'harvestpro_notification_prefs';
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

let checkTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Get current notification preferences from localStorage
 */
function getPrefs(): NotificationPrefs {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) { logger.warn('[NotificationService] Failed to parse prefs:', e); }
    return {
        enabled: false,
        types: {
            visa_expiry: true,
            qc_reject: true,
            transport: true,
            attendance: true,
        },
    };
}

/**
 * Save notification preferences
 */
function savePrefs(prefs: NotificationPrefs): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

/**
 * Request notification permission from the browser
 */
async function requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
        logger.warn('[NotificationService] Notifications not supported');
        return false;
    }

    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;

    const result = await Notification.requestPermission();
    return result === 'granted';
}

/**
 * Send a local browser notification
 */
function sendNotification(
    title: string,
    body: string,
    options?: {
        icon?: string;
        tag?: string;
        data?: Record<string, unknown>;
    },
): Notification | null {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
        logger.warn('[NotificationService] Permission not granted');
        return null;
    }

    try {
        const notif = new Notification(title, {
            body,
            icon: options?.icon || '/cherry-icon.png',
            badge: '/cherry-icon.png',
            tag: options?.tag,
            data: options?.data,
            silent: false,
        });

        notif.onclick = () => {
            window.focus();
            notif.close();
        };

        // Auto-close after 10 seconds
        setTimeout(() => notif.close(), 10000);

        return notif;
    } catch (err) {
        // Android/WebView: new Notification() no está permitido → service worker
        void showSystemNotification(title, body, options?.tag);
        logger.error('[NotificationService] Failed to send:', err);
        return null;
    }
}

/**
 * Check for pending alerts and fire notifications
 * This is called periodically when notifications are enabled.
 */
async function checkAlerts(): Promise<void> {
    const prefs = getPrefs();
    if (!prefs.enabled) return;

    try {
        const { supabase } = await import('./supabase');
        const now = new Date();

        // 1. Visa expiry check (within 7 days)
        if (prefs.types.visa_expiry) {
            // Visados: documentos "Work Visa" de RRHH (users.visa_expiry no existe)
            const today = todayNZST();
            const in7 = new Date(now.getTime() + 7 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
            const { data: expiring } = await supabase
                .from('hr_documents')
                .select('id, title, expires_at')
                .eq('document_type', 'work_visa')
                .is('deleted_at', null)
                .gte('expires_at', today)
                .lte('expires_at', in7)
                .limit(5);

            expiring?.forEach((d: { id: string; title: string; expires_at: string }) => {
                const days = Math.round((Date.parse(d.expires_at) - Date.parse(today)) / 86400000);
                sendNotification(
                    '⚠️ Visa Expiry Alert',
                    `${d.title}: expires in ${days} day${days !== 1 ? 's' : ''}`,
                    { tag: `visa-${d.id}` },
                );
            });
        }

        // 2. QC reject rate check (>15% today)
        if (prefs.types.qc_reject) {
            // 🔧 V15: Use NZST date, not UTC — prevents off-by-one day near midnight
            const today = todayNZST();
            const { data: inspections } = await supabase
                .from('qc_inspections')
                .select('grade')
                // Medianoche NZ con su desfase (sin él, Postgres lo leía como UTC)
                .gte('created_at', nzMidnight(today))
                .limit(200);

            if (inspections && inspections.length >= 10) {
                const rejects = inspections.filter((i: { grade: string }) => i.grade === 'reject').length;
                const rate = rejects / inspections.length;
                if (rate > 0.15) {
                    sendNotification(
                        '🔴 QC Alert: High Reject Rate',
                        `Reject rate is ${Math.round(rate * 100)}% today (${rejects}/${inspections.length})`,
                        { tag: `qc-reject-${today}` },
                    );
                }
            }
        }

        // 3. Transport requests unacknowledged > 30 min
        if (prefs.types.transport) {
            const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
            const { data: pending } = await supabase
                .from('transport_requests')
                .select('id, created_at')
                .eq('status', 'pending')
                .lte('created_at', thirtyMinAgo.toISOString())
                .limit(3);

            if (pending && pending.length > 0) {
                sendNotification(
                    '🚛 Pending Transport',
                    `${pending.length} transport request${pending.length > 1 ? 's' : ''} waiting >30 min`,
                    { tag: 'transport-pending' },
                );
            }
        }
    } catch (err) {
        logger.error('[NotificationService] Alert check failed:', err);
    }
}

/**
 * Start periodic alert checking
 */
function startChecking(): void {
    stopChecking();
    checkTimer = setInterval(checkAlerts, CHECK_INTERVAL);
    // Run immediately on start
    checkAlerts();
}

/**
 * Stop periodic alert checking
 */
function stopChecking(): void {
    if (checkTimer) {
        clearInterval(checkTimer);
        checkTimer = null;
    }
}

/**
 * Enable or disable notifications
 */
async function setEnabled(enabled: boolean): Promise<boolean> {
    const prefs = getPrefs();

    if (enabled) {
        const granted = await requestPermission();
        if (!granted) return false;
        prefs.enabled = true;
        savePrefs(prefs);
        startChecking();
        return true;
    } else {
        prefs.enabled = false;
        savePrefs(prefs);
        stopChecking();
        return true;
    }
}

/**
 * Update which alert types to receive
 */
function setAlertTypes(types: Partial<Record<AlertType, boolean>>): void {
    const prefs = getPrefs();
    prefs.types = { ...prefs.types, ...types };
    savePrefs(prefs);
}

/**
 * Send a test notification
 */
function sendTest(): Notification | null {
    return sendNotification(
        '🍒 HarvestPro Test',
        'Notifications are working! You\'ll receive alerts for visa expiry, QC issues, and transport requests.',
        { tag: 'test' },
    );
}

export const notificationService = {
    requestPermission,
    sendNotification,
    getPrefs,
    setEnabled,
    setAlertTypes,
    sendTest,
    startChecking,
    stopChecking,
    checkAlerts,
};
