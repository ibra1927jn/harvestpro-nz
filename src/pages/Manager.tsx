/**
 * MANAGER.TSX — Adaptive Command Center
 *
 * Desktop (md+): DesktopLayout sidebar with all navigation items.
 * Mobile: BottomNav with 5 essential tabs + "More" menu for secondary views.
 *
 * Business logic extracted to useManagerActions hook.
 * Modals extracted to components/manager/modals/
 */
import React, { useState, Suspense, useEffect } from 'react';
import { Tab, Picker } from '@/types';
import BottomNav from '@/components/common/BottomNav';
import DesktopLayout from '@/components/common/DesktopLayout';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MOBILE_TABS, DESKTOP_NAV } from '@/config/navigation/manager.nav';
import { useTranslation } from '@/i18n';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { useManagerActions } from '@/hooks/useManagerActions';
import { notificationService } from '@/services/notification.service';
import { analytics } from '@/config/analytics';
import OnboardingWizard, { isOnboardingCompleted } from '@/components/manager/OnboardingWizard';
import { useHarvestStore } from '@/stores/useHarvestStore';

// Modular Views — eager (lightweight or always visible)
import DashboardView from '@/components/views/manager/DashboardView';
import TeamsView from '@/components/views/manager/TeamsView';
import RowHistory from '@/components/common/row-history/RowHistory';
import MoreMenuView from '@/components/views/manager/MoreMenuView';

// Lazy-loaded views (code-split for mobile performance)
const LogisticsView = React.lazy(() => import('@/components/views/manager/LogisticsView'));
const MessagingView = React.lazy(() => import('@/components/views/manager/MessagingView'));
const MapToggleView = React.lazy(() => import('@/components/views/manager/MapToggleView'));
const InsightsView = React.lazy(() => import('@/components/views/manager/InsightsView'));
const SettingsView = React.lazy(() => import('@/components/views/manager/SettingsView'));

import { PickerDrawer as PickerProfileDrawer } from '@/components/PickerDrawer';
import ComponentErrorBoundary from '@/components/ui/ComponentErrorBoundary';
import Header from '@/components/common/Header';

// Modals
import BroadcastModal from '@/components/views/manager/BroadcastModal';
import RowAssignmentModal from '@/components/views/manager/RowAssignmentModal';

/* ── Lazy loading fallback ─────────────────────────── */
const TabLoader = () => {
    const { t } = useTranslation();
    return (
  <div className="flex items-center justify-center py-32">
    <div className="text-center">
      <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
      <p className="text-sm text-text-sub font-medium">{t('common.loading')}</p>
    </div>
  </div>
);
};

const Manager = () => {
  const {
    crew,
    orchard,
    settings,
    addPicker: _addPicker,
    removePicker: _removePicker,
    updatePicker: _updatePicker,
    assignRow: _assignRow,
    fetchGlobalData,
    stats,
    presentCount,
    activeRunners: _activeRunners,
    teamLeaders,
    fullBins: _fullBins,
    emptyBins: _emptyBins,
    filteredBucketRecords,
    handleRemoveUser,
    handleBroadcast: _handleBroadcast,
    handleSendMessage: _handleSendMessage,
  } = useManagerActions();

  const openPickerProfile = useHarvestStore(s => s.openPickerProfile);
  const { t } = useTranslation();

  const isDesktop = useMediaQuery('(min-width: 768px)');

  // Nav items con labels traducidas (respetan el idioma activo)
  const mobileTabs = MOBILE_TABS.map(tab => ({
    ...tab,
    label: t(`nav.${tab.id}`) !== `nav.${tab.id}` ? t(`nav.${tab.id}`) : tab.label,
  }));
  const desktopNav = DESKTOP_NAV.map(item => ({
    ...item,
    label: t(`nav.${item.id}`) !== `nav.${item.id}` ? t(`nav.${item.id}`) : item.label,
  }));
  useOfflineQueue(fetchGlobalData);

  // Onboarding: mostrar wizard si no hay crew, no hay settings y no fue completado
  const [onboardingDone, setOnboardingDone] = useState(() => isOnboardingCompleted());

  // Los datos del huerto los carga OrchardDataBootstrap (ProtectedRoute)
  useEffect(() => {
    analytics.trackPageView('manager_dashboard');
  }, []);

  // Notification checking
  useEffect(() => {
    const prefs = notificationService.getPrefs();
    if (prefs.enabled) notificationService.startChecking();
    return () => notificationService.stopChecking();
  }, []);

  // Tab State
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  // Persist selected orchard ID
  const [selectedOrchardId, setSelectedOrchardId] = useState<string | undefined>(
    () => localStorage.getItem('active_orchard_id') || undefined
  );

  React.useEffect(() => {
    if (orchard?.id) {
      setSelectedOrchardId(orchard.id);
      localStorage.setItem('active_orchard_id', orchard.id);
    }
  }, [orchard?.id]);

  // Modal States
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [showAssignment, setShowAssignment] = useState<{ show: boolean; row: number }>({
    show: false,
    row: 1,
  });

  // Content Renderer
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <ComponentErrorBoundary componentName="Dashboard">
            <DashboardView
              stats={stats}
              teamLeaders={teamLeaders}
              crew={crew}
              presentCount={presentCount}
              setActiveTab={setActiveTab}
              bucketRecords={filteredBucketRecords}
              onUserSelect={user => {
                const fullUser =
                  crew.find(p => p.id === user.id || p.picker_id === user.picker_id) ||
                  (user as Picker);
                openPickerProfile(fullUser.id);
              }}
            />
          </ComponentErrorBoundary>
        );
      case 'teams':
        return (
          <ComponentErrorBoundary componentName="Teams">
            <TeamsView
              crew={crew}
              setSelectedUser={picker => openPickerProfile(picker.id)}
              settings={settings}
              orchardId={selectedOrchardId || orchard?.id}
              onRefresh={fetchGlobalData}
              onRemoveUser={handleRemoveUser}
            />
          </ComponentErrorBoundary>
        );
      case 'logistics':
        return (
          <ComponentErrorBoundary componentName="Logistics">
            <Suspense fallback={<TabLoader />}>
              <LogisticsView />
            </Suspense>
          </ComponentErrorBoundary>
        );
      case 'messaging':
        return (
          <ComponentErrorBoundary componentName="Messaging">
            <Suspense fallback={<TabLoader />}>
              <MessagingView />
            </Suspense>
          </ComponentErrorBoundary>
        );
      case 'map':
        return (
          <ComponentErrorBoundary componentName="Map">
            <Suspense fallback={<TabLoader />}>
              <MapToggleView
                totalRows={orchard?.total_rows || 20}
                crew={crew}
                bucketRecords={filteredBucketRecords}
                blockName={orchard?.name || 'Block A'}
                targetBucketsPerRow={settings?.min_buckets_per_hour ?? 30}
                setActiveTab={setActiveTab}
                onRowClick={rowNum => setShowAssignment({ show: true, row: rowNum })}
              />
              {/* Recorrido de filas de cada equipo */}
              <div className="px-4 pb-6 pt-2">
                <RowHistory title={t('mgr.row_history_by_team')} />
              </div>
            </Suspense>
          </ComponentErrorBoundary>
        );
      case 'settings':
        return (
          <ComponentErrorBoundary componentName="Settings">
            <Suspense fallback={<TabLoader />}>
              <SettingsView />
            </Suspense>
          </ComponentErrorBoundary>
        );

      case 'insights':
      case 'analytics':
      case 'reports':
        return (
          <ComponentErrorBoundary componentName="Insights">
            <Suspense fallback={<TabLoader />}>
              <InsightsView />
            </Suspense>
          </ComponentErrorBoundary>
        );
      case 'more':
        return <MoreMenuView onNavigate={tab => setActiveTab(tab)} />;
      default:
        return (
          <ComponentErrorBoundary componentName="Dashboard">
            <DashboardView
              stats={stats}
              teamLeaders={teamLeaders}
              crew={crew}
              presentCount={presentCount}
              setActiveTab={setActiveTab}
            />
          </ComponentErrorBoundary>
        );
    }
  };

  /* ── Shared Modals ──────────────────────────────────── */
  const renderModals = () => (
    <>
      {showBroadcast && <BroadcastModal onClose={() => setShowBroadcast(false)} />}
      {showAssignment.show && (
        <RowAssignmentModal
          initialRow={showAssignment.row}
          onClose={() => setShowAssignment({ show: false, row: 1 })}
          onViewPicker={picker => {
            setShowAssignment({ show: false, row: 1 });
            openPickerProfile(picker.id);
          }}
        />
      )}
    </>
  );

  /* ── Broadcast FAB ──────────────────────────────────── */
  const renderBroadcastFAB = () => {
    if (activeTab === 'map' || activeTab === 'messaging') return null;
    return (
      <div className="fixed bottom-[136px] md:bottom-8 right-4 z-40">
        <button
          onClick={() => setShowBroadcast(true)}
          className="gradient-primary glow-primary text-white rounded-full h-14 px-6 flex items-center justify-center gap-2 transition-all active:scale-95 hover:scale-105 shadow-2xl"
        >
          <span aria-hidden="true" className="material-symbols-outlined">campaign</span>
          <span className="font-bold tracking-wide">{t('common.broadcast')}</span>
        </button>
      </div>
    );
  };

  /* ── Onboarding: mostrar wizard si es primera vez ──── */
  const needsOnboarding = !onboardingDone && crew.length === 0 && !settings?.piece_rate;
  if (needsOnboarding) {
    return (
      <OnboardingWizard
        onComplete={() => {
          setOnboardingDone(true);
          fetchGlobalData();
        }}
      />
    );
  }

  /* ── Desktop Layout ─────────────────────────────────── */
  if (isDesktop) {
    return (
      <>
        <DesktopLayout
          navItems={desktopNav}
          activeTab={activeTab}
          onTabChange={id => setActiveTab(id as Tab)}
          title={t('mgr.page_title')}
          titleIcon="agriculture"
          accentColor="#16a34a"
        >
          <div key={activeTab} className="animate-scale-in">
            {renderContent()}
          </div>
        </DesktopLayout>
        {renderModals()}
        {renderBroadcastFAB()}
        <PickerProfileDrawer />
      </>
    );
  }

  /* ── Mobile Layout ──────────────────────────────────── */
  return (
    <div className="flex flex-col h-full bg-background-light min-h-screen text-slate-900 pb-20">
      {/* El avatar abre «Mi cuenta» (lo hace la propia cabecera); Ajustes del huerto sigue en su pestaña */}
      <Header
        title={t('mgr.page_title')}
        subtitle={t('mgr.page_subtitle', { orchard: orchard?.name || t('teams.no_orchard') })}
        onNavigateToMessaging={() => setActiveTab('messaging' as Tab)}
      />

      {/* Content — animate on tab switch */}
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
        <div key={activeTab} className="animate-scale-in">
          {renderContent()}
        </div>
      </main>

      {renderModals()}

      {/* Navigation Bar — 5 essential tabs */}
      <BottomNav
        tabs={mobileTabs}
        activeTab={
          activeTab === 'insights' || activeTab === 'messaging' || activeTab === 'settings'
            ? 'more'
            : activeTab
        }
        onTabChange={id => setActiveTab(id as Tab)}
      />

      {renderBroadcastFAB()}
      <PickerProfileDrawer />
    </div>
  );
};

export default Manager;
