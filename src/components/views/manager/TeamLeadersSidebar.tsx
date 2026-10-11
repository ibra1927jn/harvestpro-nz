/**
 * TeamLeadersSidebar — Quick access list of team leaders
 */
import { selectTeamOf } from '@/services/harvestMetrics/roster';
import React from 'react';
import { useTranslation } from '@/i18n';
import { Picker, Tab } from '../../../types';

interface TeamLeadersSidebarProps {
    teamLeaders: Picker[];
    crew: Picker[];
    setActiveTab: (tab: Tab) => void;
    onUserSelect?: (user: Partial<Picker>) => void;
}

const TeamLeadersSidebar: React.FC<TeamLeadersSidebarProps> = ({
    teamLeaders,
    crew,
    setActiveTab,
    onUserSelect,
}) => {
    const { t } = useTranslation();
    return (
    <div className="glass-card p-5">
        <h3 className="font-bold text-text-main mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-500">groups</span>
            {t('dashboard.team_leaders.title')}
        </h3>
        <div className="space-y-3">
            {teamLeaders.slice(0, 5).map(leader => {
                const teamSize = selectTeamOf(crew, leader.id).length;
                return (
                    <div
                        key={leader.id}
                        onClick={() => onUserSelect && onUserSelect(leader)}
                        className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 cursor-pointer transition-colors"
                    >
                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                            {leader.name?.charAt(0) || 'L'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm text-text-main truncate">{leader.name}</p>
                            <p className="text-[10px] text-slate-500">{t('dashboard.team_leaders.picker_count').replace('{n}', String(teamSize))}</p>
                        </div>
                    </div>
                );
            })}
            {teamLeaders.length === 0 && (
                <p className="text-xs text-slate-400 italic">{t('dashboard.team_leaders.empty')}</p>
            )}
        </div>
        <button
            onClick={() => setActiveTab('teams')}
            className="w-full mt-4 py-2 text-xs font-bold text-primary bg-primary/5 hover:bg-primary/10 rounded-lg transition-colors"
        >
            {t('dashboard.team_leaders.manage')}
        </button>
    </div>
    );
};

export default TeamLeadersSidebar;
