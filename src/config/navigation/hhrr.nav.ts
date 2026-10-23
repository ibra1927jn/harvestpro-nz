/**
 * HHRR Navigation Config
 * Extracted from HHRR.tsx for modularity and testability.
 */
import type { NavItem } from '@/components/common/DesktopLayout';
import { CHAT_NAV_ITEM } from './chat.nav';

export const HR_NAV_ITEMS: NavItem[] = [
    { id: 'employees', label: 'Employees', labelKey: 'nav.employees', icon: 'group' },
    { id: 'contracts', label: 'Contracts', labelKey: 'nav.contracts', icon: 'description' },
    { id: 'payroll', label: 'Payroll', labelKey: 'nav.payroll', icon: 'payments' },
    { id: 'documents', label: 'Documents', labelKey: 'nav.documents', icon: 'folder' },
    { id: 'calendar', label: 'Calendar', labelKey: 'nav.calendar', icon: 'calendar_month' },
    { id: 'planning', label: 'Planning', labelKey: 'nav.planning', icon: 'analytics' },
    CHAT_NAV_ITEM,
];
