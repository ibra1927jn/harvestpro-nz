/**
 * useNotificationBadge — número de la campana: mensajes de chat sin leer +
 * avisos del huerto sin confirmar (la RLS ya da solo los dirigidos a mi rol;
 * al llegar uno en vivo el número sube) + avisos de calidad sin ver.
 */
import { useMessaging } from '@/context/MessagingContext';
import { useQcAlerts } from './useQcAlerts';
import { useAuth } from '@/context/AuthContext';
import { countUnreadBroadcasts } from '@/services/broadcastAudience';

export function useNotificationBadge(): number {
    const { unreadCount, broadcasts } = useMessaging();
    const { appUser } = useAuth();
    const { unseenCount } = useQcAlerts();
    return unreadCount + countUnreadBroadcasts(broadcasts, appUser?.id) + unseenCount;
}
