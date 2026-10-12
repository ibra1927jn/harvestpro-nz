/**
 * PayrollTab.tsx — HR Payroll Overview
 * Weekly summary + employee payroll entries with wage shield indicators
 */
import React from 'react';
import { PayrollEntry, HRSummary } from '@/services/hhrr.service';

interface PayrollTabProps {
    payroll: PayrollEntry[];
    summary: HRSummary;
}

const PayrollTab: React.FC<PayrollTabProps> = ({ payroll, summary }) => (
    <div className="space-y-4">
        {/* Summary Card */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border-light">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-text-primary">Weekly Payroll Summary</h3>
                <span className="text-xs text-text-secondary">{new Date().toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', month: 'short', day: 'numeric' })}</span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                    <p className="text-2xl font-black text-text-primary">${(summary.payrollThisWeek / 1000).toFixed(1)}k</p>
                    <p className="text-[10px] text-text-secondary uppercase font-bold">Total</p>
                </div>
                <div>
                    <p className="text-2xl font-black text-emerald-600">{payroll.filter(p => !p.wage_shield_applied).length}</p>
                    <p className="text-[10px] text-text-secondary uppercase font-bold">Above Min</p>
                </div>
                <div>
                    <p className="text-2xl font-black text-amber-600">{payroll.filter(p => p.wage_shield_applied).length}</p>
                    <p className="text-[10px] text-text-secondary uppercase font-bold">Wage Shield</p>
                </div>
            </div>
        </div>

        {/* Payroll Entries */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {payroll.map(entry => (
                <div key={entry.id} className="bg-white rounded-xl p-4 shadow-sm border border-border-light">
                    <div className="flex items-center justify-between mb-1">
                        <h4 className="font-bold text-text-primary text-sm">{entry.employee_name}</h4>
                        <span className="font-black text-text-primary">${entry.total_pay.toFixed(0)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-secondary">
                        <span>{entry.hours_worked}h worked</span>
                        <span>•</span>
                        <span>{entry.buckets_picked} buckets</span>
                        {entry.wage_shield_applied && (
                            <span className="flex items-center gap-0.5 text-amber-600">
                                <span className="material-symbols-outlined text-xs">shield</span>
                                Wage Shield
                            </span>
                        )}
                    </div>
                </div>
            ))}
        </div>
    </div>
);

export default PayrollTab;
