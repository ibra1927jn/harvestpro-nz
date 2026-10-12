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
import React, { useState, Suspense } from 'react';
import ResponsiveLayout from '@/components/common/ResponsiveLayout';
import ComponentErrorBoundary from '@/components/ui/ComponentErrorBoundary';
import Toast from '@/components/ui/Toast';
import SyncStatusMonitor from '@/components/common/SyncStatusMonitor';
import { useRunnerData } from '@/hooks/useRunnerData';
import { RUNNER_NAV_TABS, type RunnerTab } from '@/config/navigation/runner.nav';

// Lazy-loaded views (code-split for performance)
const LogisticsView = React.lazy(() => import('@/components/views/runner/LogisticsView'));
const RunnersView = React.lazy(() => import('@/components/views/runner/RunnersView'));
const WarehouseView = React.lazy(() => import('@/components/views/runner/WarehouseView'));
const MessagingView = React.lazy(() => import('@/components/views/runner/MessagingView'));
const TimesheetEditor = React.lazy(() => import('@/components/views/manager/TimesheetEditor'));
const ScannerModal = React.lazy(() => import('@/components/modals/ScannerModal'));
const QualityRatingModal = React.lazy(() => import('@/components/modals/QualityRatingModal'));

const TabLoader = () => (
  <div className="flex items-center justify-center py-12">
    <div className="w-8 h-8 border-3 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
  </div>
);

const Runner = () => {
  const [activeTab, setActiveTab] = useState<RunnerTab>('logistics');
  const runner = useRunnerData();

  return (
    <>
      <ResponsiveLayout
        navItems={RUNNER_NAV_TABS}
        mobileTabs={RUNNER_NAV_TABS}
        activeTab={activeTab}
        onTabChange={id => setActiveTab(id as RunnerTab)}
        title="Runner"
        subtitle={`Logistics - ${runner.orchard?.name || 'No Orchard'}`}
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
                    inventory={runner.inventory}
                    onBroadcast={runner.handleBroadcast}
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
                  <WarehouseView
                    inventory={runner.inventory}
                    onTransportRequest={() =>
                      runner.handleBroadcast('Warehouse is full. Pickup needed.')
                    }
                  />
                </ComponentErrorBoundary>
              )}
              {activeTab === 'messaging' && (
                <ComponentErrorBoundary componentName="Messaging">
                  <MessagingView />
                </ComponentErrorBoundary>
              )}
              {activeTab === 'timesheet' && (
                <ComponentErrorBoundary componentName="Timesheet">
                  <div className="p-4">
                    <TimesheetEditor orchardId={runner.orchard?.id || ''} />
                  </div>
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
