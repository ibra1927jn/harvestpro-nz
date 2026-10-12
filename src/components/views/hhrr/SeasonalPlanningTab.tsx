/**
 * SeasonalPlanningTab — HR Workforce Planning Dashboard
 * Contract expiry forecasting + workforce gap analysis
 */
import React, { useState, useMemo } from 'react';
import { Employee } from '@/services/hhrr.service';
import FilterBar from '@/components/ui/FilterBar';

interface SeasonalPlanningTabProps {
    employees: Employee[];
}

const SeasonalPlanningTab: React.FC<SeasonalPlanningTabProps> = ({ employees }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

    const contractTypes = useMemo(() =>
        [...new Set(employees.map(e => e.contract_type))].sort(),
        [employees]
    );

    const today = new Date();
    const in30 = new Date(today.getTime() + 30 * 86400000);
    const in60 = new Date(today.getTime() + 60 * 86400000);
    const in90 = new Date(today.getTime() + 90 * 86400000);

    const activeEmployees = useMemo(() => employees.filter(e => {
        const matchActive = e.status === 'active';
        const matchSearch = !searchQuery ||
            e.full_name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchType = !activeFilters.contract_type || e.contract_type === activeFilters.contract_type;
        return matchActive && matchSearch && matchType;
    }), [employees, searchQuery, activeFilters]);

    // Contract expiry forecasts
    const expiring30 = activeEmployees.filter(e => {
        if (!e.contract_end) return false;
        const end = new Date(e.contract_end);
        return end >= today && end <= in30;
    });

    const expiring60 = activeEmployees.filter(e => {
        if (!e.contract_end) return false;
        const end = new Date(e.contract_end);
        return end > in30 && end <= in60;
    });

    const expiring90 = activeEmployees.filter(e => {
        if (!e.contract_end) return false;
        const end = new Date(e.contract_end);
        return end > in60 && end <= in90;
    });

    const permanentCount = activeEmployees.filter(e => e.contract_type === 'permanent').length;
    const seasonalCount = activeEmployees.filter(e => e.contract_type === 'seasonal').length;
    const casualCount = activeEmployees.filter(e => e.contract_type === 'casual').length;

    // Visa expiry alerts
    const visaExpiring = activeEmployees.filter(e => {
        if (!e.visa_expiry || e.visa_status === 'citizen' || e.visa_status === 'resident') return false;
        const exp = new Date(e.visa_expiry);
        return exp >= today && exp <= in90;
    });

    const daysUntil = (dateStr: string) => {
        const days = Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000);
        return days;
    };

    const urgencyColor = (days: number) => {
        if (days <= 14) return 'text-red-600 bg-red-50 border-red-200';
        if (days <= 30) return 'text-amber-600 bg-amber-50 border-amber-200';
        return 'text-blue-600 bg-blue-50 border-blue-200';
    };

    return (
        <div className="space-y-5">
            {/* Filter Bar */}
            <FilterBar
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search employees..."
                filters={[
                    { key: 'contract_type', label: 'Contract Type', options: contractTypes, icon: 'description' },
                ]}
                activeFilters={activeFilters}
                onFilterChange={(key, value) => setActiveFilters(prev => ({ ...prev, [key]: value }))}
                onClearAll={() => { setSearchQuery(''); setActiveFilters({}); }}
            />

            {/* Workforce Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 text-center">
                    <p className="text-3xl font-black text-slate-800 tracking-tight">{activeEmployees.length}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Active Headcount</p>
                </div>
                <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 text-center">
                    <p className="text-3xl font-black text-emerald-600 tracking-tight">{permanentCount}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Permanent</p>
                </div>
                <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 text-center">
                    <p className="text-3xl font-black text-amber-600 tracking-tight">{seasonalCount}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Seasonal</p>
                </div>
                <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 text-center">
                    <p className="text-3xl font-black text-blue-600 tracking-tight">{casualCount}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Casual</p>
                </div>
            </div>

            {/* Contract Expiry Forecast */}
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-50"></div>
                <h3 className="text-sm font-extrabold text-slate-800 tracking-tight mb-1 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px] text-amber-500">event_upcoming</span>
                    Contract Expiry Forecast
                </h3>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-5">Contracts expiring in the next 90 days</p>

                <div className="grid grid-cols-3 gap-4 mb-5">
                    <div className="rounded-2xl bg-red-50/50 border border-red-200/60 p-4 text-center shadow-[0_4px_12px_rgb(239,68,68,0.05)]">
                        <p className="text-2xl font-black text-red-600 tracking-tight">{expiring30.length}</p>
                        <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mt-1">Next 30 days</p>
                    </div>
                    <div className="rounded-2xl bg-amber-50/50 border border-amber-200/60 p-4 text-center shadow-[0_4px_12px_rgb(245,158,11,0.05)]">
                        <p className="text-2xl font-black text-amber-600 tracking-tight">{expiring60.length}</p>
                        <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mt-1">31-60 days</p>
                    </div>
                    <div className="rounded-2xl bg-blue-50/50 border border-blue-200/60 p-4 text-center shadow-[0_4px_12px_rgb(59,130,246,0.05)]">
                        <p className="text-2xl font-black text-blue-600 tracking-tight">{expiring90.length}</p>
                        <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mt-1">61-90 days</p>
                    </div>
                </div>

                {/* Timeline List */}
                {[...expiring30, ...expiring60, ...expiring90].length === 0 ? (
                    <p className="text-center text-slate-400 py-6 text-sm font-bold tracking-tight bg-slate-50/50 rounded-2xl border border-slate-100">No contracts expiring in the next 90 days ✅</p>
                ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                        {[...expiring30, ...expiring60, ...expiring90]
                            .sort((a, b) => new Date(a.contract_end!).getTime() - new Date(b.contract_end!).getTime())
                            .map(emp => {
                                const days = daysUntil(emp.contract_end!);
                                return (
                                    <div key={emp.id} className={`flex items-center gap-4 p-3.5 rounded-2xl border bg-white/50 backdrop-blur-sm ${urgencyColor(days)} shadow-sm`}>
                                        <div className="flex-1">
                                            <p className="text-sm font-extrabold tracking-tight">{emp.full_name}</p>
                                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mt-0.5">{emp.role} • {emp.contract_type}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-black tracking-tight">{days}d</p>
                                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">{new Date(emp.contract_end!).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland' })}</p>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                )}
            </div>

            {/* Visa Expiry Alerts */}
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-50"></div>
                <h3 className="text-sm font-extrabold text-slate-800 tracking-tight mb-1 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px] text-red-500">flight</span>
                    Visa Expiry Alerts
                </h3>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-5">Work visas expiring in the next 90 days</p>
                {visaExpiring.length === 0 ? (
                    <p className="text-center text-slate-400 py-6 text-sm font-bold tracking-tight bg-slate-50/50 rounded-2xl border border-slate-100">No visa expiries in the next 90 days ✅</p>
                ) : (
                    <div className="space-y-2">
                        {visaExpiring
                            .sort((a, b) => new Date(a.visa_expiry!).getTime() - new Date(b.visa_expiry!).getTime())
                            .map(emp => {
                                const days = daysUntil(emp.visa_expiry!);
                                return (
                                    <div key={emp.id} className={`flex items-center gap-4 p-3.5 rounded-2xl border bg-white/50 backdrop-blur-sm ${urgencyColor(days)} shadow-sm`}>
                                        <span className="material-symbols-outlined text-[20px] opacity-80">badge</span>
                                        <div className="flex-1">
                                            <p className="text-sm font-extrabold tracking-tight">{emp.full_name}</p>
                                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mt-0.5">{emp.visa_status}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-black tracking-tight">{days}d</p>
                                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">{new Date(emp.visa_expiry!).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland' })}</p>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                )}
            </div>

            {/* Projected Headcount */}
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-50"></div>
                <h3 className="text-sm font-extrabold text-slate-800 tracking-tight mb-1 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px] text-indigo-500">trending_down</span>
                    Projected Headcount
                </h3>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-6">If no contracts are renewed</p>
                <div className="grid grid-cols-4 gap-4 px-2">
                    {[
                        { label: 'Now', count: activeEmployees.length, color: 'bg-emerald-500' },
                        { label: '+30d', count: activeEmployees.length - expiring30.length, color: 'bg-amber-500' },
                        { label: '+60d', count: activeEmployees.length - expiring30.length - expiring60.length, color: 'bg-orange-500' },
                        { label: '+90d', count: activeEmployees.length - expiring30.length - expiring60.length - expiring90.length, color: 'bg-red-500' },
                    ].map(item => (
                        <div key={item.label} className="text-center group">
                            <div className="h-24 flex items-end justify-center mb-3">
                                <div className={`w-12 ${item.color} rounded-t-xl transition-all duration-500 group-hover:opacity-80 shadow-sm`} style={{ height: `${(item.count / (activeEmployees.length || 1)) * 100}%`, minHeight: '8px' }} />
                            </div>
                            <p className="text-xl font-black text-slate-800 tracking-tight">{item.count}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{item.label}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SeasonalPlanningTab;
