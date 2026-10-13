/**
 * ActivityHistoryView — Role-aware activity/history panel
 * Picker: scan history, pace, earnings
 * Team Leader: team member list with stats
 * Runner: collection log
 */
import React, { useMemo } from 'react';
import { Picker } from '../../../types';
import { isPicker, isTeamLeader } from './roleUtils';

interface ActivityHistoryViewProps {
    picker: Picker;
    role: string;
    pieceRate: number;
    allCrew: Picker[];
    onBack: () => void;
}

const ActivityHistoryView: React.FC<ActivityHistoryViewProps> = React.memo(({
    picker,
    role,
    pieceRate,
    allCrew,
    onBack,
}) => {
    const earnings = picker.total_buckets_today * pieceRate;
    const speed = picker.hours && picker.hours > 0
        ? Math.round(picker.total_buckets_today / picker.hours) : 0;
    const hourlyRate = picker.hours && picker.hours > 0 ? earnings / picker.hours : 0;
    const minWage = 23.95; // NZ Minimum Wage 2026-2027
    const isAboveMinimum = hourlyRate >= minWage;

    const teamMembers = useMemo(() => {
        if (!isTeamLeader(role)) return [];
        return allCrew.filter(p => p.team_leader_id === picker.id && isPicker(p.role || 'picker'));
    }, [allCrew, picker.id, role]);

    const sectionTitle = isPicker(role) ? 'Scan History' : isTeamLeader(role) ? 'Team Activity' : 'Collection Log';

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-5">
            <div className="flex items-center gap-2 mb-4">
                <button aria-label="Back" onClick={onBack} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">arrow_back</span>
                </button>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{sectionTitle}</p>
            </div>

            {isPicker(role) ? (
                picker.total_buckets_today > 0 ? (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between mb-3 p-3 bg-indigo-50 rounded-xl">
                            <span className="text-sm font-bold text-indigo-700">Today&apos;s Total</span>
                            <span className="text-lg font-black text-indigo-700">{picker.total_buckets_today} buckets</span>
                        </div>
                        <div className="space-y-1.5">
                            <HistoryRow icon="schedule" label="Check-in" value={picker.hours ? `${picker.hours.toFixed(1)}h ago` : 'N/A'} />
                            <HistoryRow icon="pin_drop" label="Current Location" value={picker.current_row ? `Row ${picker.current_row}` : 'Not assigned'} />
                            <HistoryRow icon="speed" label="Current Pace" value={`${speed} buckets/hr — ${isAboveMinimum ? '✅ Above min wage' : '⚠️ Below min wage'}`} />
                            <HistoryRow icon="payments" label="Estimated Earnings" value={`$${earnings.toFixed(2)} (${picker.total_buckets_today} × $${pieceRate})`} />
                        </div>
                    </div>
                ) : (
                    <EmptyHistory message="No activity recorded today" sub="Scans will appear here as they happen" />
                )
            ) : isTeamLeader(role) ? (
                <div className="space-y-2">
                    <div className="flex items-center justify-between mb-3 p-3 bg-emerald-50 rounded-xl">
                        <span className="text-sm font-bold text-emerald-700">Team Summary</span>
                        <span className="text-lg font-black text-emerald-700">
                            {teamMembers.reduce((s, p) => s + (p.total_buckets_today || 0), 0)} buckets
                        </span>
                    </div>
                    {teamMembers.length > 0 ? teamMembers.map(member => (
                        <div key={member.id} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg">
                            <div className="size-8 rounded-lg bg-white flex items-center justify-center text-sm font-bold text-slate-600 border border-slate-200">
                                {member.avatar || member.name?.charAt(0) || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-700 truncate">{member.name}</p>
                                <p className="text-[11px] text-slate-500">{member.total_buckets_today} buckets • {member.hours?.toFixed(1) || '0'}h</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-bold text-slate-900">${(member.total_buckets_today * pieceRate).toFixed(0)}</p>
                            </div>
                        </div>
                    )) : (
                        <EmptyHistory message="No pickers assigned to this team" icon="group_off" />
                    )}
                </div>
            ) : (
                /* Runner activity */
                <div className="space-y-2">
                    <div className="flex items-center justify-between mb-3 p-3 bg-amber-50 rounded-xl">
                        <span className="text-sm font-bold text-amber-700">Today&apos;s Runs</span>
                        <span className="text-lg font-black text-amber-700">{picker.total_buckets_today} collected</span>
                    </div>
                    <HistoryRow icon="pin_drop" label="Current Row" value={picker.current_row ? `Row ${picker.current_row}` : 'Not assigned'} />
                    <HistoryRow icon="schedule" label="Hours On-Site" value={`${picker.hours?.toFixed(1) || '0'} hours today`} />
                </div>
            )}
        </div>
    );
});

ActivityHistoryView.displayName = 'ActivityHistoryView';

/* ── Tiny helpers ── */
const HistoryRow: React.FC<{ icon: string; label: string; value: string }> = ({ icon, label, value }) => (
    <div className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg">
        <span aria-hidden="true" className="material-symbols-outlined text-slate-400 text-[18px]">{icon}</span>
        <div className="flex-1">
            <p className="text-sm font-medium text-slate-700">{label}</p>
            <p className="text-[11px] text-slate-500">{value}</p>
        </div>
    </div>
);

const EmptyHistory: React.FC<{ message: string; sub?: string; icon?: string }> = ({ message, sub, icon = 'inbox' }) => (
    <div className="text-center py-8">
        <span aria-hidden="true" className="material-symbols-outlined text-slate-300 text-4xl mb-2">{icon}</span>
        <p className="text-slate-500 font-medium">{message}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
);

export default ActivityHistoryView;
