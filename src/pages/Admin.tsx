/**
 * Admin.tsx — System Admin Dashboard (orchestrator)
 *
 * Refactored architecture:
 *   Admin.tsx              — Thin orchestrator
 *   useAdmin.ts            — Data hook (loading, user management)
 *   adminNav.config.ts     — Navigation items & summary card configs
 *   SummaryCard            — Reusable metric card
 *   admin/                 — Tab content components (lazy-loaded)
 */
import React, { useState, Suspense } from 'react';
import DesktopLayout from '@/components/common/DesktopLayout';
import SummaryCard from '@/components/ui/SummaryCard';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import ComponentErrorBoundary from '@/components/ui/ComponentErrorBoundary';
import EmptyState from '@/components/ui/EmptyState';
import SetupWizard from '@/components/common/SetupWizard';
import { useAdmin } from '@/hooks/useAdmin';
import { ADMIN_NAV_ITEMS, ADMIN_SUMMARY_CARDS, type AdminTab } from '@/config/navigation/admin.nav';

// Lazy-loaded tab content (code-split for performance)
const AdminOrchardsTab = React.lazy(() => import('./admin/AdminOrchardsTab'));
const AdminUsersTab = React.lazy(() => import('./admin/AdminUsersTab'));
const AdminComplianceTab = React.lazy(() => import('./admin/AdminComplianceTab'));
const AuditLogViewer = React.lazy(() => import('@/components/AuditLogViewer').then(m => ({ default: m.AuditLogViewer })));

const TabLoader = () => (
    <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-3 border-red-200 border-t-red-600 rounded-full animate-spin" />
    </div>
);

export default function Admin() {
    const [activeTab, setActiveTab] = useState<AdminTab>('orchards');
    const [showWizard, setShowWizard] = useState(false);
    const admin = useAdmin();

    const navItems = ADMIN_NAV_ITEMS.map(item => ({
        ...item,
        badge: item.id === 'users' ? admin.activeUsers : undefined,
    }));

    const summaryValues: Record<string, string | number> = {
        orchards: admin.orchards.length,
        active: admin.activeUsers,
        total: admin.users.length,
        compliance: admin.complianceRate,
    };

    if (admin.isLoading) {
        return (
            <div className="min-h-screen bg-background-light p-6">
                <div className="max-w-6xl mx-auto space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <LoadingSkeleton type="card" count={4} />
                    </div>
                </div>
            </div>
        );
    }

    const renderContent = () => {
        switch (activeTab) {
            case 'orchards':
                return <AdminOrchardsTab orchards={admin.orchards} onNewOrchard={() => setShowWizard(true)} />;
            case 'users':
                return (
                    <AdminUsersTab
                        users={admin.users} userSearch={admin.userSearch} roleFilter={admin.roleFilter}
                        onSearchChange={admin.setUserSearch} onRoleFilterChange={admin.setRoleFilter}
                        onRoleChange={admin.handleRoleChange} onToggleActive={admin.handleToggleActive}
                        actionError={admin.actionError}
                    />
                );
            case 'compliance':
                return <AdminComplianceTab orchards={admin.orchards} />;
            case 'audit':
                return <ComponentErrorBoundary componentName="Audit Log"><AuditLogViewer /></ComponentErrorBoundary>;
            default:
                return <ComponentErrorBoundary componentName="Orchards"><EmptyState icon="apartment" title="Select a tab" compact /></ComponentErrorBoundary>;
        }
    };

    return (
        <>
            <DesktopLayout
                navItems={navItems}
                activeTab={activeTab}
                onTabChange={(id) => setActiveTab(id as AdminTab)}
                title="HarvestPro Admin"
                accentColor="red"
                titleIcon="shield"
            >
                {/* Summary Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                    {ADMIN_SUMMARY_CARDS.map(card => (
                        <SummaryCard
                            key={card.key}
                            icon={card.icon}
                            iconColor={card.color}
                            label={card.label}
                            value={summaryValues[card.key]}
                            highlight={card.key === 'compliance'}
                            highlightColor="emerald"
                        />
                    ))}
                </div>

                {/* Tab Content */}
                <div key={activeTab} className="animate-fade-in">
                    <Suspense fallback={<TabLoader />}>
                        {renderContent()}
                    </Suspense>
                </div>
            </DesktopLayout>

            {/* Setup Wizard Modal */}
            {showWizard && (
                <SetupWizard
                    onComplete={() => { setShowWizard(false); admin.reload(); }}
                    onCancel={() => setShowWizard(false)}
                />
            )}
        </>
    );
}

