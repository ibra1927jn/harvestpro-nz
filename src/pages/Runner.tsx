/**
 * Runner.tsx — Field Runner Dashboard (dual layout)
 *
 * Migrated to ResponsiveLayout 2026-04-18 — antes solo mobile.
 * Ahora DesktopLayout sidebar en viewport ≥768px + BottomNav en <768px.
 *
 * Architecture:
 *   Runner.tsx              — Thin orchestrator (este file)
 *   useRunnerData.ts        — Data hook (store, scan, quality, polling)
 *   runnerNav.config.ts     — Navigation tabs
 *   runner/                 — View components (lazy-loaded)
 */
import React, { useState, useEffect, Suspense } from 'react';
import ResponsiveLayout from '@/components/common/ResponsiveLayout';
import ComponentErrorBoundary from '@/components/ui/ComponentErrorBoundary';
import Toast from '@/components/ui/Toast';
import SyncStatusMonitor from '@/components/common/SyncStatusMonitor';
import { useRunnerData } from '@/hooks/useRunnerData';
import { RUNNER_NAV_TABS, type RunnerTab } from '@/config/navigation/runner.nav';
import { useTranslation } from '@/i18n';

// Lazy-loaded views (code-split for performance)
const loadLogistics = () => import('@/components/views/runner/LogisticsView');
const loadRunners = () => import('@/components/views/runner/RunnersView');
const loadWarehouse = () => import('@/components/views/runner/WarehouseView');
const loadMessaging = () => import('@/components/views/runner/MessagingView');
const loadTimesheet = () => import('@/components/views/runner/MyTimesheetView');
const loadScanner = () => import('@/components/modals/ScannerModal');
const loadQuality = () => import('@/components/modals/QualityRatingModal');
const LogisticsView = React.lazy(loadLogistics);
const RunnersView = React.lazy(loadRunners);
const WarehouseView = React.lazy(loadWarehouse);
const MessagingView = React.lazy(loadMessaging);
const MyTimesheetView = React.lazy(loadTimesheet);
const ScannerModal = React.lazy(loadScanner);
const QualityRatingModal = React.lazy(loadQuality);

/**
 * Precarga lo que el runner usa en el campo. Sin esto, si se quedaba sin
 * cobertura antes de abrir el escáner por primera vez (y el service worker aún
 * no lo había guardado), "Scan Sticker" tumbaba la app entera con
 * "Failed to fetch dynamically imported module".
 */
export function preloadRunnerModules(): Promise<unknown> {
  return Promise.all(
    [loadScanner, loadQuality, loadLogistics, loadRunners, loadWarehouse, loadMessaging, loadTimesheet].map(load =>
      load().catch(() => undefined)
    )
  );
}

const TabLoader = () => (
  <div className="flex items-center justify-center py-12">
    <div className="w-8 h-8 border-3 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
  </div>
);

const Runner = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<RunnerTab>('logistics');
  const runner = useRunnerData();

  useEffect(() => {
    preloadRunnerModules();
  }, []);

  return (
    <>
      <ResponsiveLayout
        navItems={RUNNER_NAV_TABS}
        mobileTabs={RUNNER_NAV_TABS}
        activeTab={activeTab}
        onTabChange={id => setActiveTab(id as RunnerTab)}
        title={t('runner.page_title')}
        subtitle={t('runner.page_subtitle', { orchard: runner.orchard?.name || t('teams.no_orchard') })}
        accentColor="sky"
        titleIcon="local_shipping"
      >
        <div className="relative overflow-hidden">
          {/* OmniCore ambient background — decorativo */}
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[80px] pointer-events-none" />
          <div className="absolute bottom-[-5%] right-[-10%] w-[50%] h-[40%] rounded-full bg-sky-500/10 blur-[80px] pointer-events-none" />

          <SyncStatusMonitor />

          <div key={activeTab} className="animate-fade-in relative z-10">
            <Suspense fallback={<TabLoader />}>
              {activeTab === 'logistics' && (
                <ComponentErrorBoundary componentName="Logistics">
                  <LogisticsView
                    onScan={runner.handleScanClick}
                    pendingUploads={runner.pendingUploads}
                    rejectedScans={runner.rejectedScans}
                    inventory={runner.inventory}
                    onOpenNotifications={() => setActiveTab('messaging')}
                    onRequestRefill={runner.handleRequestRefill}
                    selectedBinId={runner.selectedBinId}
                  />
                </ComponentErrorBoundary>
              )}
              {activeTab === 'runners' && (
                <ComponentErrorBoundary componentName="Runners">
                  <RunnersView onBack={() => setActiveTab('logistics')} />
                </ComponentErrorBoundary>
              )}
              {activeTab === 'warehouse' && (
                <ComponentErrorBoundary componentName="Warehouse">
                  {/* «Solicitar transporte» crea la solicitud desde la propia vista (antes solo un mensaje) */}
                  <WarehouseView inventory={runner.inventory} />
                </ComponentErrorBoundary>
              )}
              {activeTab === 'messaging' && (
                <ComponentErrorBoundary componentName="Messaging">
                  <MessagingView />
                </ComponentErrorBoundary>
              )}
              {activeTab === 'timesheet' && (
                <ComponentErrorBoundary componentName="Timesheet">
                  {/* Solo la hoja de la persona: el runner no ve ni corrige los fichajes de otros */}
                  <MyTimesheetView />
                </ComponentErrorBoundary>
              )}
            </Suspense>
          </div>
        </div>
      </ResponsiveLayout>

      {/* Global toast (fuera del layout — overlay global) */}
      {runner.toast && (
        <Toast
          message={runner.toast.message}
          announcement={runner.toast.announcement}
          type={runner.toast.type}
          onClose={() => runner.setToast(null)}
        />
      )}

      {/* Modals */}
      {runner.showScanner && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          }
        >
          <ScannerModal
            onClose={() => runner.setShowScanner(false)}
            onScan={code => runner.handleScanComplete(code)}
            onBatchScan={codes => runner.handleScanComplete(codes)}
            scanType={runner.scanType || 'BUCKET'}
            batchMode={runner.scanType === 'BUCKET'}
          />
        </Suspense>
      )}
      {runner.qualityScan?.step === 'QUALITY' && (
        <Suspense fallback={<TabLoader />}>
          <QualityRatingModal
            scannedCode={runner.qualityScan.code}
            onRate={runner.submitQuality}
            onCancel={() => runner.setQualityScan(null)}
          />
        </Suspense>
      )}
    </>
  );
};

export default Runner;
