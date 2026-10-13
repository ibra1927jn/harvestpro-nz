/**
 * ContractsTab.tsx — HR Contract Management
 * Contract cards with Renew / Terminate action buttons
 */
import React, { useState, useMemo } from 'react';
import { Employee, HRSummary } from '@/services/hhrr.service';
import { changeContract, saveNewContract } from '@/services/hhrr.service';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { useAuth } from '@/context/AuthContext';
import { PAY_RULES } from '@/services/harvestMetrics';
import FilterBar from '@/components/ui/FilterBar';
import InlineEdit from '@/components/ui/InlineEdit';
import { formatNZDate } from '@/utils/nzFormat';
import { statusLabel } from '@/i18n/statusLabel';
import { useTranslation } from '@/i18n';

interface ContractsTabProps {
    employees: Employee[];
    summary: HRSummary;
    onRefresh?: () => void;
}

const ContractsTab: React.FC<ContractsTabProps> = ({ employees, summary, onRefresh }) => {
    const { t } = useTranslation();
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
    const [creatingFor, setCreatingFor] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const storeOrchardId = useHarvestStore(s => s.orchard?.id);
    const { appUser } = useAuth();

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

    // Cambios sobre el contrato de verdad (por su id), esperando a que se guarde.
    // Antes se usaba el id de la persona como id de contrato: no cambiaba nada
    // y la pantalla decía que sí.
    const run = async (emp: Employee, action: () => Promise<void>, okMessage: string, okType: 'success' | 'error' = 'success') => {
        setBusy(emp.id);
        try {
            await action();
            showToast(okMessage, okType);
            onRefresh?.();
        } catch (e) {
            showToast(`${emp.full_name}: ${e instanceof Error ? e.message : t('hr.contracts.not_saved')}`, 'error');
        } finally {
            setBusy(null);
        }
    };

    const handleRenew = (emp: Employee) => {
        if (!emp.contract_id) return;
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        const end = nextYear.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
        void run(emp, () => changeContract(emp.contract_id!, { status: 'active', end_date: end }),
            t('hr.contracts.renewed', { name: emp.full_name, date: formatNZDate(end, 'medium') }));
    };

    const handleTerminate = (emp: Employee) => {
        if (!emp.contract_id) return;
        setConfirmId(null);
        void run(emp, () => changeContract(emp.contract_id!, { status: 'terminated' }),
            t('hr.contracts.terminated', { name: emp.full_name }), 'error');
    };

    const handleCreate = (emp: Employee, form: NewContractForm) => {
        const orchardId = emp.orchard_id || storeOrchardId;
        if (!orchardId) { showToast(t('hr.contracts.no_orchard'), 'error'); return; }
        void run(emp, async () => {
            await saveNewContract({
                employee_id: emp.id,
                orchard_id: orchardId,
                type: form.type,
                start_date: form.start,
                end_date: form.end || null,
                hourly_rate: form.rate,
                created_by: appUser?.id ?? null,
            });
            setCreatingFor(null);
        }, t('hr.contracts.created', { name: emp.full_name }));
    };

    return (
        <div className="space-y-4 relative">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-[100] px-5 py-3.5 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] text-sm font-extrabold tracking-tight flex items-center gap-3 backdrop-blur-md border
                    ${toast.type === 'success' ? 'bg-emerald-600/90 border-emerald-500/50 text-white' : 'bg-red-600/90 border-red-500/50 text-white'}`}>
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                        {toast.type === 'success' ? 'check_circle' : 'warning'}
                    </span>
                    {toast.message}
                </div>
            )}

            {/* Warning Banner */}
            {summary.pendingContracts > 0 && (
                <div className="bg-gradient-to-r from-amber-50/80 to-orange-50/80 backdrop-blur-md border border-amber-200/60 shadow-[0_4px_20px_rgb(245,158,11,0.05)] rounded-3xl p-5 flex items-center gap-4">
                    <div className="size-10 rounded-xl bg-amber-100 flex items-center justify-center">
                        <span aria-hidden="true" className="material-symbols-outlined text-[24px] text-amber-600">info</span>
                    </div>
                    <div>
                        <p className="text-sm font-extrabold text-amber-900 tracking-tight">{t('hr.contracts.need_renewal', { n: summary.pendingContracts })}</p>
                        <p className="text-[10px] font-bold text-amber-600/80 uppercase tracking-widest mt-0.5">{t('hr.contracts.review_pending')}</p>
                    </div>
                </div>
            )}
            {/* Filter Bar */}
            <FilterBar
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder={t('hr.contracts.search')}
                filters={[
                    { key: 'contract_type', label: t('hr.type'), options: filterOptions.types, icon: 'description' },
                    { key: 'status', label: t('hr.status'), options: filterOptions.statuses, icon: 'toggle_on' },
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
                                }`}>{statusLabel(t, emp.contract_type)}</span>
                        </div>
                        <div className="flex items-center gap-5 text-xs text-slate-500 font-bold mb-4 bg-slate-50/50 rounded-2xl p-3 border border-slate-100/50 relative z-10">
                            <span className="flex items-center gap-1.5">
                                <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-slate-400">event</span>
                                {formatNZDate(emp.contract_start, 'monthYear')}
                                {emp.contract_id && emp.contract_end && (
                                    <>
                                        <span className="text-slate-300 mx-1">→</span>
                                        <InlineEdit
                                            value={emp.contract_end}
                                            onSave={(val) => run(emp, () => changeContract(emp.contract_id!, { end_date: val }), t('hr.contracts.end_saved'))}
                                            type="date"
                                        />
                                    </>
                                )}
                            </span>
                            <span className="w-px h-4 bg-slate-200"></span>
                            <span className="flex items-center gap-1.5">
                                <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-slate-400">attach_money</span>
                                {emp.contract_id ? (
                                    <InlineEdit
                                        value={String(emp.hourly_rate)}
                                        onSave={(val) => run(emp, () => changeContract(emp.contract_id!, { hourly_rate: parseFloat(val) || emp.hourly_rate }), t('hr.contracts.rate_saved'))}
                                        type="number"
                                        prefix="$"
                                        suffix={t('common.per_hour')}
                                        minWidth="60px"
                                    />
                                ) : (
                                    <span className="text-slate-400">{t('hr.contracts.none')}</span>
                                )}
                            </span>
                        </div>

                        {/* Sin contrato: crearlo */}
                        {!emp.contract_id && (
                            creatingFor === emp.id ? (
                                <CreateContractForm
                                    busy={busy === emp.id}
                                    onCancel={() => setCreatingFor(null)}
                                    onSave={(form) => handleCreate(emp, form)}
                                />
                            ) : (
                                <button
                                    onClick={() => setCreatingFor(emp.id)}
                                    className="relative z-10 w-full py-3 rounded-2xl bg-indigo-50 text-indigo-700 text-[11px] uppercase tracking-widest font-bold hover:bg-indigo-100 flex items-center justify-center gap-1.5 border border-indigo-100"
                                >
                                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">add</span>
                                    {t('hr.contracts.create')}
                                </button>
                            )
                        )}

                        {/* Action Buttons */}
                        {emp.contract_id && (
                        <div className="flex gap-3 relative z-10">
                            <button
                                onClick={() => handleRenew(emp)}
                                disabled={busy === emp.id}
                                className="flex-1 py-3 rounded-2xl bg-emerald-50/50 text-emerald-700 text-[11px] uppercase tracking-widest font-bold hover:bg-emerald-100 transition-colors flex items-center justify-center gap-1.5 border border-emerald-100/50"
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">autorenew</span>
                                {t('hr.contracts.renew')}
                            </button>
                            {confirmId === emp.id ? (
                                <div className="flex-1 flex gap-2">
                                    <button
                                        onClick={() => handleTerminate(emp)}
                                        disabled={busy === emp.id}
                                        className="flex-1 py-3 rounded-2xl bg-red-500 text-white text-[11px] uppercase tracking-widest font-bold hover:bg-red-600 transition-colors shadow-sm"
                                    >
                                        {t('hr.contracts.confirm')}
                                    </button>
                                    <button
                                        onClick={() => setConfirmId(null)}
                                        className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 text-[11px] uppercase tracking-widest font-bold hover:bg-slate-200 transition-colors"
                                    >
                                        {t('common.cancel')}
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setConfirmId(emp.id)}
                                    className="flex-1 py-3 rounded-2xl bg-red-50/50 text-red-700 text-[11px] uppercase tracking-widest font-bold hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5 border border-red-100/50"
                                >
                                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">cancel</span>
                                    {t('hr.contracts.terminate')}
                                </button>
                            )}
                        </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

interface NewContractForm {
    type: 'permanent' | 'seasonal' | 'casual';
    start: string;
    end: string;
    rate: number;
}

const CreateContractForm: React.FC<{ busy: boolean; onCancel: () => void; onSave: (f: NewContractForm) => void }> = ({ busy, onCancel, onSave }) => {
    const { t } = useTranslation();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
    const [form, setForm] = useState<NewContractForm>({ type: 'seasonal', start: today, end: '', rate: PAY_RULES.minWageFloor });
    const field = 'w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white';
    return (
        <div className="relative z-10 space-y-2 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3" data-testid="create-contract-form">
            <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] font-bold text-slate-500">{t('hr.type')}
                    <select className={field} value={form.type} onChange={e => setForm({ ...form, type: e.target.value as NewContractForm['type'] })}>
                        <option value="seasonal">{t('status.seasonal')}</option>
                        <option value="casual">{t('status.casual')}</option>
                        <option value="permanent">{t('status.permanent')}</option>
                    </select>
                </label>
                <label className="text-[11px] font-bold text-slate-500">{t('hr.contracts.hourly_rate')}
                    <input className={field} type="number" step="0.01" min={PAY_RULES.minWageFloor} value={form.rate}
                        onChange={e => setForm({ ...form, rate: parseFloat(e.target.value) || 0 })} />
                </label>
                <label className="text-[11px] font-bold text-slate-500">{t('hr.contracts.start')}
                    <input className={field} type="date" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} />
                </label>
                <label className="text-[11px] font-bold text-slate-500">{t('hr.contracts.end_optional')}
                    <input className={field} type="date" value={form.end} onChange={e => setForm({ ...form, end: e.target.value })} />
                </label>
            </div>
            <div className="flex gap-2">
                <button onClick={onCancel} disabled={busy} className="flex-1 rounded-xl bg-white py-2 text-xs font-bold text-slate-600 border border-slate-200">{t('common.cancel')}</button>
                <button onClick={() => onSave(form)} disabled={busy || !form.start} className="flex-1 rounded-xl bg-indigo-600 py-2 text-xs font-bold text-white disabled:opacity-50">
                    {busy ? t('hr.saving') : t('hr.contracts.save')}
                </button>
            </div>
        </div>
    );
};

export default ContractsTab;
