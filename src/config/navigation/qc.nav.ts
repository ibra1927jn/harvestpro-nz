/**
 * QualityControl Navigation Config
 * Extracted from QualityControl.tsx for modularity and testability.
 */
import type { NavTab } from '@/components/common/BottomNav';
import { CHAT_NAV_ITEM } from './chat.nav';

export type QCTab = 'inspect' | 'history' | 'stats' | 'trends' | 'messaging';

export const QC_NAV_TABS: NavTab[] = [
    { id: 'inspect', label: 'Inspect', labelKey: 'nav.inspect', icon: 'nutrition' },
    { id: 'history', label: 'History', labelKey: 'nav.history', icon: 'assignment_turned_in' },
    { id: 'stats', label: 'Analytics', labelKey: 'nav.analytics', icon: 'bar_chart' },
    { id: 'trends', label: 'Trends', labelKey: 'nav.trends', icon: 'trending_up' },
    CHAT_NAV_ITEM,
];
