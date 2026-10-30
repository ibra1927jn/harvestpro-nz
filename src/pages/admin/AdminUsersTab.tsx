/**
 * AdminUsersTab — User management panel for Admin page
 */
import React from 'react';
import type { UserRecord } from '@/services/admin.service';
import EmptyState from '@/components/ui/EmptyState';
import ComponentErrorBoundary from '@/components/ui/ComponentErrorBoundary';
import { useTranslation } from '@/i18n';
import { roleLabel } from '@/i18n/roleLabel';
import InvitationsPanel from '@/components/common/invitations/InvitationsPanel';

// Color de cada rol (el nombre sale de roleLabel, en el idioma de la app)
const ROLE_COLORS: Record<string, string> = {
    manager: 'bg-purple-100 text-purple-700',
    team_leader: 'bg-blue-100 text-blue-700',
    runner: 'bg-green-100 text-green-700',
    qc_inspector: 'bg-amber-100 text-amber-700',
    payroll_admin: 'bg-indigo-100 text-indigo-700',
    admin: 'bg-red-100 text-red-700',
    hr_admin: 'bg-pink-100 text-pink-700',
    logistics: 'bg-sky-100 text-sky-700',
};
const ROLE_ORDER = ['manager', 'team_leader', 'runner', 'qc_inspector', 'payroll_admin', 'hr_admin', 'logistics', 'admin'];

interface AdminUsersTabProps {
    users: UserRecord[];
    userSearch: string;
    roleFilter: string;
    onSearchChange: (value: string) => void;
    onRoleFilterChange: (value: string) => void;
    onRoleChange: (userId: string, newRole: string) => void;
    onToggleActive: (user: UserRecord) => void;
    actionError?: string | null;
}

const AdminUsersTab: React.FC<AdminUsersTabProps> = ({
    users, userSearch, roleFilter,
    onSearchChange, onRoleFilterChange, onRoleChange, onToggleActive, actionError,
}) => {
    const { t } = useTranslation();
    return (
    <ComponentErrorBoundary componentName="Users">
        <div className="space-y-4">
            {/* Invitar: sin invitación nadie puede darse de alta (B1) */}
            <InvitationsPanel canInviteAdmin />
            {actionError && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{actionError}</div>
            )}
            <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                    <span aria-hidden="true" className="material-symbols-outlined text-base text-text-muted absolute left-3 top-1/2 -translate-y-1/2">search</span>
                    <input
                        type="text"
                        placeholder={t('admin.search_users_dots')}
                        value={userSearch}
                        onChange={(e) => onSearchChange(e.target.value)}
                        aria-label={t('admin.search_users')}
                        className="w-full pl-9 pr-3 py-2.5 border border-border-light rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                </div>
                <div className="relative">
                    <select
                        value={roleFilter}
                        onChange={(e) => onRoleFilterChange(e.target.value)}
                        title={t('admin.filter_role')}
                        aria-label={t('admin.filter_role')}
                        className="appearance-none bg-white border border-border-light rounded-lg px-3 py-2.5 pr-8 text-sm focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="">{t('admin.all_roles')}</option>
                        {ROLE_ORDER.map(r => <option key={r} value={r}>{roleLabel(t, r)}</option>)}
                    </select>
                    <span aria-hidden="true" className="material-symbols-outlined text-sm text-text-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</span>
                </div>
            </div>

            <div className="bg-white rounded-lg border border-border-light shadow-sm overflow-hidden">
                <div className="divide-y divide-border-light">
                    {users.map(user => {
                        const roleInfo = { label: roleLabel(t, user.role), color: ROLE_COLORS[user.role] ?? 'bg-surface-secondary text-text-primary' };
                        return (
                            <div key={user.id} className="px-4 py-3 flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${user.is_active ? 'bg-surface-secondary text-text-secondary' : 'bg-red-50 text-red-400'}`}>
                                    {user.full_name?.split(' ').map(n => n[0]).join('') || '?'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-medium truncate ${user.is_active ? 'text-text-primary' : 'text-text-muted line-through'}`}>
                                        {user.full_name || t('admin.unnamed')}
                                    </p>
                                    <p className="text-xs text-text-secondary truncate">{user.email}</p>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleInfo.color}`}>
                                    {roleInfo.label}
                                </span>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => onToggleActive(user)}
                                        title={user.is_active ? t('admin.deactivate') : t('admin.reactivate')}
                                        className={`p-1.5 rounded-md transition-colors ${user.is_active
                                            ? 'text-text-muted hover:text-red-500 hover:bg-red-50'
                                            : 'text-green-400 hover:text-green-600 hover:bg-green-50'
                                            }`}
                                    >
                                        {user.is_active ? <span aria-hidden="true" className="material-symbols-outlined text-base">person_off</span> : <span aria-hidden="true" className="material-symbols-outlined text-base">person_add</span>}
                                    </button>
                                    <select
                                        value={user.role}
                                        onChange={(e) => onRoleChange(user.id, e.target.value)}
                                        title={t('admin.change_role', { name: user.full_name ?? '' })}
                                        aria-label={t('admin.change_role', { name: user.full_name ?? '' })}
                                        className="text-xs border border-border-light rounded-md px-1.5 py-1 bg-background-light"
                                    >
                                        {ROLE_ORDER.map(r => <option key={r} value={r}>{roleLabel(t, r)}</option>)}
                                    </select>
                                </div>
                            </div>
                        );
                    })}
                    {users.length === 0 && (
                        <EmptyState icon="group" title={t('admin.no_users')} compact />
                    )}
                </div>
            </div>
        </div>
    </ComponentErrorBoundary>
    );
};

export default AdminUsersTab;
