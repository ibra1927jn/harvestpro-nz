/**
 * components/views/manager/TeamsView.tsx
 * REFACTORED: Uses crew prop from context with manual refresh + unlink support.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { Picker, HarvestSettings } from '../../../types';
import TeamLeaderCard from './TeamLeaderCard';
import TeamLeaderSelectionModal from '../../modals/TeamLeaderSelectionModal';
import ImportCSVModal from '../../modals/ImportCSVModal';
import TeamsToolbar from './teams/TeamsToolbar';
import RunnersSection from './teams/RunnersSection';
import EmptyState from '@/components/ui/EmptyState';
import { selectStaff, selectTeamLeaders, selectRunners, selectTeamOf, selectUnassigned } from '@/services/harvestMetrics/roster';
import { useTranslation } from '@/i18n';

interface TeamsViewProps {
    crew: Picker[];
    setShowAddUser?: (show: boolean) => void;
    setSelectedUser: (user: Picker) => void;
    settings: HarvestSettings | null;
    orchardId?: string;
    onRefresh?: () => Promise<void>;
    onRemoveUser?: (userId: string) => Promise<void>;
}

const TeamsView: React.FC<TeamsViewProps> = ({
    crew,
    setSelectedUser,
    settings,
    orchardId,
    onRefresh,
    onRemoveUser
}) => {
    const { t } = useTranslation();
    const [search, setSearch] = useState('');
    const [isAddTeamLeaderModalOpen, setIsAddTeamLeaderModalOpen] = useState(false);
    const [showImportCSV, setShowImportCSV] = useState(false);

    const handleImportComplete = useCallback((_count: number) => {
        setShowImportCSV(false);
        onRefresh?.();
    }, [onRefresh]);

    // Mismas listas que el resto de pantallas (harvestMetrics/roster.ts)
    const { leaders, runners, groupedCrew, unassigned } = useMemo(() => {
        const leaders = selectTeamLeaders(crew);
        const runners = selectRunners(crew);
        const grouped: Record<string, Picker[]> = {};
        leaders.forEach(l => { grouped[l.id] = selectTeamOf(crew, l.id); });
        return { leaders, runners, groupedCrew: grouped, unassigned: selectUnassigned(crew) };
    }, [crew]);

    const filteredLeaders = leaders.filter(l => l.name?.toLowerCase().includes(search.toLowerCase()));
    const filteredRunners = runners.filter(r => r.name?.toLowerCase().includes(search.toLowerCase()));

    // Estado vacio global: sin equipo completo
    const isCrewEmpty = crew.length === 0;

    return (
        <div className="flex flex-col h-full">
            <TeamsToolbar
                orchardId={orchardId}
                usersCount={selectStaff(crew).length}
                setIsAddTeamLeaderModalOpen={setIsAddTeamLeaderModalOpen}
                setShowImportCSV={setShowImportCSV}
                search={search}
                setSearch={setSearch}
            />

            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8">
                {/* Estado vacio: sin miembros del equipo */}
                {isCrewEmpty ? (
                    <EmptyState
                        icon="group_add"
                        title={t('teams.no_team_members')}
                        subtitle={t('teams.no_team_members_sub')}
                        iconColor="text-orange-400"
                        action={{
                            label: t('teams.add_first'),
                            onClick: () => setIsAddTeamLeaderModalOpen(true),
                            icon: 'person_add',
                        }}
                    />
                ) : (
                    <>
                        <div className="section-enter stagger-1">
                            <RunnersSection
                                runners={filteredRunners}
                                onSelectUser={setSelectedUser}
                                onRemoveUser={onRemoveUser}
                            />
                        </div>

                        <section className="glass-card p-5 section-enter stagger-3">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-black flex items-center gap-2">
                                    <span className="material-symbols-outlined text-orange-500">groups</span>
                                    {t('teams.harvest_teams')}
                                </h3>
                                <span className="text-xs bg-orange-50 text-orange-600 px-3 py-1 rounded-full font-bold">
                                    {filteredLeaders.length === 1
                                        ? t('teams.leaders_one').replace('{n}', '1')
                                        : t('teams.leaders_other').replace('{n}', String(filteredLeaders.length))}
                                </span>
                            </div>
                            {filteredLeaders.length > 0 ? (
                                <div className="space-y-4">
                                    {filteredLeaders.map((leader, idx) => (
                                        <TeamLeaderCard
                                            key={leader.id}
                                            leader={leader}
                                            crew={groupedCrew[leader.id] || []}
                                            onSelectUser={setSelectedUser}
                                            settings={settings}
                                            staggerIndex={idx}
                                            onRemoveUser={onRemoveUser}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <EmptyState
                                    icon="group_off"
                                    title={t('teams.no_harvest_teams')}
                                    subtitle={t('teams.no_harvest_teams_sub')}
                                    compact
                                    action={{
                                        label: t('teams.assign_leader'),
                                        onClick: () => setIsAddTeamLeaderModalOpen(true),
                                        icon: 'person_add',
                                    }}
                                />
                            )}
                        </section>

                        {/* Pickers sin team leader: antes no salían en ninguna parte */}
                        {unassigned.length > 0 && (
                            <section className="glass-card p-5" data-testid="unassigned-pickers">
                                <h3 className="text-lg font-black flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-amber-500">person_off</span>
                                    Without team leader
                                    <span className="text-xs bg-amber-50 text-amber-700 px-3 py-1 rounded-full font-bold">{unassigned.length}</span>
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {unassigned.map(p => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => setSelectedUser(p)}
                                            className="px-3 py-1.5 rounded-xl bg-white border border-amber-200 text-sm font-bold text-text-main hover:bg-amber-50"
                                        >
                                            {p.name}
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}
                    </>
                )}
            </div>

            {isAddTeamLeaderModalOpen && (
                <TeamLeaderSelectionModal
                    onClose={() => setIsAddTeamLeaderModalOpen(false)}
                    orchardId={orchardId}
                    onRemoveUser={onRemoveUser}
                    onAdd={async () => {
                        setIsAddTeamLeaderModalOpen(false);
                        // Refresh the crew list after assignment
                        await onRefresh?.();
                    }}
                />
            )}

            <ImportCSVModal
                isOpen={showImportCSV}
                onClose={() => setShowImportCSV(false)}
                orchardId={orchardId || ''}
                existingPickers={crew.map(p => ({ picker_id: p.picker_id, name: p.name }))}
                onImportComplete={handleImportComplete}
            />
        </div>
    );
};

export default React.memo(TeamsView);
