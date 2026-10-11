/**
 * AnomalyCard — Individual anomaly card for the Fraud Shield grid
 */
import React from 'react';
import type { Anomaly } from '../../../../services/fraud-detection.service';
import { ANOMALY_CONFIG, SEVERITY_STYLES, RULE_BADGE } from './anomaly.constants';

interface AnomalyCardProps {
    anomaly: Anomaly;
    index: number;
    onViewProfile: (pickerId: string) => void;
}

const AnomalyCard: React.FC<AnomalyCardProps> = ({ anomaly, index, onViewProfile }) => {
    const config = ANOMALY_CONFIG[anomaly.type];
    const ruleBadge = RULE_BADGE[anomaly.rule] || RULE_BADGE['elapsed_velocity'];

    return (
        <div
            onClick={() => onViewProfile(anomaly.pickerId)}
            className={`glass-card card-hover rounded-xl p-5 border border-slate-200 cursor-pointer group flex flex-col justify-between section-enter stagger-${Math.min(index + 1, 8)}`}
        >
            <div>
                <div className="flex justify-between items-start mb-4">
                    <div className="flex gap-3">
                        <div className={`p-3 ${config.bg} rounded-xl border border-slate-100`}>
                            <span className={`material-symbols-outlined text-xl ${config.color}`}>
                                {config.icon}
                            </span>
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-800 group-hover:text-primary transition-colors">
                                {anomaly.pickerName}
                            </h4>
                            <p className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs">schedule</span>
                                {new Date(anomaly.timestamp).toLocaleTimeString([], { timeZone: 'Pacific/Auckland',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${SEVERITY_STYLES[anomaly.severity]}`}>
                            {anomaly.severity} risk
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${ruleBadge.color}`}>
                            {ruleBadge.label}
                        </span>
                    </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <p className="text-sm text-slate-700 font-medium">{anomaly.detail}</p>
                </div>

                {/* Evidence pills */}
                {anomaly.evidence && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                        {Object.entries(anomaly.evidence)
                            .filter(([k]) => !['note'].includes(k))
                            .slice(0, 4)
                            .map(([key, value]) => (
                                <span key={key} className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-mono rounded">
                                    {key.replace(/([A-Z])/g, ' $1').toLowerCase()}: {typeof value === 'object' ? '...' : String(value)}
                                </span>
                            ))}
                    </div>
                )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-xs font-bold text-slate-400 group-hover:text-primary transition-colors">
                <span>Inspect Profile & History</span>
                <span className="material-symbols-outlined text-lg">chevron_right</span>
            </div>
        </div>
    );
};

export default AnomalyCard;
