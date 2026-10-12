import React, { useState, useMemo } from 'react';
import { Picker, HarvestSettings } from '../../../types';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { avatarUrl } from '@/utils/avatarUrl';
import { logger } from '@/utils/logger';
import { useTranslation } from '@/i18n';
import { ElsewhereBadge } from '@/components/common/ElsewhereBadge';

interface TeamLeaderCardProps {
    leader: Picker;
    crew: Picker[];
    onSelectUser: (user: Picker) => void;
    settings: HarvestSettings | null;
    staggerIndex?: number;
    onRemoveUser?: (userId: string) => Promise<void>;
}

const TeamLeaderCard: React.FC<TeamLeaderCardProps> = ({ leader, crew, onSelectUser, settings, staggerIndex = 0, onRemoveUser }) => {
    const { t } = useTranslation();
    const [isExpanded, setIsExpanded] = useState(false);
    const [unlinking, setUnlinking] = useState<string | null>(null);
    const [confirmId, setConfirmId] = useState<string | null>(null);

    // Get all rows this leader is assigned to from rowAssignments
    const rowAssignments = useHarvestStore(s => s.rowAssignments);
    const leaderRows = useMemo(() => {
        const rows = rowAssignments
            .filter(ra => ra.assigned_pickers.includes(leader.id))
            .map(ra => ra.row_number);
        return [...new Set(rows)].sort((a, b) => a - b);
    }, [rowAssignments, leader.id]);

    // Helper to get rows for a crew member
    const getMemberRows = (memberId: string) => {
        const rows = rowAssignments
            .filter(ra => ra.assigned_pickers.includes(memberId))
            .map(ra => ra.row_number);
        return [...new Set(rows)].sort((a, b) => a - b);
    };

    // Calculate Team Stats
    const totalBuckets = crew.reduce((acc, p) => acc + (p.total_buckets_today || 0), 0) + (leader.total_buckets_today || 0);

    const handleUnlink = async (e: React.MouseEvent, userId: string) => {
        e.stopPropagation();
        if (!onRemoveUser) return;

        // Two-click pattern: first click shows confirm, second click executes
        if (confirmId !== userId) {
            setConfirmId(userId);
            // Auto-reset after 3 seconds
            setTimeout(() => setConfirmId(prev => prev === userId ? null : prev), 3000);
            return;
        }

        setConfirmId(null);
        setUnlinking(userId);
        try {
            await onRemoveUser(userId);
        } catch (err) {
            logger.error('Unlink failed:', err);
        } finally {
            setUnlinking(null);
        }
    };

    return (
        <div
            className={`glass-card overflow-hidden card-hover section-enter stagger-${Math.min(staggerIndex + 1, 8)}`}
        >
            {/* LEADER HEADER (Click to Expand) */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
            >
                {/* Avatar — click opens profile directly */}
                <div
                    className="relative cursor-pointer group/avatar"
                    onClick={(e) => { e.stopPropagation(); onSelectUser(leader); }}
                    title={`View ${leader.name}'s profile`}
                >
                    <div className="w-14 h-14 rounded-full bg-slate-100 overflow-hidden border-2 border-border-light group-hover/avatar:border-primary group-hover/avatar:shadow-md transition-all">
                        <img
                            src={avatarUrl(leader.name, { background: '0f172a', color: 'fff' })}
                            alt={leader.name}
                            className="w-full h-full object-cover"
                        />
                    </div>
                    {/* Profile hint on hover */}
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity shadow-sm">
                        <span className="material-symbols-outlined text-[12px]">person</span>
                    </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-black text-text-main truncate">{leader.name}</h3>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase flex-wrap">
                        <span className="bg-primary/10 text-primary px-2 py-0.5 rounded">{t('teams.team_leader_role')}</span>
                        <span>•</span>
                        <span>{crew.length === 1
                            ? t('teams.members_count_one').replace('{n}', '1')
                            : t('teams.members_count_other').replace('{n}', String(crew.length))}</span>
                        {leaderRows.length > 0 && (
                            <>
                                <span>•</span>
                                <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded inline-flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[11px]">pin_drop</span>
                                    {leaderRows.length === 1 ? `Row ${leaderRows[0]}` : `R${leaderRows.join(', R')}`}
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* Stats */}
                <div className="flex flex-col items-end gap-1">
                    <span className="text-2xl font-black text-text-main">{totalBuckets}</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">{t('teams.team_buckets')}</span>
                </div>

                {/* Unlink Leader button */}
                {onRemoveUser && (
                    <button
                        onClick={(e) => handleUnlink(e, leader.id)}
                        disabled={unlinking === leader.id}
                        className={`ml-1 px-2 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all duration-200 active:scale-90 ${confirmId === leader.id
                            ? 'bg-red-500 text-white shadow-sm'
                            : 'text-slate-300 hover:text-red-500 hover:bg-red-50'
                            }`}
                        title={confirmId === leader.id ? t('teams.confirm_q') : 'Unlink from orchard'}
                    >
                        <span className="material-symbols-outlined text-lg">
                            {unlinking === leader.id ? 'hourglass_top' : 'link_off'}
                        </span>
                        {confirmId === leader.id && <span>{t('teams.confirm_q')}</span>}
                    </button>
                )}

                {/* Chevron */}
                <span className={`material-symbols-outlined text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                    expand_more
                </span>
            </div>

            {/* EXPANDABLE CREW LIST */}
            <div className={`border-t border-border-light bg-slate-50/50 overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* Add Leader as first item in list */}
                    <div
                        onClick={(e) => { e.stopPropagation(); onSelectUser(leader); }}
                        className="flex items-center gap-3 p-3 bg-white rounded-xl border border-primary/20 cursor-pointer hover:border-primary transition-colors group"
                    >
                        <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden">
                            <img src={avatarUrl(leader.name)} alt={`${leader.name} avatar`} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1">
                            <p className="font-bold text-text-main text-sm">{leader.name} (Lead)</p>
                            <p className="text-[10px] text-primary font-bold uppercase">{t('teams.view_profile')}</p>
                        </div>
                    </div>

                    {/* Crew Members */}
                    {crew.map(member => {
                        const isLowPerf = (member.total_buckets_today / (member.hours || 1)) < (settings?.min_buckets_per_hour || 3.6) && (member.hours > 0.5);

                        return (
                            <div
                                key={member.id}
                                className={`flex items-center gap-3 p-3 bg-white rounded-xl border cursor-pointer transition-colors group relative overflow-hidden ${isLowPerf ? 'border-red-500/30 hover:border-red-500' : 'border-border-light hover:border-primary/50'}`}
                            >
                                {isLowPerf && <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-bl" />}

                                <div
                                    onClick={(e) => { e.stopPropagation(); onSelectUser(member); }}
                                    className="flex items-center gap-3 flex-1 min-w-0"
                                >
                                    <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden flex-shrink-0">
                                        <img src={avatarUrl(member.name)} alt={`${member.name} avatar`} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-text-main text-sm truncate">{member.name}</p>
                                        {member.elsewhere && <div className="mt-0.5 max-w-full overflow-hidden"><ElsewhereBadge person={member} /></div>}
                                        <div className="flex justify-between items-center mt-0.5">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] text-slate-400 font-mono">{member.picker_id || '---'}</span>
                                                {(() => {
                                                    const mRows = getMemberRows(member.id);
                                                    return mRows.length > 0 ? (
                                                        <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-bold">
                                                            R{mRows.join(', R')}
                                                        </span>
                                                    ) : null;
                                                })()}
                                            </div>
                                            <span className={`text-xs font-black ${isLowPerf ? 'text-red-500' : 'text-text-sub'}`}>
                                                {member.total_buckets_today} <span className="text-[9px] font-normal text-slate-400">{t('teams.team_buckets_abbrev')}</span>
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Unlink crew member */}
                                {onRemoveUser && (
                                    <button
                                        onClick={(e) => handleUnlink(e, member.id)}
                                        disabled={unlinking === member.id}
                                        className={`flex-shrink-0 p-1 rounded-lg transition-all duration-200 active:scale-90 ${confirmId === member.id
                                            ? 'bg-red-500 text-white opacity-100'
                                            : 'text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100'
                                            }`}
                                        title={confirmId === member.id ? t('teams.confirm_q') : 'Unlink'}
                                    >
                                        <span className="material-symbols-outlined text-sm">
                                            {unlinking === member.id ? 'hourglass_top' : 'link_off'}
                                        </span>
                                    </button>
                                )}
                            </div>
                        );
                    })}

                    {crew.length === 0 && (
                        <div className="col-span-full py-4 text-center text-xs font-bold text-slate-400 italic">
                            No crew members assigned yet.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TeamLeaderCard;
