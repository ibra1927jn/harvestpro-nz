/**
 * LogisticsWorkspace — el cuerpo de Logística, compartido por dos sitios:
 *   - la página del rol Logística (`pages/LogisticsDept.tsx`), que pone las
 *     pestañas en su navegación (barra inferior / lateral);
 *   - la pestaña Logística del manager (`manager/LogisticsView.tsx`), que las
 *     enseña como botones dentro de la página (`showTabBar`).
 *
 * Así el manager tiene TODA la logística en una sola pantalla (flota,
 * solicitudes, bins, historial) sin saltar a otra página. Antes (desde el
 * commit d5ce6e3, 2026-04-14) solo veía un panel de solo lectura y un botón
 * «Ver logística completa» que lo mandaba a /logistics-dept.
 */
import React, { Suspense } from 'react';
import SummaryCard from '@/components/ui/SummaryCard';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import ComponentErrorBoundary from '@/components/ui/ComponentErrorBoundary';
import { useLogistics } from '@/hooks/useLogistics';
import { LOG_NAV_ITEMS } from '@/config/navigation/logistics.nav';
import { useTranslation } from '@/i18n';

// Vistas cargadas bajo demanda (code-split)
const FleetTab = React.lazy(() => import('@/components/views/logistics/FleetTab'));
const BinsTab = React.lazy(() => import('@/components/views/logistics/BinsTab'));
const RequestsTab = React.lazy(() => import('@/components/views/logistics/RequestsTab'));
const HistoryTab = React.lazy(() => import('@/components/views/logistics/HistoryTab'));

export type LogisticsTabId = 'fleet' | 'bins' | 'requests' | 'history';

export const LOGISTICS_TAB_IDS: readonly LogisticsTabId[] = ['fleet', 'bins', 'requests', 'history'];

export function isLogisticsTabId(id: string): id is LogisticsTabId {
    return (LOGISTICS_TAB_IDS as readonly string[]).includes(id);
}

const TabLoader = () => (
    <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-3 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
    </div>
);

interface LogisticsWorkspaceProps {
    activeTab: LogisticsTabId;
    onTabChange: (tab: LogisticsTabId) => void;
    /** Pestañas dentro de la página (manager). La página de Logística las lleva en su navegación. */
    showTabBar?: boolean;
    /** Número de solicitudes pendientes para quien pinta las pestañas fuera (badge) */
    onPendingRequests?: (n: number) => void;
}

const LogisticsWorkspace: React.FC<LogisticsWorkspaceProps> = ({ activeTab, onTabChange, showTabBar = false, onPendingRequests }) => {
    const { t } = useTranslation();
    const { summary, tractors, bins, requests, history, isLoading, reload } = useLogistics();

    React.useEffect(() => {
        onPendingRequests?.(summary.pendingRequests);
    }, [summary.pendingRequests, onPendingRequests]);

    if (isLoading) {
        return (
            <div className="space-y-4" data-testid="logistics-loading">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    <LoadingSkeleton type="metric" count={3} />
                </div>
                <LoadingSkeleton type="card" count={3} />
            </div>
        );
    }

    const renderContent = () => {
        switch (activeTab) {
            case 'bins': return <ComponentErrorBoundary componentName="Bin Inventory"><BinsTab bins={bins} summary={summary} /></ComponentErrorBoundary>;
            case 'requests': return <ComponentErrorBoundary componentName="Requests"><RequestsTab requests={requests} tractors={tractors} onRefresh={reload} /></ComponentErrorBoundary>;
            case 'history': return <ComponentErrorBoundary componentName="History"><HistoryTab history={history} /></ComponentErrorBoundary>;
            case 'fleet':
            default: return <ComponentErrorBoundary componentName="Fleet"><FleetTab tractors={tractors} /></ComponentErrorBoundary>;
        }
    };

    const totalBins = summary.fullBins + summary.emptyBins || 1;

    return (
        <div>
            {/* Estado en vivo */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3 mb-4">
                <span className="size-2.5 bg-emerald-500 rounded-full" />
                <p className="text-sm font-medium text-emerald-800">
                    {t('logi.live_status', { tractors: summary.activeTractors, bins: summary.binsInTransit })}
                </p>
            </div>

            {/* Resumen */}
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

            {/* Pestañas dentro de la página (manager) */}
            {showTabBar && (
                <div role="tablist" aria-label={t('roles.logistics')} className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit max-w-full overflow-x-auto mb-4">
                    {LOG_NAV_ITEMS.map(item => {
                        const id = item.id as LogisticsTabId;
                        const selected = activeTab === id;
                        const badge = id === 'requests' && summary.pendingRequests > 0 ? summary.pendingRequests : null;
                        return (
                            <button
                                key={id}
                                type="button"
                                role="tab"
                                aria-selected={selected}
                                onClick={() => onTabChange(id)}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all min-h-[40px] ${selected ? 'bg-white text-teal-700 shadow-sm' : 'text-text-sub hover:text-text-main'}`}
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-base">{item.icon}</span>
                                {item.labelKey ? t(item.labelKey) : item.label}
                                {badge !== null && (
                                    <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center">{badge}</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Contenido de la pestaña */}
            <div key={activeTab} className="animate-fade-in">
                <Suspense fallback={<TabLoader />}>
                    {renderContent()}
                </Suspense>
            </div>
        </div>
    );
};

export default LogisticsWorkspace;
