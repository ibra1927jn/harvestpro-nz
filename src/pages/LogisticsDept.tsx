/**
 * LOGISTICS DEPARTMENT — LogisticsDept.tsx
 *
 * Refactored architecture:
 *   LogisticsDept.tsx         — Thin orchestrator
 *   useLogistics.ts           — Data hook (loading, realtime)
 *   logisticsNav.config.ts    — Navigation items
 *   SummaryCard               — Reusable metric card
 *   logistics/                — Tab view components (lazy-loaded)
 */
import React, { useState, Suspense } from 'react';
import ResponsiveLayout from '@/components/common/ResponsiveLayout';
import SummaryCard from '@/components/ui/SummaryCard';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import ComponentErrorBoundary from '@/components/ui/ComponentErrorBoundary';
import { useLogistics } from '@/hooks/useLogistics';
import { LOG_NAV_ITEMS } from '@/config/navigation/logistics.nav';
import { useTranslation } from '@/i18n';

// Lazy-loaded views (code-split for performance)
const FleetTab = React.lazy(() => import('@/components/views/logistics/FleetTab'));
const BinsTab = React.lazy(() => import('@/components/views/logistics/BinsTab'));
const RequestsTab = React.lazy(() => import('@/components/views/logistics/RequestsTab'));
const HistoryTab = React.lazy(() => import('@/components/views/logistics/HistoryTab'));

const TabLoader = () => (
    <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-3 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
    </div>
);

const LogisticsDept: React.FC = () => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('fleet');
    const { summary, tractors, bins, requests, history, isLoading, reload } = useLogistics();

    const navItems = LOG_NAV_ITEMS.map(item => ({
        ...item,
        badge: item.id === 'requests' ? summary.pendingRequests : undefined,
    }));

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background-light p-6">
                <div className="max-w-6xl mx-auto space-y-4">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        <LoadingSkeleton type="metric" count={3} />
                    </div>
                    <LoadingSkeleton type="card" count={3} />
                </div>
            </div>
        );
    }

    const renderContent = () => {
        switch (activeTab) {
            case 'fleet': return <ComponentErrorBoundary componentName="Fleet"><FleetTab tractors={tractors} /></ComponentErrorBoundary>;
            case 'bins': return <ComponentErrorBoundary componentName="Bin Inventory"><BinsTab bins={bins} summary={summary} /></ComponentErrorBoundary>;
            case 'requests': return <ComponentErrorBoundary componentName="Requests"><RequestsTab requests={requests} tractors={tractors} onRefresh={reload} /></ComponentErrorBoundary>;
            case 'history': return <ComponentErrorBoundary componentName="History"><HistoryTab history={history} /></ComponentErrorBoundary>;
            default: return <ComponentErrorBoundary componentName="Fleet"><FleetTab tractors={tractors} /></ComponentErrorBoundary>;
        }
    };

    const totalBins = summary.fullBins + summary.emptyBins || 1;

    return (
        <ResponsiveLayout
            navItems={navItems}
            mobileTabs={navItems}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            title={t('roles.logistics')}
            subtitle={t('logi.subtitle')}
            accentColor="teal"
            titleIcon="local_shipping"
        >
            {/* Live Status Banner */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3 mb-4">
                <span className="size-2.5 bg-emerald-500 rounded-full" />
                <p className="text-sm font-medium text-emerald-800">
                    {t('logi.live_status', { tractors: summary.activeTractors, bins: summary.binsInTransit })}
                </p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <SummaryCard
                    icon="inventory_2" iconColor="text-red-500" label={t('logi.full_bins')}
                    value={summary.fullBins}
                    progress={(summary.fullBins / totalBins) * 100}
                    progressColor="bg-red-400"
                />
                <SummaryCard
                    icon="check_box_outline_blank" iconColor="text-emerald-500" label={t('runner.empty_bins')}
                    value={summary.emptyBins}
                    progress={(summary.emptyBins / totalBins) * 100}
                    progressColor="bg-emerald-400"
                />
                <SummaryCard icon="agriculture" iconColor="text-indigo-500" label={t('logi.active_tractors')} value={summary.activeTractors} />
                <SummaryCard icon="swap_horiz" iconColor="text-amber-500" label={t('logi.transport_requests')} value={summary.pendingRequests} />
            </div>

            {/* Tab Content */}
            <div key={activeTab} className="animate-fade-in">
                <Suspense fallback={<TabLoader />}>
                    {renderContent()}
                </Suspense>
            </div>
        </ResponsiveLayout>
    );
};

export default LogisticsDept;

