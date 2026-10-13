/**
 * TeamDrawer — Panel lateral con detalles de equipo: tabs Today y Members.
 * Abrir desde WeeklyReportView al hacer click en un equipo del ranking.
 */
import React, { useState, useRef } from 'react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { Picker } from '@/types';
import { TeamRanking } from '@/hooks/useWeeklyReport';

// Subconjunto de Picker necesario para mostrar miembros del equipo
type TeamMember = Pick<Picker, 'id' | 'name' | 'role' | 'status' | 'total_buckets_today'>;

export interface SelectedTeamData {
    name: string;
    ranking: TeamRanking;
    members: TeamMember[];
}

interface TeamDrawerProps {
    teamData: SelectedTeamData | null;
    onClose: () => void;
}

// Color de avatar según rol
function avatarBgForRole(role: string | undefined): string {
    if (role === 'team_leader') return 'bg-gradient-to-br from-indigo-500 to-blue-600';
    if (role === 'runner') return 'bg-gradient-to-br from-amber-500 to-orange-500';
    return 'bg-gradient-to-br from-sky-500 to-blue-500';
}

// Etiqueta legible del rol
function roleBadgeClass(role: string | undefined): string {
    if (role === 'team_leader') return 'bg-indigo-100 text-indigo-700';
    if (role === 'runner') return 'bg-amber-100 text-amber-700';
    return 'bg-sky-100 text-sky-700';
}

function roleLabel(role: string | undefined): string {
    if (role === 'team_leader') return 'TL';
    if (role === 'runner') return 'Runner';
    return 'Picker';
}

const TeamDrawer: React.FC<TeamDrawerProps> = ({ teamData, onClose }) => {
    const dialogRef = useRef<HTMLDivElement>(null);
    useDialogA11y(dialogRef, { onClose });

    const [activeTab, setActiveTab] = useState<'today' | 'members'>('today');

    // Resetear tab cuando cambia el equipo
    React.useEffect(() => {
        setActiveTab('today');
    }, [teamData?.name]);

    if (!teamData) return null;

    const { ranking, members } = teamData;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/30 z-50"
                onClick={onClose}
            />

            {/* Panel */}
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Team details" className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-white shadow-2xl z-50 overflow-y-auto animate-slide-in-right">

                {/* Header con gradiente indigo */}
                <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-5">
                    <button
                        onClick={onClose}
                        aria-label="Close team drawer"
                        className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/70 flex items-center justify-center hover:bg-white transition-colors z-10"
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-lg text-slate-600">close</span>
                    </button>

                    <div className="flex items-center gap-3 pr-10">
                        {/* Avatar con inicial */}
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-black text-lg shadow-lg flex-shrink-0">
                            {teamData.name.charAt(0)}
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-text-main">{teamData.name}</h2>
                            <p className="text-xs text-text-muted">{ranking.count} pickers</p>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="px-5 pt-4">
                    <div className="flex gap-1 bg-slate-100 rounded-full p-1">
                        <button
                            onClick={() => setActiveTab('today')}
                            className={`flex-1 py-1.5 rounded-full text-sm font-bold transition-all ${
                                activeTab === 'today'
                                    ? 'bg-white shadow text-text-main'
                                    : 'text-text-muted hover:text-text-sub'
                            }`}
                        >
                            Today
                        </button>
                        <button
                            onClick={() => setActiveTab('members')}
                            className={`flex-1 py-1.5 rounded-full text-sm font-bold transition-all ${
                                activeTab === 'members'
                                    ? 'bg-white shadow text-text-main'
                                    : 'text-text-muted hover:text-text-sub'
                            }`}
                        >
                            Members
                        </button>
                    </div>
                </div>

                {/* Contenido de tabs */}
                <div className="p-5 space-y-4">
                    {activeTab === 'today' && (
                        <TodayTab ranking={ranking} />
                    )}
                    {activeTab === 'members' && (
                        <MembersTab members={members} />
                    )}
                </div>
            </div>
        </>
    );
};

// ── Tab Today ──────────────────────────────────────────────────────────────────

interface TodayTabProps {
    ranking: TeamRanking;
}

const TodayTab: React.FC<TodayTabProps> = ({ ranking }) => (
    <div className="grid grid-cols-2 gap-3">
        <StatCard label="Bins Today" value={ranking.buckets.toString()} icon="inventory_2" iconBg="bg-sky-100 text-sky-600" />
        <StatCard label="Total Hours" value={`${ranking.hours.toFixed(1)}h`} icon="schedule" iconBg="bg-amber-100 text-amber-600" />
        <StatCard label="Labour Cost" value={`$${ranking.earnings.toFixed(0)}`} icon="payments" iconBg="bg-emerald-100 text-emerald-600" />
        <StatCard label="Bins/Hr" value={`${ranking.bpa.toFixed(1)} bins/hr`} icon="speed" iconBg="bg-purple-100 text-purple-600" />
    </div>
);

interface StatCardProps {
    label: string;
    value: string;
    icon: string;
    iconBg: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, iconBg }) => (
    <div className="bg-slate-50 rounded-2xl p-4 flex flex-col gap-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}>
            <span aria-hidden="true" className="material-symbols-outlined text-lg">{icon}</span>
        </div>
        <p className="text-[10px] text-text-muted uppercase tracking-wide font-bold">{label}</p>
        <p className="text-lg font-black text-text-main leading-none">{value}</p>
    </div>
);

// ── Tab Members ────────────────────────────────────────────────────────────────

interface MembersTabProps {
    members: TeamMember[];
}

const MembersTab: React.FC<MembersTabProps> = ({ members }) => {
    if (members.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                    <span aria-hidden="true" className="material-symbols-outlined text-3xl text-slate-300">groups</span>
                </div>
                <p className="text-sm font-bold text-text-sub">No members assigned</p>
                <p className="text-xs text-text-muted mt-1">Team member data unavailable</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {members.map(member => {
                const isActive = member.status === 'active';
                const initials = member.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

                return (
                    <div key={member.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                        {/* Avatar con iniciales */}
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-xs shadow-sm flex-shrink-0 ${avatarBgForRole(member.role ?? undefined)}`}>
                            {initials}
                        </div>

                        {/* Nombre + badge de rol */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-text-main truncate">{member.name}</span>
                                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0 ${roleBadgeClass(member.role ?? undefined)}`}>
                                    {roleLabel(member.role ?? undefined)}
                                </span>
                            </div>
                            <p className="text-xs text-text-muted">{member.total_buckets_today ?? 0} bins today</p>
                        </div>

                        {/* Status dot */}
                        <div
                            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isActive ? 'bg-emerald-400' : 'bg-slate-300'}`}
                            title={member.status}
                        />
                    </div>
                );
            })}
        </div>
    );
};

export default TeamDrawer;
