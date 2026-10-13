/**
 * EmployeesTab.tsx — HR Employee Directory
 * Lists all employees with search, role badges, status, and visa info
 */
import React, { useState, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import EmptyState from '@/components/ui/EmptyState';
import FilterBar from '@/components/ui/FilterBar';
import InlineSelect from '@/components/ui/InlineSelect';
import { Employee, ComplianceAlert } from '@/services/hhrr.service';

const ROLE_BADGES: Record<string, string> = {
    team_leader: 'bg-indigo-50 text-indigo-700',
    runner: 'bg-sky-50 text-sky-700',
    manager: 'bg-purple-50 text-purple-700',
    qc_inspector: 'bg-amber-50 text-amber-700',
};

const STATUS_COLORS: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    on_leave: 'bg-amber-100 text-amber-700',
    terminated: 'bg-red-100 text-red-700',
    pending: 'bg-slate-100 text-slate-700',
};

const VISA_COLORS: Record<string, string> = {
    work_visa: 'text-amber-600',
    expired: 'text-red-600',
    not_recorded: 'text-slate-400',
};

const visaLabel = (emp: Employee) =>
    emp.visa_status === 'work_visa'
        ? `visa${emp.visa_expiry ? ` until ${new Date(emp.visa_expiry + 'T12:00:00Z').toLocaleDateString('en-NZ', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`
        : emp.visa_status === 'expired' ? 'visa expired' : 'no visa on file';

interface EmployeesTabProps {
    employees: Employee[];
    alerts: ComplianceAlert[];
    /** Devuelve un mensaje si no se pudo guardar */
    onUpdateEmployee?: (emp: Employee, changes: Partial<Employee>) => Promise<string | null>;
    /** Dar de alta un picker (RRHH) */
    onAddPicker?: () => void;
}

const EmployeesTab: React.FC<EmployeesTabProps> = ({ employees, alerts, onUpdateEmployee, onAddPicker }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [saveError, setSaveError] = useState<string | null>(null);
    const update = async (emp: Employee, changes: Partial<Employee>) => {
        setSaveError(null);
        const err = await onUpdateEmployee?.(emp, changes);
        if (err) setSaveError(`${emp.full_name}: ${err}`);
    };
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

    // Extract unique values for filter options
    const filterOptions = useMemo(() => ({
        roles: [...new Set(employees.map(e => e.role))].sort(),
        statuses: [...new Set(employees.map(e => e.status))].sort(),
        visas: [...new Set(employees.map(e => e.visa_status))].sort(),
    }), [employees]);

    const filtered = employees.filter(emp => {
        const matchesSearch = !searchQuery ||
            emp.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            emp.role.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRole = !activeFilters.role || emp.role === activeFilters.role;
        const matchesStatus = !activeFilters.status || emp.status === activeFilters.status;
        const matchesVisa = !activeFilters.visa_status || emp.visa_status === activeFilters.visa_status;
        return matchesSearch && matchesRole && matchesStatus && matchesVisa;
    });

    return (
        <div className="space-y-4">
            {onAddPicker && (
                <div className="flex justify-end">
                    <button
                        onClick={onAddPicker}
                        className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold flex items-center gap-2 hover:bg-indigo-700"
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-base">person_add</span>
                        Add picker
                    </button>
                </div>
            )}
            {saveError && (
                <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">{saveError}</div>
            )}
            <FilterBar
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search employees..."
                filters={[
                    { key: 'role', label: 'Role', options: filterOptions.roles, icon: 'badge' },
                    { key: 'status', label: 'Status', options: filterOptions.statuses, icon: 'toggle_on' },
                    { key: 'visa_status', label: 'Visa', options: filterOptions.visas, icon: 'public' },
                ]}
                activeFilters={activeFilters}
                onFilterChange={(key, value) => setActiveFilters(prev => ({ ...prev, [key]: value }))}
                onClearAll={() => { setSearchQuery(''); setActiveFilters({}); }}
            />

            {/* Employee List — virtualized for 450+ employees */}
            <div style={{ height: Math.min(filtered.length * 110, 600) }}>
                <Virtuoso
                    data={filtered}
                    itemContent={(_index, emp) => (
                        <div className="bg-white/70 backdrop-blur-md rounded-2xl p-5 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-white/60 hover:shadow-[0_8px_32px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300 cursor-pointer mb-3 relative overflow-hidden group">
                            
                            {/* Decorative background gradient on hover */}
                            <div className="absolute inset-0 bg-gradient-to-r from-sky-50/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                            <div className="flex items-start gap-4 relative z-10">
                                <div className="size-12 rounded-full bg-slate-100/80 border border-white shadow-sm flex items-center justify-center text-slate-500 font-bold text-sm flex-shrink-0 group-hover:scale-105 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all duration-300">
                                    {emp.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-1.5">
                                        <h3 className="font-bold text-slate-800 text-sm truncate">{emp.full_name}</h3>
                                        <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full shadow-sm ${ROLE_BADGES[emp.role] || 'bg-slate-100 text-slate-700'}`}>
                                            {emp.role.replace('_', ' ')}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                                        <InlineSelect
                                            value={emp.status}
                                            options={['active', 'terminated']}
                                            colorMap={STATUS_COLORS}
                                            onSave={(val) => update(emp, { status: val as Employee['status'] })}
                                        />
                                        <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/50 border border-slate-100 ${VISA_COLORS[emp.visa_status] || 'text-slate-500'}`}>
                                            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">public</span>
                                            {visaLabel(emp)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100/60">
                                        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                                            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">event</span>
                                            Hired {new Date(emp.hire_date).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', month: 'short', day: 'numeric', year: 'numeric' })}
                                        </div>
                                    </div>
                                </div>
                                <button aria-hidden="true" tabIndex={-1} className="size-8 rounded-full border border-slate-200 bg-white/50 text-slate-400 flex items-center justify-center hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-100 transition-all opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0">
                                    <span aria-hidden="true" className="material-symbols-outlined text-lg">chevron_right</span>
                                </button>
                            </div>
                        </div>
                    )}
                />
            </div>

            {filtered.length === 0 && (
                <EmptyState
                    icon="person_search"
                    title="No employees found"
                    subtitle="Try adjusting your search or filters"
                    compact
                />
            )}

            {/* Compliance Alerts */}
            {alerts.length > 0 && (
                <div className="space-y-3 mt-6">
                    <h3 className="text-sm font-extrabold text-slate-800 tracking-tight ml-1">Compliance Alerts</h3>
                    {alerts.map(alert => (
                        <div key={alert.id} className={`bg-white/80 backdrop-blur-xl rounded-3xl p-4 flex items-center gap-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border ${
                            alert.severity === 'critical' ? 'border-red-200/60' :
                            alert.severity === 'high' ? 'border-amber-200/60' :
                            'border-slate-200/60'
                        }`}>
                            <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${
                                alert.severity === 'critical' ? 'bg-red-50 text-red-600' :
                                alert.severity === 'high' ? 'bg-amber-50 text-amber-600' :
                                'bg-slate-50 text-slate-600'
                            }`}>
                                <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                                    {alert.severity === 'critical' ? 'error' : 'warning'}
                                </span>
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-extrabold text-slate-800 tracking-tight">{alert.employee_name}</p>
                                <p className="text-xs text-slate-500 font-medium">{alert.message}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default EmployeesTab;
