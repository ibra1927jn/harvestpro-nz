/**
 * AdminOrchardsTab — Orchards listing panel for Admin page
 */
import React from 'react';
import type { OrchardOverview } from '@/services/admin.service';
import EmptyState from '@/components/ui/EmptyState';
import ComponentErrorBoundary from '@/components/ui/ComponentErrorBoundary';

interface AdminOrchardsTabProps {
    orchards: OrchardOverview[];
    onNewOrchard: () => void;
}

const AdminOrchardsTab: React.FC<AdminOrchardsTabProps> = ({ orchards, onNewOrchard }) => (
    <ComponentErrorBoundary componentName="Orchards">
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text-primary">All Orchards</h2>
                <button
                    onClick={onNewOrchard}
                    className="flex items-center gap-1 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors"
                >
                    <span aria-hidden="true" className="material-symbols-outlined text-sm">add</span>
                    New Orchard
                </button>
            </div>
            {orchards.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {orchards.map(orch => (
                        <div key={orch.id} className="bg-white rounded-lg border border-border-light shadow-sm p-5">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h3 className="text-base font-semibold text-text-primary">{orch.name}</h3>
                                    <p className="text-xs text-text-secondary mt-0.5">{orch.total_rows} rows</p>
                                </div>
                                <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">
                                    Active
                                </span>
                            </div>
                            <div className="grid grid-cols-3 gap-3 text-center">
                                <div>
                                    <div className="text-xl font-bold text-text-primary">{orch.active_pickers}</div>
                                    <div className="text-xs text-text-secondary">Pickers</div>
                                </div>
                                <div>
                                    <div className="text-xl font-bold text-text-primary">{orch.today_buckets}</div>
                                    <div className="text-xs text-text-secondary">Buckets</div>
                                </div>
                                <div>
                                    <div className="text-xl font-bold text-green-600">{orch.compliance_score}%</div>
                                    <div className="text-xs text-text-secondary">Compliance</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <EmptyState icon="apartment" title="No orchards found" compact />
            )}
        </div>
    </ComponentErrorBoundary>
);

export default AdminOrchardsTab;
