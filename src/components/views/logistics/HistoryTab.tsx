/**
 * HistoryTab.tsx — Logistics Transport History
 * Today's transport log with trip details
 */
import React from 'react';
import { TransportLog } from '@/services/logistics-dept.service';

interface HistoryTabProps {
    history: TransportLog[];
}

const HistoryTab: React.FC<HistoryTabProps> = ({ history }) => (
    <div className="space-y-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border-light">
            <h3 className="font-bold text-text-primary text-sm mb-1">Today's Transport Log</h3>
            <p className="text-xs text-text-secondary">{history.length} trips completed</p>
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
                            {new Date(log.started_at).toLocaleTimeString('en-NZ', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-text-secondary">
                        <span className="font-medium">{log.from_zone}</span>
                        <span aria-hidden="true" className="material-symbols-outlined text-xs text-text-muted">arrow_forward</span>
                        <span className="font-medium">{log.to_zone}</span>
                        <span>•</span>
                        <span>{log.bins_count} bins</span>
                        <span>•</span>
                        <span>{log.duration_minutes} min</span>
                    </div>
                </div>
            ))}
        </div>
    </div>
);

export default HistoryTab;
