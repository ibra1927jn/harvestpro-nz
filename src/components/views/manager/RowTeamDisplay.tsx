/**
 * RowTeamDisplay — Shows teams currently assigned to a row
 */
import React from 'react';
import { Picker } from '@/types';
import { useTranslation } from '@/i18n';

interface TeamOnRow {
    leader: Picker | null;
    members: Picker[];
    total: number;
}

interface RowTeamDisplayProps {
    teamsOnRow: TeamOnRow[];
    totalPeople: number;
    rowNumber: number;
    onViewPicker?: (picker: Picker) => void;
}

const RowTeamDisplay: React.FC<RowTeamDisplayProps> = ({ teamsOnRow, totalPeople, rowNumber, onViewPicker }) => {
    const { t } = useTranslation();
    if (teamsOnRow.length === 0) {
        return (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                <p className="text-xs text-slate-400">{t('orchardMap.row.no_team').replace('{n}', String(rowNumber))}</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-amber-500 uppercase">
                    {teamsOnRow.length > 1
                        ? t('assignModal.teams_on_row_plural').replace('{n}', String(teamsOnRow.length)).replace('{row}', String(rowNumber))
                        : t('assignModal.teams_on_row').replace('{n}', String(teamsOnRow.length)).replace('{row}', String(rowNumber))}
                </p>
                <span className="text-[10px] font-bold text-amber-400">
                    {totalPeople === 1
                        ? t('assignModal.people_on_row_one').replace('{n}', '1')
                        : t('assignModal.people_on_row_other').replace('{n}', String(totalPeople))}
                </span>
            </div>
            {teamsOnRow.map((team, idx) => (
                <div key={idx} className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                    {team.leader && (
                        <div className="flex items-center gap-2.5">
                            <div
                                className={`w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${onViewPicker ? 'cursor-pointer hover:ring-2 ring-amber-400' : ''}`}
                                onClick={() => onViewPicker && team.leader && onViewPicker(team.leader)}
                            >
                                {team.leader.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-amber-900 truncate">{team.leader.name}</p>
                                <p className="text-[10px] text-amber-600">
                                    {team.total} {t('orchardMap.row.people')} · {(team.leader.total_buckets_today || 0) + team.members.reduce((s, m) => s + (m.total_buckets_today || 0), 0)} {t('orchardMap.buckets')}
                                </p>
                            </div>
                        </div>
                    )}
                    {team.members.length > 0 && (
                        <div className="space-y-2 mt-2">
                            {team.members.map(m => {
                                const memberIsRunner = m.role === 'runner' || m.role === 'bucket_runner';
                                const bgColor = memberIsRunner ? 'bg-blue-50' : 'bg-indigo-50';
                                const borderColor = memberIsRunner ? 'border-blue-100' : 'border-indigo-100';
                                const avatarBg = memberIsRunner ? 'bg-blue-500' : 'bg-indigo-500';
                                const nameColor = memberIsRunner ? 'text-blue-900' : 'text-indigo-900';
                                const subColor = memberIsRunner ? 'text-blue-600' : 'text-indigo-600';
                                const ringColor = memberIsRunner ? 'ring-blue-300' : 'ring-indigo-300';
                                const roleLabel = memberIsRunner ? t('orchardMap.row.role.runner') : t('orchardMap.row.role.picker');

                                return (
                                    <div
                                        key={m.id}
                                        className={`p-2.5 ${bgColor} rounded-xl border ${borderColor} ${onViewPicker ? 'cursor-pointer hover:shadow-sm transition-all' : ''}`}
                                        onClick={() => onViewPicker && onViewPicker(m)}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <div
                                                className={`w-8 h-8 rounded-full ${avatarBg} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${onViewPicker ? `hover:ring-2 ${ringColor}` : ''}`}
                                            >
                                                {m.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-bold ${nameColor} truncate`}>{m.name}</p>
                                                <p className={`text-[10px] ${subColor}`}>
                                                    {roleLabel} · {m.total_buckets_today || 0} {t('orchardMap.buckets')}
                                                </p>
                                            </div>
                                            {onViewPicker && (
                                                <span aria-hidden="true" className="material-symbols-outlined text-slate-300 text-sm">chevron_right</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default RowTeamDisplay;
