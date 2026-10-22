/**
 * TeamLeader.tsx — Team Leader Dashboard (dual layout)
 *
 * Migrated to ResponsiveLayout 2026-04-18 — ahora renderiza DesktopLayout
 * con sidebar en viewport ≥768px y BottomNav mobile en <768px. Cierra el
 * gap "TeamLeader solo mobile" anotado en PROGRESS.md 2026-04-17.
 *
 * Architecture:
 *   TeamLeader.tsx              — Thin orchestrator (este file)
 *   teamLeaderNav.config.ts    — Navigation tabs
 *   team-leader/               — View components (lazy-loaded)
 */
import React, { useState, Suspense, useMemo } from 'react';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { useAuth } from '@/context/AuthContext';
import { selectTeamOf } from '@/services/harvestMetrics/roster';
import ResponsiveLayout from '@/components/common/ResponsiveLayout';
import ComponentErrorBoundary from '@/components/ui/ComponentErrorBoundary';
import { PickerDrawer } from '@/components/PickerDrawer';
import { TEAM_LEADER_NAV_TABS, type TeamLeaderTab } from '@/config/navigation/team-leader.nav';
import { useTranslation } from '@/i18n';

// Lazy-loaded views (code-split for performance)
const HomeView = React.lazy(() => import('@/components/views/team-leader/HomeView'));
const TeamView = React.lazy(() => import('@/components/views/team-leader/TeamView'));
const TasksView = React.lazy(() => import('@/components/views/team-leader/TasksView'));
const MessagingView = React.lazy(() => import('@/components/views/team-leader/MessagingView'));
const AttendanceView = React.lazy(() => import('@/components/views/team-leader/AttendanceView'));
const TimesheetEditor = React.lazy(() => import('@/components/views/manager/TimesheetEditor'));

const TabLoader = () => (
    <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
);

const TeamLeader = () => {
    const { t } = useTranslation();
    // Los datos del huerto los carga OrchardDataBootstrap (ProtectedRoute)
    const orchard = useHarvestStore((state) => state.orchard);
    const crew = useHarvestStore((state) => state.crew);
    const { appUser } = useAuth();
    // Hojas de horas: el team leader solo ve y corrige los fichajes de SU equipo
    // (misma regla que Inicio / Equipo / Pase de lista); el manager ve el huerto entero.
    const teamPickerIds = useMemo(
        () => selectTeamOf(crew ?? [], appUser?.id).map(p => p.id),
        [crew, appUser?.id],
    );

    const [activeTab, setActiveTab] = useState<TeamLeaderTab>('home');
    // BottomNav has 5 tabs; 'team' doesn't appear there — fallback a 'home'.
    // El perfil personal ya no es una pestaña: el avatar de la cabecera abre «Mi cuenta».
    const mobileActiveTab = activeTab === 'team' ? 'home' : activeTab;

    return (
        <>
        <ResponsiveLayout
            navItems={TEAM_LEADER_NAV_TABS}
            mobileTabs={TEAM_LEADER_NAV_TABS}
            activeTab={activeTab}
            mobileActiveTab={mobileActiveTab}
            onTabChange={(id) => setActiveTab(id as TeamLeaderTab)}
            title={t('panel.role.team_leader')}
            subtitle={t('tl.page_subtitle')}
            accentColor="blue"
            titleIcon="groups"
        >
            {/* OmniCore ambient background dots — decorativo, pointer-events-none. */}
            <div className="relative overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[80px] pointer-events-none" />
                <div className="absolute bottom-[-5%] right-[-10%] w-[50%] h-[40%] rounded-full bg-blue-500/10 blur-[80px] pointer-events-none" />

                <div key={activeTab} className="animate-fade-in relative z-10">
                    <Suspense fallback={<TabLoader />}>
                        {activeTab === 'home' && (
                            <ComponentErrorBoundary componentName="Home">
                                <HomeView onNavigate={(tab) => setActiveTab(tab as TeamLeaderTab)} />
                            </ComponentErrorBoundary>
                        )}
                        {activeTab === 'attendance' && (
                            <ComponentErrorBoundary componentName="Attendance">
                                <AttendanceView />
                            </ComponentErrorBoundary>
                        )}
                        {activeTab === 'team' && (
                            <ComponentErrorBoundary componentName="Team">
                                <TeamView />
                            </ComponentErrorBoundary>
                        )}
                        {activeTab === 'tasks' && (
                            <ComponentErrorBoundary componentName="Tasks">
                                <TasksView />
                            </ComponentErrorBoundary>
                        )}
                        {activeTab === 'timesheet' && (
                            <ComponentErrorBoundary componentName="Timesheet">
                                <div className="p-4">
                                    <TimesheetEditor orchardId={orchard?.id || ''} pickerIds={teamPickerIds} />
                                </div>
                            </ComponentErrorBoundary>
                        )}
                        {activeTab === 'chat' && (
                            <ComponentErrorBoundary componentName="Chat">
                                <MessagingView />
                            </ComponentErrorBoundary>
                        )}
                    </Suspense>
                </div>
            </div>
        </ResponsiveLayout>
        {/* Cajón de perfil de persona (el mismo que el manager): se abre con openPickerProfile(id) */}
        <PickerDrawer />
        </>
    );
};

export default TeamLeader;
