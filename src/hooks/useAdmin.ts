/**
 * useAdmin — Data loading for the Admin page
 *
 * Extracts data fetching and user management actions from Admin.tsx
 * following the usePayroll pattern.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { adminService, OrchardOverview, UserRecord } from '@/services/admin.service';
import { logger } from '@/utils/logger';

export interface UseAdminResult {
    orchards: OrchardOverview[];
    users: UserRecord[];
    userSearch: string;
    roleFilter: string;
    isLoading: boolean;
    activeUsers: number;
    /** 🔧 Sprint B: Real compliance rate calculated from data (replaces hardcoded '98%') */
    complianceRate: string;
    setUserSearch: (search: string) => void;
    setRoleFilter: (filter: string) => void;
    handleRoleChange: (userId: string, newRole: string) => Promise<void>;
    handleToggleActive: (user: UserRecord) => Promise<void>;
    reload: () => Promise<void>;
    /** Último cambio que no se pudo guardar */
    actionError: string | null;
}

export function useAdmin(): UseAdminResult {
    const [orchards, setOrchards] = useState<OrchardOverview[]>([]);
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [userSearch, setUserSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [actionError, setActionError] = useState<string | null>(null);
    // Esqueleto solo en la primera carga: al buscar se cambiaba toda la página
    // por el esqueleto y la caja de búsqueda perdía el foco en cada letra
    const loadedOnce = useRef(false);

    const reload = useCallback(async () => {
        if (!loadedOnce.current) setIsLoading(true);
        try {
            const [orchardData, userData] = await Promise.all([
                adminService.getAllOrchards(),
                adminService.getAllUsers({ role: roleFilter || undefined, search: userSearch || undefined }),
            ]);
            setOrchards(orchardData);
            setUsers(userData);
        } catch (err) {
            logger.warn('[Admin] Failed to load admin data:', err);
        } finally {
            setIsLoading(false);
            loadedOnce.current = true;
        }
    }, [roleFilter, userSearch]);

    useEffect(() => {
        reload();
    }, [reload]);

    const handleRoleChange = useCallback(async (userId: string, newRole: string) => {
        setActionError(null);
        const success = await adminService.updateUserRole(userId, newRole);
        if (success) reload();
        else setActionError('Role not changed — please try again');
    }, [reload]);

    const handleToggleActive = useCallback(async (user: UserRecord) => {
        const success = user.is_active
            ? await adminService.deactivateUser(user.id)
            : await adminService.reactivateUser(user.id);
        if (success) reload();
        else setActionError(`${user.full_name}: could not ${user.is_active ? 'deactivate' : 'reactivate'} — please try again`);
    }, [reload]);

    const activeUsers = users.filter(u => u.is_active).length;

    // 🔧 Sprint B: Real compliance rate (active users / total users)
    const complianceRate = users.length > 0
        ? `${Math.round((activeUsers / users.length) * 100)}%`
        : '—';

    return {
        orchards, users, userSearch, roleFilter, isLoading, activeUsers, complianceRate,
        setUserSearch, setRoleFilter, handleRoleChange, handleToggleActive, reload, actionError,
    };
}
