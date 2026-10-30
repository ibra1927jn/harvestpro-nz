/**
 * Manager Navigation Configs
 * Extracted from Manager.tsx for modularity and testability.
 * @module pages/managerNav.config
 */
import type { NavTab } from '@/components/common/BottomNav';
import type { NavItem } from '@/components/common/DesktopLayout';

/** Mobile BottomNav: 5 essential tabs */
export const MOBILE_TABS: NavTab[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'teams', label: 'Teams', icon: 'groups' },
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'logistics', label: 'Logistics', icon: 'local_shipping' },
  { id: 'more', label: 'More', icon: 'apps' },
];

/** Desktop sidebar: full navigation */
export const DESKTOP_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'teams', label: 'Teams', icon: 'groups' },
  { id: 'map', label: 'Orchard Map', icon: 'map' },
  { id: 'logistics', label: 'Logistics', icon: 'local_shipping' },
  { id: 'insights', label: 'Insights', icon: 'insights' },
  // 🔜 HHRR-only: MPI Export & API Keys moved out of Manager scope
  // { id: 'mpi', label: 'MPI Export', icon: 'verified' },
  // { id: 'api-keys', label: 'API Keys', icon: 'key' },
  { id: 'messaging', label: 'Messaging', icon: 'chat' },
  { id: 'structure', label: 'Orchard setup', icon: 'grid_view' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
