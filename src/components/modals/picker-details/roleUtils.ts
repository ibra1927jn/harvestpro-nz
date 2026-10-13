/**
 * roleUtils.ts — Shared role helpers and UI config for PickerDetailsModal sub-components
 */
import React from 'react';

// ── Role type checks ──────────────────────────────────────── */
export const isPicker = (role: string) => role === 'picker';
export const isTeamLeader = (role: string) => role === 'team_leader';
export const isRunner = (role: string) => role === 'runner' || role === 'bucket_runner';

export const roleLabel = (role: string) =>
    isTeamLeader(role) ? 'Team Leader' : isRunner(role) ? 'Bucket Runner' : 'Picker';

export const roleGradient = (role: string) =>
    isTeamLeader(role)
        ? 'from-emerald-600 via-emerald-700 to-teal-700'
        : isRunner(role)
            ? 'from-amber-600 via-amber-700 to-orange-700'
            : 'from-indigo-600 via-indigo-700 to-purple-700';

export const roleIcon = (role: string) =>
    isTeamLeader(role) ? 'shield_person' : isRunner(role) ? 'local_shipping' : 'agriculture';

export interface RoleAccent {
    btn: string;
    light: string;
    focus: string;
}

export const roleAccent = (role: string): RoleAccent =>
    isTeamLeader(role)
        ? { btn: 'bg-emerald-600 hover:bg-emerald-700', light: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700', focus: 'focus:border-emerald-400 focus:ring-emerald-100' }
        : isRunner(role)
            ? { btn: 'bg-amber-600 hover:bg-amber-700', light: 'bg-amber-50 hover:bg-amber-100 text-amber-700', focus: 'focus:border-amber-400 focus:ring-amber-100' }
            : { btn: 'bg-indigo-600 hover:bg-indigo-700', light: 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700', focus: 'focus:border-indigo-400 focus:ring-indigo-100' };

// ── Status config helper ──────────────────────────────────── */
export interface StatusConfig {
    label: string;
    bg: string;
    text: string;
    dot: string;
}

export const getStatusConfig = (status: string): StatusConfig =>
    status === 'active'
        ? { label: 'Active', bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' }
        : status === 'on_break'
            ? { label: 'On Break', bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' }
            : { label: 'Inactive', bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' };

// ── Comparison Badge ──────────────────────────────────────── */
interface ComparisonBadgeProps {
    diff: number;
    suffix?: string;
    avgBaseline?: number;
}

export const ComparisonBadge: React.FC<ComparisonBadgeProps> = ({ diff, suffix = '', avgBaseline = 1 }) => {
    if (diff === 0 && avgBaseline === 0) return null;
    const isPositive = diff >= 0;
    return React.createElement('span', {
        className: `inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${isPositive ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'}`,
    },
        React.createElement('span', { 'aria-hidden': true, className: 'material-symbols-outlined text-[12px]' },
            isPositive ? 'trending_up' : 'trending_down'),
        `${isPositive ? '+' : ''}${diff}${suffix}`
    );
};

// ── Sub-view types ─────────────────────────────────────────── */
export type SubView = 'profile' | 'message' | 'history';
