/**
 * Payroll Page — Payroll Admin Department
 *
 * Refactored architecture:
 *   Payroll.tsx              — Thin orchestrator (~60 lines)
 *   usePayroll.ts            — Data hook (loading, summaries)
 *   payroll/
 *     └── PayrollTabs.tsx    — SummaryCard, PayrollDashboard, TimesheetsTab, WageCalculatorTab, ExportTab
 *   payroll/ExportHistoryTab — (existing) Export history component
 */
import React, { useState } from 'react';
import ResponsiveLayout from '@/components/common/ResponsiveLayout';
import type { NavItem } from '@/components/common/DesktopLayout';
import { usePayroll } from '@/hooks/usePayroll';
import { SummaryCard, PayrollDashboard, TimesheetsTab, WageCalculatorTab, ExportTab } from '@/components/views/payroll/PayrollTabs';
import ExportHistoryTab from '@/components/views/payroll/ExportHistoryTab';
import { PayWeekCloseBar } from '@/components/views/payroll/PayWeekCloseBar';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import ComponentErrorBoundary from '@/components/ui/ComponentErrorBoundary';
import { UnclosedShiftsAlert } from '@/components/common/UnclosedShiftsAlert';
import { formatNZNumber } from '@/utils/nzFormat';

const PAYROLL_NAV: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', labelKey: 'nav.dashboard', icon: 'dashboard' },
    { id: 'timesheets', label: 'Timesheets', labelKey: 'nav.timesheets', icon: 'schedule' },
    { id: 'wages', label: 'Wage Calculator', labelKey: 'nav.wage_calculator', icon: 'calculate' },
    { id: 'export', label: 'Export', labelKey: 'nav.export', icon: 'download' },
    { id: 'history', label: 'History', labelKey: 'nav.history', icon: 'history' },
];

const Payroll: React.FC = () => {
    const [activeTab, setActiveTab] = useState('dashboard');
    const pay = usePayroll();

    const navItems = PAYROLL_NAV.map(item => ({
        ...item,
        badge: item.id === 'dashboard' && pay.compliance.workers_below_minimum > 0 ? pay.compliance.workers_below_minimum : undefined,
    }));

    if (pay.isLoading && !pay.hasLoadedOnce) {
        return (
            <div className="min-h-screen bg-background-light p-6">
                <div className="max-w-6xl mx-auto space-y-4">
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3"><LoadingSkeleton type="metric" count={5} /></div>
                    <LoadingSkeleton type="table" count={8} />
                </div>
            </div>
        );
    }

    return (
        <ResponsiveLayout navItems={navItems} mobileTabs={navItems} activeTab={activeTab} onTabChange={setActiveTab} title="Payroll Admin" subtitle="Wages & compliance" accentColor="orange" titleIcon="payments">
            {/* Semana de pago: la nómina es semanal y se cierra el lunes siguiente */}
            <div className="flex items-center justify-between gap-3 mb-4" data-testid="pay-week-selector">
                <button type="button" onClick={() => pay.goToWeek(-1)} aria-label="Previous pay week" className="p-2 rounded-xl hover:bg-slate-100">
                    <span aria-hidden="true" className="material-symbols-outlined">chevron_left</span>
                </button>
                <div className="text-center">
                    <p className="text-sm font-extrabold text-slate-800">Pay week {pay.week.start} → {pay.week.end}</p>
                    <p className="text-[11px] uppercase tracking-widest font-bold text-slate-400">Closes Monday {pay.week.closesOn}</p>
                </div>
                <button type="button" onClick={() => pay.goToWeek(1)} aria-label="Next pay week" className="p-2 rounded-xl hover:bg-slate-100">
                    <span aria-hidden="true" className="material-symbols-outlined">chevron_right</span>
                </button>
            </div>

            <PayWeekCloseBar
                weekEnd={pay.week.end}
                closedInfo={pay.closedInfo}
                canManageWeek={pay.canManageWeek}
                weekFinished={pay.weekFinished}
                closing={pay.closing}
                closeResult={pay.closeResult}
                onClose={pay.closeWeek}
                onReopen={pay.reopenWeek}
            />

            <div className="mb-4">
                <UnclosedShiftsAlert hint="Ask the team leader or manager to fix the check-out time in the timesheets before closing the week." />
            </div>

            {pay.error && (
                <div role="alert" className="bg-red-50 border border-red-200 rounded-2xl px-5 py-3 mb-4 text-sm font-bold text-red-700">{pay.error}</div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
                <SummaryCard icon="inventory_2" iconColor="text-indigo-500" label="Total Buckets" value={formatNZNumber(pay.summary.total_buckets)} />
                <SummaryCard icon="schedule" iconColor="text-sky-500" label="Total Hours" value={`${pay.summary.total_hours.toFixed(1)}h`} />
                <SummaryCard icon="payments" iconColor="text-emerald-500" label="Piece Rate" value={`$${pay.summary.total_piece_rate_earnings.toFixed(0)}`} />
                <SummaryCard icon="shield" iconColor="text-amber-500" label="Top-Up Required" value={`$${pay.summary.total_top_up.toFixed(0)}`} />
                <SummaryCard icon="account_balance" iconColor="text-orange-600" label="Total Payroll" value={`$${pay.summary.total_earnings.toFixed(0)}`} highlight />
            </div>

            {(pay.summary.total_alternative_holidays_owed ?? 0) > 0 && (
                <div
                    data-testid="payroll-alt-days-banner"
                    className="bg-violet-50/80 backdrop-blur-md border border-violet-200/60 rounded-2xl px-5 py-3 flex items-center gap-3 mb-5"
                >
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-violet-600">event_available</span>
                    <p className="text-sm font-bold text-violet-900">
                        {pay.summary.total_alternative_holidays_owed} alternative day{(pay.summary.total_alternative_holidays_owed ?? 0) === 1 ? '' : 's'} owed
                        <span className="ml-2 text-[11px] font-semibold uppercase tracking-widest text-violet-600">
                            Holidays Act s.60
                        </span>
                    </p>
                </div>
            )}

            {pay.compliance.workers_below_minimum > 0 && (
                <div className="bg-amber-50/80 backdrop-blur-md border border-amber-200/60 rounded-2xl px-5 py-4 flex items-center gap-4 mb-5 shadow-[0_4px_20px_rgb(245,158,11,0.06)] relative overflow-hidden">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/50 to-transparent"></div>
                    <div className="size-10 rounded-xl bg-amber-100/80 flex items-center justify-center shrink-0 shadow-inner border border-amber-200/50">
                        <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-amber-600">shield</span>
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-extrabold text-amber-900 tracking-tight">
                            Wage Shield Active
                        </p>
                        <p className="text-[11px] font-bold text-amber-600/80 uppercase tracking-widest mt-0.5">
                            {pay.compliance.workers_below_minimum} of {pay.compliance.workers_total} workers • {pay.compliance.compliance_rate.toFixed(0)}% compliance
                        </p>
                    </div>
                </div>
            )}

            <div key={activeTab} className="animate-fade-in">
                {activeTab === 'dashboard' && <ComponentErrorBoundary componentName="Payroll Dashboard"><PayrollDashboard pickers={pay.pickers} settings={pay.settings} /></ComponentErrorBoundary>}
                {activeTab === 'timesheets' && <ComponentErrorBoundary componentName="Timesheets"><TimesheetsTab orchardId={pay.orchardId} /></ComponentErrorBoundary>}
                {activeTab === 'wages' && <ComponentErrorBoundary componentName="Wage Calculator"><WageCalculatorTab settings={pay.settings} /></ComponentErrorBoundary>}
                {activeTab === 'export' && <ComponentErrorBoundary componentName="Export"><ExportTab pickers={pay.pickers} week={pay.week} isLoading={pay.isLoading} closedAt={pay.closedInfo?.closed_at ?? null} /></ComponentErrorBoundary>}
                {activeTab === 'history' && <ComponentErrorBoundary componentName="Export History"><ExportHistoryTab /></ComponentErrorBoundary>}
            </div>
        </ResponsiveLayout>
    );
};

export default Payroll;
