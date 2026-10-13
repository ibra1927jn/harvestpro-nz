/**
 * BinsTab.tsx — Logistics Bin Inventory
 * Bin overview stats + individual bin cards with fill progress bars
 */
import React from 'react';
import EmptyState from '@/components/ui/EmptyState';
import { BinInventory, LogisticsSummary } from '@/services/logistics-dept.service';
import { useTranslation } from '@/i18n';
import { statusLabel } from '@/i18n/statusLabel';

interface BinsTabProps {
    bins: BinInventory[];
    summary: LogisticsSummary;
}

const BinsTab: React.FC<BinsTabProps> = ({ bins, summary }) => {
    const { t } = useTranslation();
    return (
    <div className="space-y-4">
        {/* Bin Overview */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border-light">
            <h3 className="font-bold text-text-primary text-sm mb-3">{t('logi.bins_overview')}</h3>
            <div className="grid grid-cols-4 gap-3 text-center">
                {[
                    { label: t('status.empty'), count: summary.emptyBins, color: 'text-text-secondary' },
                    { label: t('status.filling'), count: bins.filter(b => b.status === 'filling').length, color: 'text-amber-600' },
                    { label: t('status.full'), count: summary.fullBins, color: 'text-red-600' },
                    { label: t('logi.transit'), count: summary.binsInTransit, color: 'text-sky-600' },
                ].map((item, i) => (
                    <div key={i}>
                        <p className={`text-xl font-black ${item.color}`}>{item.count}</p>
                        <p className="text-[10px] text-text-secondary uppercase font-bold">{item.label}</p>
                    </div>
                ))}
            </div>
        </div>

        {bins.length === 0 && (
            <EmptyState
                icon="inventory_2"
                title={t('logi.no_bins')}
                subtitle={t('logi.no_bins_desc')}
                compact
            />
        )}

        {/* Bin Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {bins.map(bin => (
                <div key={bin.id} className="bg-white rounded-xl p-4 shadow-sm border border-border-light">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="font-bold text-text-primary text-sm">#{bin.bin_code}</h4>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${bin.status === 'full' ? 'bg-red-50 text-red-700' :
                            bin.status === 'in_transit' ? 'bg-sky-50 text-sky-700' :
                                bin.status === 'filling' ? 'bg-amber-50 text-amber-700' :
                                    'bg-surface-secondary text-text-secondary'
                            }`}>{statusLabel(t, bin.status)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-secondary">
                        <span>{t('logi.zone', { zone: bin.zone })}</span>
                        <span>•</span>
                        <span>{t('logi.pct_full', { n: bin.fill_percentage })}</span>
                    </div>
                    <div className="mt-2 h-1.5 bg-surface-secondary rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${bin.fill_percentage > 80 ? 'bg-red-400' :
                            bin.fill_percentage > 50 ? 'bg-amber-400' : 'bg-emerald-400'
                            }`} style={{ width: `${bin.fill_percentage}%` }} />
                    </div>
                </div>
            ))}
        </div>
    </div>
    );
};

export default BinsTab;
