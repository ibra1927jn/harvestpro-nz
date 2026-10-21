/**
 * QualityControl.tsx — QC Inspector Dashboard (dual layout)
 *
 * Migrated to ResponsiveLayout 2026-04-18 — antes solo mobile.
 * Ahora DesktopLayout sidebar ≥768px + BottomNav <768px.
 *
 * Architecture:
 *   QualityControl.tsx     — Thin orchestrator
 *   useQC.ts               — Data hook (inspections, grading, photos)
 *   qcNav.config.ts        — Navigation tabs
 *   qc/                    — Tab view components (lazy-loaded)
 */
import React, { useState, useEffect, Suspense } from 'react';
import ResponsiveLayout from '@/components/common/ResponsiveLayout';
import ComponentErrorBoundary from '@/components/ui/ComponentErrorBoundary';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useQC } from '@/hooks/useQC';
import { QC_NAV_TABS, type QCTab } from '@/config/navigation/qc.nav';
import { useTranslation } from '@/i18n';

// Lazy-loaded views (code-split for performance)
const InspectTab = React.lazy(() => import('@/components/views/qc/InspectTab'));
const HistoryTab = React.lazy(() => import('@/components/views/qc/HistoryTab'));
const StatsTab = React.lazy(() => import('@/components/views/qc/StatsTab'));
const TrendsTab = React.lazy(() => import('@/components/views/qc/TrendsTab'));

const TabLoader = () => (
    <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
    </div>
);

export default function QualityControl() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<QCTab>('inspect');
    const qc = useQC();

    useEffect(() => {
        qc.loadInspections();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [qc.orchardId]);

    if (qc.isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 p-6 relative overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-500/10 blur-[80px] pointer-events-none" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-orange-500/10 blur-[80px] pointer-events-none" />
                <div className="max-w-2xl mx-auto space-y-4 relative z-10">
                    <LoadingSkeleton type="metric" count={4} />
                    <LoadingSkeleton type="list" count={3} />
                </div>
            </div>
        );
    }

    return (
        <ResponsiveLayout
            navItems={QC_NAV_TABS}
            mobileTabs={QC_NAV_TABS}
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id as QCTab)}
            title={t('qc.page_title')}
            subtitle={t('qc.page_subtitle')}
            accentColor="emerald"
            titleIcon="verified"
        >
            <div className="relative overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-500/10 blur-[80px] pointer-events-none" />
                <div className="absolute bottom-[-5%] right-[-10%] w-[50%] h-[40%] rounded-full bg-orange-500/10 blur-[80px] pointer-events-none" />

                <div key={activeTab} className="animate-fade-in relative z-10">
                    <Suspense fallback={<TabLoader />}>
                        {activeTab === 'inspect' && (
                            <ComponentErrorBoundary componentName="Inspect">
                                <InspectTab
                                    crew={qc.crew}
                                    inspections={qc.inspections}
                                    distribution={qc.distribution}
                                    selectedPicker={qc.selectedPicker}
                                    setSelectedPicker={qc.setSelectedPicker}
                                    notes={qc.notes}
                                    setNotes={qc.setNotes}
                                    isSubmitting={qc.isSubmitting}
                                    lastGrade={qc.lastGrade}
                                    gradeError={qc.gradeError}
                                    onGrade={qc.handleGrade}
                                />
                            </ComponentErrorBoundary>
                        )}
                        {activeTab === 'history' && (
                            <ComponentErrorBoundary componentName="Inspection History">
                                <HistoryTab inspections={qc.inspections} crew={qc.crew} />
                            </ComponentErrorBoundary>
                        )}
                        {activeTab === 'stats' && (
                            <ComponentErrorBoundary componentName="Quality Stats">
                                <StatsTab distribution={qc.distribution} />
                            </ComponentErrorBoundary>
                        )}
                        {activeTab === 'trends' && qc.orchardId && (
                            <ComponentErrorBoundary componentName="Quality Trends">
                                <TrendsTab orchardId={qc.orchardId} />
                            </ComponentErrorBoundary>
                        )}
                    </Suspense>
                </div>
            </div>
        </ResponsiveLayout>
    );
}
