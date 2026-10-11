/**
 * ContractsTab.tsx — HR Contract Management
 * Contract cards with Renew / Terminate action buttons
 */
import React, { useState, useMemo } from 'react';
import { Employee, HRSummary } from '@/services/hhrr.service';
import { updateContract } from '@/services/hhrr.service';
import FilterBar from '@/components/ui/FilterBar';
import InlineEdit from '@/components/ui/InlineEdit';

interface ContractsTabProps {
    employees: Employee[];
    summary: HRSummary;
    onRefresh?: () => void;
}

const ContractsTab: React.FC<ContractsTabProps> = ({ employees, summary, onRefresh }) => {
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

    const filterOptions = useMemo(() => ({
        types: [...new Set(employees.map(e => e.contract_type))].sort(),
        statuses: [...new Set(employees.map(e => e.status))].sort(),
    }), [employees]);

    const filteredEmployees = useMemo(() => employees.filter(emp => {
        const matchesSearch = !searchQuery ||
            emp.full_name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = !activeFilters.contract_type || emp.contract_type === activeFilters.contract_type;
        const matchesStatus = !activeFilters.status || emp.status === activeFilters.status;
        return matchesSearch && matchesType && matchesStatus;
    }), [employees, searchQuery, activeFilters]);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleRenew = (empId: string, empName: string) => {
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        updateContract(empId, {
            status: 'active',
            end_date: nextYear.toISOString().split('T')[0],
        });
        showToast(`Contract renewed for ${empName} until ${nextYear.toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland' })}`);
        onRefresh?.();
    };

    const handleTerminate = (empId: string, empName: string) => {
        updateContract(empId, { status: 'terminated' });
        showToast(`Contract terminated for ${empName}`, 'error');
        setConfirmId(null);
        onRefresh?.();
    };

    return (
        <div className="space-y-4 relative">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-[100] px-5 py-3.5 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] text-sm font-extrabold tracking-tight flex items-center gap-3 backdrop-blur-md border
                    ${toast.type === 'success' ? 'bg-emerald-600/90 border-emerald-500/50 text-white' : 'bg-red-600/90 border-red-500/50 text-white'}`}>
                    <span className="material-symbols-outlined text-[20px]">
                        {toast.type === 'success' ? 'check_circle' : 'warning'}
                    </span>
                    {toast.message}
                </div>
            )}

            {/* Warning Banner */}
            {summary.pendingContracts > 0 && (
                <div className="bg-gradient-to-r from-amber-50/80 to-orange-50/80 backdrop-blur-md border border-amber-200/60 shadow-[0_4px_20px_rgb(245,158,11,0.05)] rounded-3xl p-5 flex items-center gap-4">
                    <div className="size-10 rounded-xl bg-amber-100 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[24px] text-amber-600">info</span>
                    </div>
                    <div>
                        <p className="text-sm font-extrabold text-amber-900 tracking-tight">{summary.pendingContracts} contracts need renewal within 30 days</p>
                        <p className="text-[10px] font-bold text-amber-600/80 uppercase tracking-widest mt-0.5">Please review pending contracts</p>
                    </div>
                </div>
            )}
            {/* Filter Bar */}
            <FilterBar
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search contracts..."
                filters={[
                    { key: 'contract_type', label: 'Type', options: filterOptions.types, icon: 'description' },
                    { key: 'status', label: 'Status', options: filterOptions.statuses, icon: 'toggle_on' },
                ]}
                activeFilters={activeFilters}
                onFilterChange={(key, value) => setActiveFilters(prev => ({ ...prev, [key]: value }))}
                onClearAll={() => { setSearchQuery(''); setActiveFilters({}); }}
            />

            {/* Contract Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredEmployees.map(emp => (
                    <div key={emp.id} className="bg-white/80 backdrop-blur-xl rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden group">
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-50"></div>
                        <div className="absolute inset-0 bg-gradient-to-br from-slate-50/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                        <div className="flex items-center justify-between mb-3 relative z-10">
                            <h3 className="font-extrabold text-slate-800 text-sm tracking-tight">{emp.full_name}</h3>
                            <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md shadow-sm border ${emp.contract_type === 'permanent' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                                emp.contract_type === 'seasonal' ? 'bg-sky-50 border-sky-100 text-sky-700' :
                                    'bg-slate-50 border-slate-100 text-slate-500'
                                }`}>{emp.contract_type}</span>
                        </div>
                        <div className="flex items-center gap-5 text-xs text-slate-500 font-bold mb-4 bg-slate-50/50 rounded-2xl p-3 border border-slate-100/50 relative z-10">
                            <span className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[16px] text-slate-400">event</span>
                                {new Date(emp.contract_start).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', month: 'short', year: 'numeric' })}
                                {emp.contract_end && (
                                    <>
                                        <span className="text-slate-300 mx-1">→</span>
                                        <InlineEdit
                                            value={emp.contract_end}
                                            onSave={(val) => updateContract(emp.id, { end_date: val })}
                                            type="date"
                                        />
                                    </>
                                )}
                            </span>
                            <span className="w-px h-4 bg-slate-200"></span>
                            <span className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[16px] text-slate-400">attach_money</span>
                                <InlineEdit
                                    value={String(emp.hourly_rate)}
                                    onSave={(val) => updateContract(emp.id, { hourly_rate: parseFloat(val) || emp.hourly_rate })}
                                    type="number"
                                    prefix="$"
                                    suffix="/hr"
                                    minWidth="60px"
                                />
                            </span>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-3 relative z-10">
                            <button
                                onClick={() => handleRenew(emp.id, emp.full_name)}
                                className="flex-1 py-3 rounded-2xl bg-emerald-50/50 text-emerald-700 text-[11px] uppercase tracking-widest font-bold hover:bg-emerald-100 transition-colors flex items-center justify-center gap-1.5 border border-emerald-100/50"
                            >
                                <span className="material-symbols-outlined text-[16px]">autorenew</span>
                                Renew
                            </button>
                            {confirmId === emp.id ? (
                                <div className="flex-1 flex gap-2">
                                    <button
                                        onClick={() => handleTerminate(emp.id, emp.full_name)}
                                        className="flex-1 py-3 rounded-2xl bg-red-500 text-white text-[11px] uppercase tracking-widest font-bold hover:bg-red-600 transition-colors shadow-sm"
                                    >
                                        Confirm
                                    </button>
                                    <button
                                        onClick={() => setConfirmId(null)}
                                        className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 text-[11px] uppercase tracking-widest font-bold hover:bg-slate-200 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setConfirmId(emp.id)}
                                    className="flex-1 py-3 rounded-2xl bg-red-50/50 text-red-700 text-[11px] uppercase tracking-widest font-bold hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5 border border-red-100/50"
                                >
                                    <span className="material-symbols-outlined text-[16px]">cancel</span>
                                    Terminate
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ContractsTab;
