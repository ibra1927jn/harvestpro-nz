/**
 * InsightsView.tsx — Combined Analytics & Reports
 *
 * Merges CostAnalyticsView and WeeklyReportView behind a
 * clean inner toggle. Reduces Manager bottom-nav clutter.
 */
import { selectPickers } from '@/services/harvestMetrics/roster';
import React, { useState, Suspense } from 'react';
import { useTranslation } from '@/i18n';

// Lazy-loaded sub-views (code-split: loaded only when tab is active)
const CostAnalyticsView = React.lazy(() => import('./CostAnalyticsView'));
const WeeklyReportView = React.lazy(() => import('./WeeklyReportView'));
const AnomalyDetectionView = React.lazy(() => import('./AnomalyDetectionView'));

import ComponentErrorBoundary from '@/components/ui/ComponentErrorBoundary';
import PageHeader from '@/components/ui/PageHeader';
import { useHarvestStore } from '@/stores/useHarvestStore';

type InsightsTab = 'analytics' | 'report' | 'fraud';

const InsightsView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<InsightsTab>('analytics');
    const orchard = useHarvestStore(s => s.orchard);
    const crew = useHarvestStore(s => s.crew);
    const pickerCount = selectPickers(crew).length;
    const { t } = useTranslation();

    return (
        <div className="space-y-5 p-4 md:p-6 max-w-7xl mx-auto pb-24 animate-fade-in">
            <PageHeader
                icon="insights"
                title={t('insights.header')}
                subtitle={t('insights.subtitle').replace('{orchard}', orchard?.name || 'Orchard')}
                badges={[
                    { label: t('insights.pickers_badge').replace('{n}', String(pickerCount)), icon: 'groups', color: 'indigo' },
                    { label: t('insights.live_data'), icon: 'monitoring', color: 'emerald' },
                ]}
            >

                {/* Tab Toggle — moved to header area */}
                <div className="flex items-center gap-1 bg-slate-100 border border-border-light rounded-xl p-1 w-fit">
                    <button
                        onClick={() => setActiveTab('analytics')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'analytics'
                            ? 'bg-primary text-white shadow-lg shadow-primary/25'
                            : 'text-text-sub hover:text-text-main'
                            }`}
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-lg">bar_chart</span>
                        {t('insights.tabs.analytics')}
                    </button>
                    <button
                        onClick={() => setActiveTab('report')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'report'
                            ? 'bg-primary text-white shadow-lg shadow-primary/25'
                            : 'text-text-sub hover:text-text-main'
                            }`}
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-lg">summarize</span>
                        {t('insights.tabs.report')}
                    </button>
                    <button
                        onClick={() => setActiveTab('fraud')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'fraud'
                            ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25'
                            : 'text-text-sub hover:text-text-main'
                            }`}
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-lg">shield</span>
                        {t('insights.tabs.fraud')}
                    </button>
                </div>
            </PageHeader>

            {/* Content */}
            {activeTab === 'analytics' && (
                <div key="analytics" className="animate-fade-in">
                    <ComponentErrorBoundary componentName="Cost Analytics">
                        <Suspense fallback={<div className="flex justify-center py-20"><div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
                            <CostAnalyticsView />
                        </Suspense>
                    </ComponentErrorBoundary>
                </div>
            )}
            {activeTab === 'report' && (
                <div key="report" className="animate-fade-in">
                    <ComponentErrorBoundary componentName="Weekly Report">
                        <Suspense fallback={<div className="flex justify-center py-20"><div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
                            <WeeklyReportView />
                        </Suspense>
                    </ComponentErrorBoundary>
                </div>
            )}
            {activeTab === 'fraud' && (
                <div key="fraud" className="animate-fade-in">
                    <ComponentErrorBoundary componentName="Fraud Detection">
                        <Suspense fallback={<div className="flex justify-center py-20"><div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
                            <AnomalyDetectionView />
                        </Suspense>
                    </ComponentErrorBoundary>
                </div>
            )}
        </div>
    );
};

export default InsightsView;
