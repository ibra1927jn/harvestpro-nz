/**
 * Admin Navigation Config
 * Extracted from Admin.tsx for modularity and testability.
 */
import type { NavItem } from '@/components/common/DesktopLayout';
import { CHAT_NAV_ITEM } from './chat.nav';

export type AdminTab = 'orchards' | 'users' | 'compliance' | 'audit' | 'messaging';

export const ADMIN_NAV_ITEMS: NavItem[] = [
    { id: 'orchards', label: 'Orchards', labelKey: 'nav.orchards', icon: 'apartment' },
    { id: 'users', label: 'Users', labelKey: 'nav.users', icon: 'group' },
    { id: 'compliance', label: 'Compliance', labelKey: 'nav.compliance', icon: 'monitoring' },
    { id: 'audit', label: 'Audit Log', labelKey: 'nav.audit', icon: 'shield' },
    CHAT_NAV_ITEM,
];

export const ADMIN_SUMMARY_CARDS = [
    { icon: 'apartment', color: 'text-emerald-500', label: 'Orchards', key: 'orchards' },
    { icon: 'group', color: 'text-indigo-500', label: 'Active Users', key: 'active' },
    { icon: 'people', color: 'text-amber-500', label: 'Total Users', key: 'total' },
    { icon: 'verified', color: 'text-green-500', label: 'Compliance', key: 'compliance' },
] as const;
