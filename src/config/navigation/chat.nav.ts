/**
 * Pestaña de chat común a todos los roles (QC, RRHH, logística, nómina y admin
 * no la tenían: el chat solo existía para manager, team leader y runner).
 */
import type { NavItem } from '@/components/common/DesktopLayout';

export const CHAT_TAB_ID = 'messaging';

export const CHAT_NAV_ITEM: NavItem = { id: CHAT_TAB_ID, label: 'Chat', labelKey: 'nav.chat', icon: 'forum' };

/** Contador de no leídos en la pestaña de chat */
export function withChatBadge<T extends { id: string; badge?: number }>(items: T[], unread: number): T[] {
    return items.map(item => (item.id === CHAT_TAB_ID ? { ...item, badge: unread > 0 ? unread : undefined } : item));
}
