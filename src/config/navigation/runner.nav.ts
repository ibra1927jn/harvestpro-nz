/**
 * Runner Navigation Config
 * Extracted from Runner.tsx for modularity and testability.
 */
import type { NavTab } from '@/components/common/BottomNav';

export type RunnerTab = 'logistics' | 'runners' | 'warehouse' | 'messaging' | 'timesheet';

export const RUNNER_NAV_TABS: NavTab[] = [
    { id: 'logistics', label: 'Logistics', labelKey: 'nav.logistics', icon: 'local_shipping' },
    { id: 'runners', label: 'Runners', labelKey: 'nav.runners', icon: 'groups' },
    { id: 'warehouse', label: 'Warehouse', labelKey: 'nav.warehouse', icon: 'warehouse' },
    { id: 'timesheet', label: 'Timesheet', labelKey: 'nav.timesheet', icon: 'schedule' },
    { id: 'messaging', label: 'Chat', labelKey: 'nav.chat', icon: 'forum' },
];
