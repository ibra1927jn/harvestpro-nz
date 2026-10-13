/**
 * HistoryTab.tsx — Logistics Transport History
 * Today's transport log with trip details
 */
import React from 'react';
import { TransportLog } from '@/services/logistics-dept.service';
import { useTranslation } from '@/i18n';
import { formatNZTime } from '@/utils/nzFormat';

interface HistoryTabProps {
    history: TransportLog[];
}

const HistoryTab: React.FC<HistoryTabProps> = ({ history }) => {
    const { t } = useTranslation();
    return (
    <div className="space-y-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border-light">
            <h3 className="font-bold text-text-primary text-sm mb-1">{t('logi.transport_log')}</h3>
            <p className="text-xs text-text-secondary">{t('logi.trips_n', { n: history.length })}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {history.map(log => (
                <div key={log.id} className="bg-white rounded-xl p-4 shadow-sm border border-border-light">
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-text-primary text-sm">{log.tractor_name}</span>
                            <span className="text-xs text-text-secondary">• {log.driver_name}</span>
                        </div>
                        <span className="text-xs font-mono text-text-muted">
                            {formatNZTime(log.started_at)}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-text-secondary">
                        <span className="font-medium">{log.from_zone}</span>
                        <span aria-hidden="true" className="material-symbols-outlined text-xs text-text-muted">arrow_forward</span>
                        <span className="font-medium">{log.to_zone}</span>
                        <span>•</span>
                        <span>{t('dashboard.velocity.tooltip_bins', { n: log.bins_count })}</span>
                        <span>•</span>
                        <span>{t('logi.minutes_n', { n: log.duration_minutes })}</span>
                    </div>
                </div>
            ))}
        </div>
    </div>
    );
};

export default HistoryTab;
