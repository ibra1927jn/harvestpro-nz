/**
 * SeasonalPlanningTab — HR Workforce Planning Dashboard
 * Contract expiry forecasting + workforce gap analysis
 */
import React, { useState, useMemo } from 'react';
import { Employee } from '@/services/hhrr.service';
import { CONTRACT_TYPES, domainOptions } from '@/services/hhrr/hrLogic';
import FilterBar from '@/components/ui/FilterBar';
import { formatNZDate } from '@/utils/nzFormat';
import { roleLabel } from '@/i18n/roleLabel';
import { statusLabel } from '@/i18n/statusLabel';
import { useTranslation } from '@/i18n';

interface SeasonalPlanningTabProps {
    employees: Employee[];
}

const SeasonalPlanningTab: React.FC<SeasonalPlanningTabProps> = ({ employees }) => {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

    // Tipos de contrato: dominio completo con recuento (solo gente en plantilla)
    const contractTypes = useMemo(() =>
        domainOptions(CONTRACT_TYPES, employees.filter(e => e.status !== 'terminated').map(e => e.contract_type)),
        [employees]
    );

    const today = new Date();
    const in30 = new Date(today.getTime() + 30 * 86400000);
    const in60 = new Date(today.getTime() + 60 * 86400000);
    const in90 = new Date(today.getTime() + 90 * 86400000);

    // En plantilla: activos, de permiso y con el alta a medias (fuera solo las bajas)
    const activeEmployees = useMemo(() => employees.filter(e => {
        const matchActive = e.status !== 'terminated';
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
        if (!e.visa_expiry || e.visa_status === 'not_recorded') return false;
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
                searchPlaceholder={t('hr.search_employees')}
                filters={[
                    { key: 'contract_type', label: t('hr.contract_type'), options: contractTypes, icon: 'description' },
                ]}
                activeFilters={activeFilters}
                onFilterChange={(key, value) => setActiveFilters(prev => ({ ...prev, [key]: value }))}
                onClearAll={() => { setSearchQuery(''); setActiveFilters({}); }}
            />

            {/* Workforce Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 text-center">
                    <p className="text-3xl font-black text-slate-800 tracking-tight">{activeEmployees.length}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{t('hr.plan.active_headcount')}</p>
                </div>
                <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 text-center">
                    <p className="text-3xl font-black text-emerald-600 tracking-tight">{permanentCount}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{t('status.permanent')}</p>
                </div>
                <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 text-center">
                    <p className="text-3xl font-black text-amber-600 tracking-tight">{seasonalCount}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{t('status.seasonal')}</p>
                </div>
                <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 text-center">
                    <p className="text-3xl font-black text-blue-600 tracking-tight">{casualCount}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{t('status.casual')}</p>
                </div>
            </div>

            {/* Contract Expiry Forecast */}
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-50"></div>
                <h3 className="text-sm font-extrabold text-slate-800 tracking-tight mb-1 flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-amber-500">event_upcoming</span>
                    {t('hr.plan.contract_forecast')}
                </h3>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-5">{t('hr.plan.contracts_90')}</p>

                <div className="grid grid-cols-3 gap-4 mb-5">
                    <div className="rounded-2xl bg-red-50/50 border border-red-200/60 p-4 text-center shadow-[0_4px_12px_rgb(239,68,68,0.05)]">
                        <p className="text-2xl font-black text-red-600 tracking-tight">{expiring30.length}</p>
                        <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mt-1">{t('hr.plan.next_30')}</p>
                    </div>
                    <div className="rounded-2xl bg-amber-50/50 border border-amber-200/60 p-4 text-center shadow-[0_4px_12px_rgb(245,158,11,0.05)]">
                        <p className="text-2xl font-black text-amber-600 tracking-tight">{expiring60.length}</p>
                        <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mt-1">{t('hr.plan.range_days', { from: 31, to: 60 })}</p>
                    </div>
                    <div className="rounded-2xl bg-blue-50/50 border border-blue-200/60 p-4 text-center shadow-[0_4px_12px_rgb(59,130,246,0.05)]">
                        <p className="text-2xl font-black text-blue-600 tracking-tight">{expiring90.length}</p>
                        <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mt-1">{t('hr.plan.range_days', { from: 61, to: 90 })}</p>
                    </div>
                </div>

                {/* Timeline List */}
                {[...expiring30, ...expiring60, ...expiring90].length === 0 ? (
                    <p className="text-center text-slate-400 py-6 text-sm font-bold tracking-tight bg-slate-50/50 rounded-2xl border border-slate-100">{t('hr.plan.no_contracts_90')} ✅</p>
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
                                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mt-0.5">{roleLabel(t, emp.role)} • {statusLabel(t, emp.contract_type)}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-black tracking-tight">{t('hr.days_short', { n: days })}</p>
                                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">{formatNZDate(emp.contract_end!)}</p>
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
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-red-500">flight</span>
                    {t('hr.plan.visa_alerts')}
                </h3>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-5">{t('hr.plan.visas_90')}</p>
                {visaExpiring.length === 0 ? (
                    <p className="text-center text-slate-400 py-6 text-sm font-bold tracking-tight bg-slate-50/50 rounded-2xl border border-slate-100">{t('hr.plan.no_visas_90')} ✅</p>
                ) : (
                    <div className="space-y-2">
                        {visaExpiring
                            .sort((a, b) => new Date(a.visa_expiry!).getTime() - new Date(b.visa_expiry!).getTime())
                            .map(emp => {
                                const days = daysUntil(emp.visa_expiry!);
                                return (
                                    <div key={emp.id} className={`flex items-center gap-4 p-3.5 rounded-2xl border bg-white/50 backdrop-blur-sm ${urgencyColor(days)} shadow-sm`}>
                                        <span aria-hidden="true" className="material-symbols-outlined text-[20px] opacity-80">badge</span>
                                        <div className="flex-1">
                                            <p className="text-sm font-extrabold tracking-tight">{emp.full_name}</p>
                                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mt-0.5">{statusLabel(t, emp.visa_status)}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-black tracking-tight">{t('hr.days_short', { n: days })}</p>
                                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">{formatNZDate(emp.visa_expiry!)}</p>
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
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-indigo-500">trending_down</span>
                    {t('hr.plan.projected')}
                </h3>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-6">{t('hr.plan.if_none_renewed')}</p>
                <div className="grid grid-cols-4 gap-4 px-2">
                    {[
                        { label: t('hr.plan.now'), count: activeEmployees.length, color: 'bg-emerald-500' },
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
