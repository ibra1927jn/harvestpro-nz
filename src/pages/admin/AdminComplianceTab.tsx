/**
 * AdminComplianceTab — Compliance overview panel for Admin page
 */
import React from 'react';
import type { OrchardOverview } from '@/services/admin.service';
import ComponentErrorBoundary from '@/components/ui/ComponentErrorBoundary';
import { useTranslation } from '@/i18n';

interface AdminComplianceTabProps {
    orchards: OrchardOverview[];
}

const ComplianceCard: React.FC<{
    title: string;
    score: number;
    status: string;
    details: string;
}> = ({ title, score, status, details }) => (
    <div className="text-center">
        <div className={`text-3xl font-bold ${score >= 95 ? 'text-green-600' : score >= 80 ? 'text-amber-600' : 'text-red-600'}`}>
            {score}%
        </div>
        <div className="text-sm font-semibold text-text-primary mt-1">{title}</div>
        <div className="text-xs text-text-secondary mt-0.5">{status}</div>
        <div className="text-xs text-text-muted mt-0.5">{details}</div>
    </div>
);

const AdminComplianceTab: React.FC<AdminComplianceTabProps> = ({ orchards }) => {
    const { t } = useTranslation();
    return (
    <ComponentErrorBoundary componentName="Compliance">
        <div className="space-y-4">
            <h2 className="text-lg font-semibold text-text-primary">{t('admin.compliance_overview')}</h2>
            <div className="bg-white rounded-lg border border-border-light shadow-sm p-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <ComplianceCard title={t('admin.cc.employment_act')} score={98} status={t('admin.cc.compliant')} details={t('admin.cc.wages_above_min')} />
                    <ComplianceCard title={t('admin.cc.safety')} score={95} status={t('admin.cc.pending', { n: 2 })} details={t('admin.cc.verified_of', { n: 95, total: 97 })} />
                    <ComplianceCard title={t('admin.cc.audit_trail')} score={100} status={t('common.active')} details={t('admin.cc.all_logged')} />
                </div>
            </div>
            <div className="bg-white rounded-lg border border-border-light shadow-sm p-5">
                <h3 className="text-sm font-semibold text-text-primary mb-3">{t('admin.cross_orchard')}</h3>
                {orchards.map(orch => (
                    <div key={orch.id} className="flex items-center justify-between py-2 border-b border-border-light last:border-0">
                        <span className="text-sm font-medium text-text-primary">{orch.name}</span>
                        <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-surface-secondary rounded-full overflow-hidden">
                                <div className="h-full bg-green-500 rounded-full" style={{ width: `${orch.compliance_score}%` }} />
                            </div>
                            <span className="text-xs text-text-secondary w-10 text-right">{orch.compliance_score}%</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    </ComponentErrorBoundary>
    );
};

export default AdminComplianceTab;
