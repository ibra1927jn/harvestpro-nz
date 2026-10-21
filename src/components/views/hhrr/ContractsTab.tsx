/**
 * ContractsTab.tsx — HR Contract Management
 * Contract cards with Renew / Terminate action buttons and the signed copy
 * of the agreement (PDF in the private hr-documents bucket, linked by contract_id).
 */
import React, { useState, useMemo, useRef } from 'react';
import { Employee, HRSummary } from '@/services/hhrr.service';
import { changeContract, saveNewContract, uploadSignedContract, signedDocumentUrl } from '@/services/hhrr.service';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { useAuth } from '@/context/AuthContext';
import { PAY_RULES } from '@/services/harvestMetrics';
import { HR_DOCUMENT_MAX_BYTES } from '@/repositories/hr-documents.repository';
import { CONTRACT_TYPES, EMPLOYEE_STATUSES, domainOptions } from '@/services/hhrr/hrLogic';
import FilterBar from '@/components/ui/FilterBar';
import InlineEdit from '@/components/ui/InlineEdit';
import { formatNZDate } from '@/utils/nzFormat';
import { statusLabel } from '@/i18n/statusLabel';
import type { TFunction } from '@/i18n';
import { useTranslation } from '@/i18n';

interface ContractsTabProps {
    employees: Employee[];
    summary: HRSummary;
    onRefresh?: () => void;
}

type ToastType = 'success' | 'error' | 'warning';

const TOAST_STYLES: Record<ToastType, string> = {
    success: 'bg-emerald-600/90 border-emerald-500/50 text-white',
    error: 'bg-red-600/90 border-red-500/50 text-white',
    warning: 'bg-amber-500/95 border-amber-400/50 text-white',
};

/** Fecha de hoy + un año (calendario NZ), para la renovación por defecto */
function oneYearFromTodayNZ(): string {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    return nextYear.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
}

/** Motivo por el que no se acepta el archivo elegido, o null si vale */
export function pdfFileProblem(t: TFunction, file: File): string | null {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) return t('hr.contracts.pdf_only');
    if (file.size > HR_DOCUMENT_MAX_BYTES) return t('hr.contracts.pdf_too_big', { mb: HR_DOCUMENT_MAX_BYTES / 1024 / 1024 });
    return null;
}

const ContractsTab: React.FC<ContractsTabProps> = ({ employees, summary, onRefresh }) => {
    const { t } = useTranslation();
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
    const [creatingFor, setCreatingFor] = useState<string | null>(null);
    const [renewingFor, setRenewingFor] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const storeOrchardId = useHarvestStore(s => s.orchard?.id);
    const { appUser } = useAuth();

    // Dominio completo de cada filtro con su recuento (las de 0 salen en gris)
    const filterOptions = useMemo(() => ({
        types: domainOptions(CONTRACT_TYPES, employees.map(e => e.contract_type)),
        statuses: domainOptions(EMPLOYEE_STATUSES, employees.map(e => e.status)),
    }), [employees]);

    const filteredEmployees = useMemo(() => employees.filter(emp => {
        const matchesSearch = !searchQuery ||
            emp.full_name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = !activeFilters.contract_type || emp.contract_type === activeFilters.contract_type;
        const matchesStatus = !activeFilters.status || emp.status === activeFilters.status;
        return matchesSearch && matchesType && matchesStatus;
    }), [employees, searchQuery, activeFilters]);

    const showToast = (message: string, type: ToastType = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), type === 'warning' ? 6000 : 3000);
    };

    const reason = (e: unknown) => (e instanceof Error ? e.message : t('hr.contracts.not_saved'));

    // Cambios sobre el contrato de verdad (por su id), esperando a que se guarde.
    // Antes se usaba el id de la persona como id de contrato: no cambiaba nada
    // y la pantalla decía que sí.
    const run = async (emp: Employee, action: () => Promise<void>, okMessage: string, okType: ToastType = 'success') => {
        setBusy(emp.id);
        try {
            await action();
            showToast(okMessage, okType);
            onRefresh?.();
        } catch (e) {
            showToast(`${emp.full_name}: ${reason(e)}`, 'error');
        } finally {
            setBusy(null);
        }
    };

    const orchardFor = (emp: Employee) => emp.orchard_id || storeOrchardId;

    /** Sube la copia firmada; devuelve el motivo si no se pudo (el contrato ya está guardado) */
    const trySignedUpload = async (emp: Employee, contractId: string, file: File, endDate: string | null): Promise<string | null> => {
        const orchardId = orchardFor(emp);
        if (!orchardId) return t('hr.contracts.no_orchard');
        try {
            await uploadSignedContract(file, {
                employee: emp,
                contractId,
                orchardId,
                endDate,
                uploadedBy: appUser?.id ?? null,
            });
            return null;
        } catch (e) {
            return reason(e);
        }
    };

    const handleRenew = (emp: Employee, form: RenewForm) => {
        if (!emp.contract_id) return;
        const contractId = emp.contract_id;
        const end = form.end;
        setRenewingFor(null);
        setBusy(emp.id);
        void (async () => {
            try {
                await changeContract(contractId, { status: 'active', end_date: end });
            } catch (e) {
                showToast(`${emp.full_name}: ${reason(e)}`, 'error');
                setBusy(null);
                return;
            }
            const date = formatNZDate(end, 'medium');
            const problem = form.file ? await trySignedUpload(emp, contractId, form.file, end) : null;
            if (form.file && !problem) showToast(t('hr.contracts.renewed', { name: emp.full_name, date }));
            else if (form.file) showToast(t('hr.contracts.renewed_no_copy', { name: emp.full_name, date, reason: problem ?? '' }), 'warning');
            else showToast(t('hr.contracts.renewed_no_copy', { name: emp.full_name, date, reason: t('hr.contracts.no_signed_copy') }), 'warning');
            setBusy(null);
            onRefresh?.();
        })();
    };

    const handleTerminate = (emp: Employee) => {
        if (!emp.contract_id) return;
        setConfirmId(null);
        void run(emp, () => changeContract(emp.contract_id!, { status: 'terminated' }),
            t('hr.contracts.terminated', { name: emp.full_name }), 'error');
    };

    const handleCreate = (emp: Employee, form: NewContractForm) => {
        const orchardId = orchardFor(emp);
        if (!orchardId) { showToast(t('hr.contracts.no_orchard'), 'error'); return; }
        setBusy(emp.id);
        void (async () => {
            let created: { id: string };
            try {
                created = await saveNewContract({
                    employee_id: emp.id,
                    orchard_id: orchardId,
                    type: form.type,
                    start_date: form.start,
                    end_date: form.end || null,
                    hourly_rate: form.rate,
                    created_by: appUser?.id ?? null,
                });
            } catch (e) {
                showToast(`${emp.full_name}: ${reason(e)}`, 'error');
                setBusy(null);
                return;
            }
            setCreatingFor(null);
            // El contrato ya existe; si el PDF no sube, se avisa y se puede subir después
            const problem = form.file ? await trySignedUpload(emp, created.id, form.file, form.end || null) : null;
            if (form.file && !problem) showToast(t('hr.contracts.created', { name: emp.full_name }));
            else showToast(t('hr.contracts.created_no_copy', { name: emp.full_name, reason: problem ?? t('hr.contracts.no_signed_copy') }), form.file ? 'warning' : 'success');
            setBusy(null);
            onRefresh?.();
        })();
    };

    /** "Subir firmado" en un contrato que ya existe */
    const handleUploadSigned = (emp: Employee, file: File) => {
        if (!emp.contract_id) return;
        const problem = pdfFileProblem(t, file);
        if (problem) { showToast(`${emp.full_name}: ${problem}`, 'error'); return; }
        void run(emp, async () => {
            const err = await trySignedUpload(emp, emp.contract_id!, file, emp.contract_end ?? null);
            if (err) throw new Error(err);
        }, t('hr.contracts.signed_uploaded', { name: emp.full_name }));
    };

    const handleViewPdf = async (emp: Employee) => {
        if (!emp.contract_document) return;
        try {
            const url = await signedDocumentUrl(emp.contract_document.storage_path);
            window.open(url, '_blank', 'noopener');
        } catch {
            showToast(`${emp.full_name}: ${t('hr.contracts.open_failed')}`, 'error');
        }
    };

    return (
        <div className="space-y-4 relative">
            {/* Toast */}
            {toast && (
                <div role="status" className={`fixed top-4 right-4 z-[100] px-5 py-3.5 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] text-sm font-extrabold tracking-tight flex items-center gap-3 backdrop-blur-md border ${TOAST_STYLES[toast.type]}`}>
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
                        <p className="text-sm font-extrabold text-amber-900 tracking-tight">{t('hr.contracts.pending_banner', { n: summary.pendingContracts })}</p>
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

                        {/* Copia firmada del acuerdo (la ley exige tenerla) */}
                        {emp.contract_id && (
                            emp.contract_document ? (
                                <div className="relative z-10 mb-4 flex items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-xs font-bold text-emerald-700">
                                    <span className="flex items-center gap-1.5">
                                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">task_alt</span>
                                        {t('hr.contracts.signed_copy')}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => handleViewPdf(emp)}
                                        className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                                    >
                                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                                        {t('hr.contracts.view_pdf')}
                                    </button>
                                </div>
                            ) : (
                                <div data-testid={`no-signed-copy-${emp.id}`} className="relative z-10 mb-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs font-bold text-amber-800">
                                    <span className="flex items-center gap-1.5">
                                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">warning</span>
                                        {t('hr.contracts.no_signed_copy')}
                                    </span>
                                    <label className="flex cursor-pointer items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-amber-800 border border-amber-200 hover:bg-amber-100">
                                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">upload</span>
                                        {t('hr.contracts.upload_signed')}
                                        <input
                                            type="file"
                                            accept="application/pdf"
                                            className="sr-only"
                                            aria-label={t('hr.contracts.upload_signed')}
                                            disabled={busy === emp.id}
                                            onChange={e => {
                                                const file = e.target.files?.[0];
                                                e.target.value = '';
                                                if (file) handleUploadSigned(emp, file);
                                            }}
                                        />
                                    </label>
                                </div>
                            )
                        )}

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

                        {/* Renovar: fecha nueva + PDF firmado (opcional) */}
                        {emp.contract_id && renewingFor === emp.id && (
                            <RenewContractForm
                                busy={busy === emp.id}
                                onCancel={() => setRenewingFor(null)}
                                onSave={(form) => handleRenew(emp, form)}
                            />
                        )}

                        {/* Action Buttons */}
                        {emp.contract_id && renewingFor !== emp.id && (
                        <div className="flex gap-3 relative z-10">
                            <button
                                onClick={() => setRenewingFor(emp.id)}
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

/* ── PDF picker (shared by create / renew) ───────────────────────────────── */

const PdfField: React.FC<{ label: string; file: File | null; onChange: (file: File | null) => void; disabled?: boolean }> = ({ label, file, onChange, disabled }) => {
    const { t } = useTranslation();
    const [problem, setProblem] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <label className="block text-[11px] font-bold text-slate-500">
            {label}
            <input
                ref={inputRef}
                className="mt-0.5 block w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-indigo-100 file:px-2 file:py-1 file:text-xs file:font-bold file:text-indigo-700"
                type="file"
                accept="application/pdf"
                disabled={disabled}
                onChange={e => {
                    const next = e.target.files?.[0] ?? null;
                    const err = next ? pdfFileProblem(t, next) : null;
                    setProblem(err);
                    if (err && inputRef.current) inputRef.current.value = '';
                    onChange(err ? null : next);
                }}
            />
            {problem && <span role="alert" className="mt-1 block text-[11px] font-bold text-red-600">{problem}</span>}
            {file && !problem && <span className="mt-1 block text-[11px] font-medium text-slate-400">{file.name}</span>}
        </label>
    );
};

/* ── New contract ────────────────────────────────────────────────────────── */

interface NewContractForm {
    type: 'permanent' | 'seasonal' | 'casual';
    start: string;
    end: string;
    rate: number;
    /** Copia firmada (PDF, opcional) */
    file: File | null;
}

const CreateContractForm: React.FC<{ busy: boolean; onCancel: () => void; onSave: (f: NewContractForm) => void }> = ({ busy, onCancel, onSave }) => {
    const { t } = useTranslation();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
    const [form, setForm] = useState<NewContractForm>({ type: 'seasonal', start: today, end: '', rate: PAY_RULES.minWageFloor, file: null });
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
            <PdfField label={t('hr.contracts.signed_pdf_optional')} file={form.file} onChange={file => setForm({ ...form, file })} disabled={busy} />
            <div className="flex gap-2">
                <button onClick={onCancel} disabled={busy} className="flex-1 rounded-xl bg-white py-2 text-xs font-bold text-slate-600 border border-slate-200">{t('common.cancel')}</button>
                <button onClick={() => onSave(form)} disabled={busy || !form.start} className="flex-1 rounded-xl bg-indigo-600 py-2 text-xs font-bold text-white disabled:opacity-50">
                    {busy ? t('hr.saving') : t('hr.contracts.save')}
                </button>
            </div>
        </div>
    );
};

/* ── Renewal ─────────────────────────────────────────────────────────────── */

interface RenewForm {
    end: string;
    file: File | null;
}

const RenewContractForm: React.FC<{ busy: boolean; onCancel: () => void; onSave: (f: RenewForm) => void }> = ({ busy, onCancel, onSave }) => {
    const { t } = useTranslation();
    const [form, setForm] = useState<RenewForm>({ end: oneYearFromTodayNZ(), file: null });
    return (
        <div className="relative z-10 space-y-2 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3" data-testid="renew-contract-form">
            <label className="block text-[11px] font-bold text-slate-500">{t('hr.contracts.renew_until')}
                <input className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white" type="date" value={form.end} onChange={e => setForm({ ...form, end: e.target.value })} />
            </label>
            <PdfField label={t('hr.contracts.signed_pdf_optional')} file={form.file} onChange={file => setForm({ ...form, file })} disabled={busy} />
            <div className="flex gap-2">
                <button onClick={onCancel} disabled={busy} className="flex-1 rounded-xl bg-white py-2 text-xs font-bold text-slate-600 border border-slate-200">{t('common.cancel')}</button>
                <button onClick={() => onSave(form)} disabled={busy || !form.end} className="flex-1 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white disabled:opacity-50">
                    {busy ? t('hr.saving') : t('hr.contracts.confirm_renew')}
                </button>
            </div>
        </div>
    );
};

export default ContractsTab;
