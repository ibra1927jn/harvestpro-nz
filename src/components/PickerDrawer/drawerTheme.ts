/**
 * drawerTheme — colores y claves de texto del panel de persona según su rol
 * y estado (lógica pura, sacada de PickerDrawer).
 */
export type DrawerRole = 'team_leader' | 'runner' | 'picker';

export interface DrawerTheme {
    headerBg: string;
    avatarBg: string;
    roleColor: string;
    /** Clave i18n del rol */
    roleLabelKey: 'panel.role.team_leader' | 'panel.role.runner' | 'panel.role.picker';
}

const THEMES: Record<DrawerRole, DrawerTheme> = {
    team_leader: {
        headerBg: 'bg-gradient-to-br from-indigo-50 to-blue-50',
        avatarBg: 'bg-gradient-to-br from-indigo-500 to-blue-600',
        roleColor: '#4f46e5',
        roleLabelKey: 'panel.role.team_leader',
    },
    runner: {
        headerBg: 'bg-gradient-to-br from-amber-50 to-orange-50',
        avatarBg: 'bg-gradient-to-br from-amber-500 to-orange-500',
        roleColor: '#d97706',
        roleLabelKey: 'panel.role.runner',
    },
    picker: {
        headerBg: 'bg-gradient-to-br from-indigo-50 to-purple-50',
        avatarBg: 'bg-gradient-to-br from-indigo-500 to-purple-500',
        roleColor: '#7c3aed',
        roleLabelKey: 'panel.role.picker',
    },
};

/** Cualquier rol que no sea team leader ni runner se muestra como picker */
export function drawerRoleOf(role: string | null | undefined): DrawerRole {
    return role === 'team_leader' || role === 'runner' ? role : 'picker';
}

export function drawerTheme(role: string | null | undefined): DrawerTheme {
    return THEMES[drawerRoleOf(role)];
}

/** Clave i18n del estado: activo, en descanso o fuera */
export function statusLabelKey(status: string): 'panel.status.active' | 'panel.status.break' | 'panel.status.away' {
    if (status === 'active') return 'panel.status.active';
    if (status === 'on_break') return 'panel.status.break';
    return 'panel.status.away';
}
