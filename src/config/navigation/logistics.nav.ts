/**
 * Logistics Navigation Config
 * Extracted from LogisticsDept.tsx for modularity and testability.
 */
import type { NavItem } from '@/components/common/DesktopLayout';
import { CHAT_NAV_ITEM } from './chat.nav';

export const LOG_NAV_ITEMS: NavItem[] = [
    { id: 'fleet', label: 'Fleet', labelKey: 'nav.fleet', icon: 'agriculture' },
    { id: 'bins', label: 'Bin Inventory', labelKey: 'nav.bins', icon: 'grid_view' },
    { id: 'requests', label: 'Requests', labelKey: 'nav.requests', icon: 'swap_horiz' },
    { id: 'history', label: 'History', labelKey: 'nav.history', icon: 'history' },
    CHAT_NAV_ITEM,
];
