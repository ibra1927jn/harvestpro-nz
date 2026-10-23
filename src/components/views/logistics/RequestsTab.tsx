/**
 * RequestsTab.tsx — Logistics Transport Requests
 * Priority-sorted request cards with Assign/Complete/Cancel action buttons
 */
import React, { useState, useMemo } from 'react';
import EmptyState from '@/components/ui/EmptyState';
import FilterBar from '@/components/ui/FilterBar';
import {
    TransportRequest, Tractor,
    assignVehicleToRequest, completeTransportRequest, cancelTransportRequest
} from '@/services/logistics-dept.service';
import { vehiclesForTransport, type TransportVehicleFilter } from './logisticsLogic';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/i18n';
import { statusLabel } from '@/i18n/statusLabel';
import { formatNZDate, formatNZTime } from '@/utils/nzFormat';

const PRIORITY_BADGES: Record<string, string> = {
    urgent: 'bg-red-100 text-red-700',
    high: 'bg-amber-100 text-amber-700',
    normal: 'bg-surface-secondary text-text-secondary',
};

const STATUS_BADGES: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700',
    assigned: 'bg-sky-50 text-sky-700',
    in_progress: 'bg-indigo-50 text-indigo-700',
    completed: 'bg-emerald-50 text-emerald-700',
    cancelled: 'bg-red-50 text-red-700',
};

interface RequestsTabProps {
    requests: TransportRequest[];
    tractors?: Tractor[];
    onRefresh?: () => void;
    readOnly?: boolean;
}

const RequestsTab: React.FC<RequestsTabProps> = ({ requests, tractors = [], onRefresh, readOnly = false }) => {
    const { t } = useTranslation();
    const { appUser } = useAuth();
    const [assigningId, setAssigningId] = useState<string | null>(null);
    const [selectedVehicle, setSelectedVehicle] = useState('');
    // Por defecto sin carretillas: mueven bins dentro de la zona, no entre zonas
    const [vehicleType, setVehicleType] = useState<TransportVehicleFilter>('not_forklift');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

    const filterOpts = useMemo(() => ({
        priorities: [...new Set(requests.map(r => r.priority))].sort(),
        statuses: [...new Set(requests.map(r => r.status))].sort(),
    }), [requests]);

    const filteredRequests = useMemo(() => requests.filter(req => {
        const matchesSearch = !searchQuery ||
            req.zone.toLowerCase().includes(searchQuery.toLowerCase()) ||
            String(req.bins_count).includes(searchQuery);
        const matchesPriority = !activeFilters.priority || req.priority === activeFilters.priority;
        const matchesStatus = !activeFilters.status || req.status === activeFilters.status;
        return matchesSearch && matchesPriority && matchesStatus;
    }), [requests, searchQuery, activeFilters]);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const availableTractors = vehiclesForTransport(tractors, vehicleType);

    const handleAssign = (requestId: string, updatedAt?: string) => {
        if (!selectedVehicle || !appUser?.id) return;
        // Quién asigna: el usuario real (antes se mandaba el texto 'current_user' y la BD lo rechazaba)
        assignVehicleToRequest(requestId, selectedVehicle, appUser.id, updatedAt);
        showToast(t('logi.toast.assigned'));
        setAssigningId(null);
        setSelectedVehicle('');
        onRefresh?.();
    };

    const handleComplete = (requestId: string, updatedAt?: string) => {
        completeTransportRequest(requestId, updatedAt);
        showToast(t('logi.toast.completed'));
        onRefresh?.();
    };

    const handleCancel = (requestId: string, updatedAt?: string) => {
        // Cancelar no se deshace: se pregunta antes (auditoría 2026-10-23, E)
        const req = requests.find(r => r.id === requestId);
        if (!window.confirm(t('logi.req.confirm_cancel', { zone: req?.zone ?? '', bins: req?.bins_count ?? 0 }))) return;
        cancelTransportRequest(requestId, updatedAt);
        showToast(t('logi.toast.cancelled'), 'error');
        onRefresh?.();
    };

    return (
        <div className="space-y-3 relative">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2
                    ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    <span aria-hidden="true" className="material-symbols-outlined text-sm">
                        {toast.type === 'success' ? 'check_circle' : 'warning'}
                    </span>
                    {toast.message}
                </div>
            )}

            {/* Read-only badge */}
            {readOnly && (
                <div className="flex justify-end">
                    <span className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 rounded">Read-only</span>
                </div>
            )}

            {/* Filter Bar */}
            <FilterBar
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search by zone or cargo..."
                filters={[
                    { key: 'priority', label: t('broadcast.priority'), options: filterOpts.priorities, icon: 'priority_high' },
                    { key: 'status', label: t('orchardMap.list.col.status'), options: filterOpts.statuses, icon: 'pending_actions' },
                ]}
                activeFilters={activeFilters}
                onFilterChange={(key, value) => setActiveFilters(prev => ({ ...prev, [key]: value }))}
                onClearAll={() => { setSearchQuery(''); setActiveFilters({}); }}
            />

            {filteredRequests.length === 0 && (
                <EmptyState
                    icon="local_shipping"
                    title={t('logi.no_requests')}
                    subtitle={searchQuery || Object.values(activeFilters).some(v => v) ? t('qc.adjust_filters') : t('logi.no_requests_desc')}
                    compact
                />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {filteredRequests.map(req => (
                    <div key={req.id} className="bg-white/70 backdrop-blur-md rounded-2xl p-5 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-white/60 transition-all duration-300 hover:shadow-[0_8px_32px_rgb(0,0,0,0.08)] hover:-translate-y-1 relative overflow-hidden group">
                        
                        {/* Decorative background gradient on hover */}
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                        <div className="flex items-center justify-between mb-3 relative z-10">
                            <div className="flex items-center gap-3">
                                <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full shadow-sm ${PRIORITY_BADGES[req.priority] || 'bg-surface-secondary text-text-secondary'}`}>
                                    {statusLabel(t, req.priority)}
                                </span>
                                <h4 className="font-bold text-slate-800 text-sm">{t('logi.zone', { zone: req.zone })}</h4>
                            </div>
                            <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border ${STATUS_BADGES[req.status] || 'bg-surface-secondary text-text-secondary border-border-light'}`}>
                                {statusLabel(t, req.status)}
                            </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 font-medium mb-3 relative z-10">
                            <span>{req.requester_name}</span>
                            <span>•</span>
                            <span>{t('dashboard.velocity.tooltip_bins', { n: req.bins_count })}</span>
                            {req.assigned_tractor && (
                                <>
                                    <span>•</span>
                                    <span className="text-indigo-600 font-medium">{t('logi.assigned_to', { name: req.assigned_tractor })}</span>
                                </>
                            )}
                        </div>
                        {req.notes && (
                            <p className="text-xs text-slate-500 italic mb-3 relative z-10 bg-slate-50/50 p-2 rounded-lg border border-slate-100">{req.notes}</p>
                        )}
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mb-4 relative z-10 font-medium">
                            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">schedule</span>
                            {formatNZTime(req.created_at)} — {formatNZDate(req.created_at)}
                        </div>

                        {/* Action Buttons — hidden in read-only mode */}
                        {!readOnly && <div className="pt-3 border-t border-slate-100/60 relative z-10 mt-auto">
                            {req.status === 'pending' && (
                                <div className="space-y-2">
                                    {assigningId === req.id ? (
                                        <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1">
                                            <select
                                                value={vehicleType}
                                                onChange={e => { setVehicleType(e.target.value as TransportVehicleFilter); setSelectedVehicle(''); }}
                                                className="w-full px-3 py-2 rounded-xl bg-white/80 border border-slate-200 text-sm outline-none"
                                                aria-label={t('logi.fleet.type')}
                                            >
                                                <option value="not_forklift">{t('logi.req.no_forklifts')}</option>
                                                <option value="all">{t('logi.req.all_types')}</option>
                                                {(['tractor', 'truck', 'ute', 'forklift'] as const).map(v => (
                                                    <option key={v} value={v}>{t(`runner.now.vehicle_${v}`)}</option>
                                                ))}
                                            </select>
                                            <select
                                                value={selectedVehicle}
                                                onChange={e => setSelectedVehicle(e.target.value)}
                                                className="w-full px-3 py-2 rounded-xl bg-white/80 border border-slate-200 text-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all shadow-sm"
                                                aria-label={t('logi.select_vehicle')}
                                            >
                                                <option value="">{t('logi.select_vehicle')}...</option>
                                                {availableTractors.map(tr => (
                                                    <option key={tr.id} value={tr.id}>
                                                        {tr.name} · {t(`runner.now.vehicle_${tr.type}`)} — {tr.zone} ({statusLabel(t, tr.status)}, {tr.bins_loaded}/{tr.max_capacity})
                                                    </option>
                                                ))}
                                            </select>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleAssign(req.id, req.updated_at)}
                                                    disabled={!selectedVehicle}
                                                    className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold shadow-md shadow-indigo-600/20 hover:bg-indigo-700 hover:shadow-indigo-600/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                                                >
                                                    {t('logi.confirm')}
                                                </button>
                                                <button
                                                    onClick={() => { setAssigningId(null); setSelectedVehicle(''); }}
                                                    className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-600 border border-slate-200 text-sm font-bold shadow-sm hover:bg-slate-200 hover:text-slate-900 transition-all"
                                                >
                                                    {t('common.cancel')}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setAssigningId(req.id)}
                                                className="flex-1 py-2 rounded-xl bg-indigo-50/80 text-indigo-700 text-sm font-bold border border-indigo-100 shadow-sm hover:bg-indigo-100 transition-all flex items-center justify-center gap-1.5 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 group-hover:shadow-md group-hover:shadow-indigo-600/20"
                                            >
                                                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">agriculture</span>
                                                {t('logi.assign_vehicle')}
                                            </button>
                                            <button
                                                onClick={() => handleCancel(req.id, req.updated_at)}
                                                className="py-2 px-4 rounded-xl bg-red-50 text-red-700 text-sm font-bold border border-red-100 shadow-sm hover:bg-red-100 hover:text-red-800 transition-all"
                                                                                                aria-label={t('logi.cancel_request')}
                                                                                                title={t('logi.cancel_request')}
                                            >
                                                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">close</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {(req.status === 'assigned' || req.status === 'in_progress') && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleComplete(req.id, req.updated_at)}
                                        className="flex-1 py-2 rounded-xl bg-emerald-500 text-white text-sm font-bold shadow-md shadow-emerald-500/20 hover:bg-emerald-600 hover:shadow-emerald-500/40 transition-all flex items-center justify-center gap-1.5"
                                    >
                                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">check_circle</span>
                                        {t('logi.mark_completed')}
                                    </button>
                                    <button
                                        onClick={() => handleCancel(req.id, req.updated_at)}
                                        className="py-2 px-4 rounded-xl bg-red-50 text-red-700 text-sm font-bold border border-red-100 shadow-sm hover:bg-red-100 hover:text-red-800 transition-all"
                                                                                aria-label={t('logi.cancel_request')}
                                                                                title={t('logi.cancel_request')}
                                    >
                                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">close</span>
                                    </button>
                                </div>
                            )}
                        </div>}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default RequestsTab;
