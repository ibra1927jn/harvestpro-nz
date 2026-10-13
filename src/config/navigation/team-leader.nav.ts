/**
 * TeamLeader Navigation Config
 * Extracted from TeamLeader.tsx for modularity and testability.
 */
import type { NavTab } from '@/components/common/BottomNav';

export type TeamLeaderTab = 'home' | 'team' | 'tasks' | 'profile' | 'chat' | 'attendance' | 'timesheet';

export const TEAM_LEADER_NAV_TABS: NavTab[] = [
    { id: 'home', label: 'Home', labelKey: 'nav.home', icon: 'home' },
    { id: 'attendance', label: 'Roll Call', labelKey: 'nav.roll_call', icon: 'fact_check' },
    { id: 'tasks', label: 'Map', labelKey: 'nav.tasks_map', icon: 'strategy' },
    { id: 'timesheet', label: 'Timesheet', labelKey: 'nav.timesheet', icon: 'schedule' },
    { id: 'chat', label: 'Chat', labelKey: 'nav.chat', icon: 'forum' },
];
