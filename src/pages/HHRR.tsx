/**
 * HHRR.TSX — Human Resources Department
 *
 * Refactored architecture:
 *   HHRR.tsx             — Thin orchestrator
 *   useHHRR.ts           — Data hook (loading, summaries)
 *   hhrrNav.config.ts    — Navigation items
 *   SummaryCard          — Reusable metric card
 *   hhrr/                — Tab view components (lazy-loaded)
 */
import React, { useState, Suspense } from 'react';
import ResponsiveLayout from '@/components/common/ResponsiveLayout';
import SummaryCard from '@/components/ui/SummaryCard';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import ComponentErrorBoundary from '@/components/ui/ComponentErrorBoundary';
import { useHHRR } from '@/hooks/useHHRR';
import { HR_NAV_ITEMS } from '@/config/navigation/hhrr.nav';
import AddPickerModal from '@/components/modals/AddPickerModal';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { setEmployeeActive, type Employee } from '@/services/hhrr.service';
import { formatNZD } from '@/utils/nzFormat';
import { useTranslation } from '@/i18n';

// Lazy-loaded views (code-split for performance)
const EmployeesTab = React.lazy(() => import('@/components/views/hhrr/EmployeesTab'));
const ContractsTab = React.lazy(() => import('@/components/views/hhrr/ContractsTab'));
const PayrollTab = React.lazy(() => import('@/components/views/hhrr/PayrollTab'));
const DocumentsTab = React.lazy(() => import('@/components/views/hhrr/DocumentsTab'));
const CalendarTab = React.lazy(() => import('@/components/views/hhrr/CalendarTab'));
const SeasonalPlanningTab = React.lazy(() => import('@/components/views/hhrr/SeasonalPlanningTab'));

const TabLoader = () => (
    <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
    </div>
);

const HHRR: React.FC = () => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('employees');
    const { summary, employees, payroll, alerts, isLoading, reload } = useHHRR();
    const addPicker = useHarvestStore(s => s.addPicker);
    const [showAddPicker, setShowAddPicker] = useState(false);

    // Alta/baja de una persona: se guarda y se recarga; si falla, se dice
    const updateEmployee = async (emp: Employee, changes: Partial<Employee>): Promise<string | null> => {
        if (!changes.status) return null;
        try {
            await setEmployeeActive(emp, changes.status === 'active');
            reload();
            return null;
        } catch (e) {
            return e instanceof Error ? e.message : 'Not saved';
        }
    };

    const navItems = HR_NAV_ITEMS.map(item => ({
        ...item,
        badge: item.id === 'employees' ? summary.complianceAlerts : undefined,
    }));

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background-light p-6">
                <div className="max-w-6xl mx-auto space-y-4">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <LoadingSkeleton type="metric" count={4} />
                    </div>
                    <LoadingSkeleton type="list" count={5} />
                </div>
            </div>
        );
    }

    const renderContent = () => {
        switch (activeTab) {
            case 'employees': return <ComponentErrorBoundary componentName="Employees"><EmployeesTab employees={employees} alerts={alerts} onUpdateEmployee={updateEmployee} onAddPicker={() => setShowAddPicker(true)} /></ComponentErrorBoundary>;
            case 'contracts': return <ComponentErrorBoundary componentName="Contracts"><ContractsTab employees={employees} summary={summary} onRefresh={reload} /></ComponentErrorBoundary>;
            case 'payroll': return <ComponentErrorBoundary componentName="Payroll"><PayrollTab payroll={payroll} summary={summary} /></ComponentErrorBoundary>;
            case 'documents': return <ComponentErrorBoundary componentName="Documents"><DocumentsTab /></ComponentErrorBoundary>;
            case 'calendar': return <ComponentErrorBoundary componentName="Calendar"><CalendarTab /></ComponentErrorBoundary>;
            case 'planning': return <ComponentErrorBoundary componentName="Seasonal Planning"><SeasonalPlanningTab employees={employees} /></ComponentErrorBoundary>;
            default: return <ComponentErrorBoundary componentName="Employees"><EmployeesTab employees={employees} alerts={alerts} onUpdateEmployee={updateEmployee} onAddPicker={() => setShowAddPicker(true)} /></ComponentErrorBoundary>;
        }
    };

    return (
        <ResponsiveLayout
            navItems={navItems}
            mobileTabs={navItems}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            title={t('hr.page_title')}
            subtitle={t('hr.page_subtitle')}
            accentColor="purple"
            titleIcon="badge"
        >
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <SummaryCard icon="group" iconColor="text-emerald-500" label={t('hr.active_workers')} value={summary.activeWorkers} />
                <SummaryCard icon="description" iconColor="text-amber-500" label={t('hr.pending_contracts')} value={summary.pendingContracts} />
                <SummaryCard icon="payments" iconColor="text-indigo-500" label={t('hr.payroll_week')} value={`${formatNZD(summary.payrollThisWeek / 1000, 1)}k`} />
                <SummaryCard icon="warning" iconColor="text-red-500" label={t('hr.compliance_alerts')} value={summary.complianceAlerts} />
            </div>

            {showAddPicker && (
                <AddPickerModal
                    onClose={() => setShowAddPicker(false)}
                    onAdd={async (p) => { await addPicker(p); reload(); }}
                />
            )}

            {/* Tab Content */}
            <div key={activeTab} className="animate-fade-in">
                <Suspense fallback={<TabLoader />}>
                    {renderContent()}
                </Suspense>
            </div>
        </ResponsiveLayout>
    );
};

export default HHRR;

