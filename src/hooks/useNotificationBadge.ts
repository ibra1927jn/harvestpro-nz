/**
 * useNotificationBadge — número de la campana: mensajes de chat sin leer +
 * avisos de calidad sin ver (team leader / manager).
 */
import { useMessaging } from '@/context/MessagingContext';
import { useQcAlerts } from './useQcAlerts';

export function useNotificationBadge(): number {
    const { unreadCount } = useMessaging();
    const { unseenCount } = useQcAlerts();
    return unreadCount + unseenCount;
}
