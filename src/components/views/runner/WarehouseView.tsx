/**
 * WarehouseView — Almacén del runner.
 *
 * Qué enseña (revisión 2026-10-21, punto 12):
 *   - contadores del huerto: bins llenos / vacíos / en curso (sin adornos);
 *   - «Solicitar transporte» crea una solicitud de transporte real (antes solo
 *     mandaba un mensaje al chat) que aparece abajo al momento;
 *   - MIS solicitudes de transporte con su estado real (pendiente / asignada /
 *     en curso) y vehículo, con «cancelar» mientras estén pendientes;
 *   - bins por zona, llenos primero, para saber dónde hay que recoger.
 * Antes: tres contadores, una campana sin función, un avatar externo y un
 * «transporte solicitado» que salía con más de 10 bins llenos aunque no hubiera
 * ninguna solicitud.
 */
import React, { useState } from 'react';
import { useTranslation } from '@/i18n';
import EmptyState from '@/components/ui/EmptyState';
import Toast from '@/components/ui/Toast';
import { useToast } from '@/hooks/useToast';
import { useRunnerWarehouse } from '@/hooks/useRunnerWarehouse';
import type { BinInventory, TransportRequest } from '@/services/logistics-dept.service';
import { formatNZTime } from '@/utils/nzFormat';
import { logger } from '@/utils/logger';

interface WarehouseViewProps {
    inventory?: {
        full_bins: number;
        empty_bins: number;
        in_progress: number;
        total: number;
    };
}

const REQUEST_STATUS: Record<TransportRequest['status'], { key: string; className: string; icon: string }> = {
    pending: { key: 'runner.warehouse.req_pending', className: 'bg-amber-50 text-amber-700 border-amber-100', icon: 'hourglass_top' },
    assigned: { key: 'runner.warehouse.req_assigned', className: 'bg-indigo-50 text-indigo-700 border-indigo-100', icon: 'agriculture' },
    in_progress: { key: 'runner.warehouse.req_in_progress', className: 'bg-sky-50 text-sky-700 border-sky-100', icon: 'local_shipping' },
    completed: { key: 'runner.warehouse.req_completed', className: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: 'check_circle' },
    cancelled: { key: 'runner.warehouse.req_cancelled', className: 'bg-slate-100 text-slate-500 border-slate-200', icon: 'cancel' },
};

const BIN_STATUS: Record<BinInventory['status'], { key: string; dot: string }> = {
    full: { key: 'runner.warehouse.bin_full', dot: 'bg-red-500' },
    filling: { key: 'runner.warehouse.bin_filling', dot: 'bg-amber-400' },
    in_transit: { key: 'runner.warehouse.bin_in_transit', dot: 'bg-sky-500' },
    at_warehouse: { key: 'runner.warehouse.bin_at_warehouse', dot: 'bg-indigo-400' },
    empty: { key: 'runner.warehouse.bin_empty', dot: 'bg-emerald-500' },
};

const WarehouseView: React.FC<WarehouseViewProps> = ({ inventory }) => {
    const { t } = useTranslation();
    const { zones, myRequests, loading, requestPickup, cancelMine } = useRunnerWarehouse();
    const { toast, showToast, hideToast } = useToast();
    const [requesting, setRequesting] = useState(false);
    const fullBins = inventory?.full_bins || 0;
    const emptyBins = inventory?.empty_bins || 0;
    const inProgress = inventory?.in_progress || 0;

    // Solicitud de transporte real (en cola sin red): aparece en «mis solicitudes»
    const handleRequestPickup = async () => {
        if (requesting) return;
        setRequesting(true);
        try {
            const request = await requestPickup(fullBins);
            showToast(t('runner.warehouse.pickup_sent', { n: request.bins_count }), 'success');
        } catch (e) {
            logger.error('[Warehouse] pickup request failed', e);
            showToast(t('runner.warehouse.pickup_failed'), 'error');
        } finally {
            setRequesting(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
            {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
            <header className="flex-none bg-white/80 backdrop-blur-xl z-30 border-b border-slate-100 pt-6">
                <div className="flex items-center px-6 py-4 justify-between gap-3">
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-tight">{t('runner.warehouse.title')}</h2>
                        <p className="text-[10px] font-bold text-primary uppercase tracking-widest mt-0.5">{t('runner.warehouse.subtitle')}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => { void handleRequestPickup(); }}
                        disabled={requesting}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider shadow-md active:scale-95 min-h-[44px] disabled:opacity-60"
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-base">local_shipping</span>
                        {t('runner.warehouse.request_transport')}
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 pb-24">
                {/* Contadores */}
                <div className="grid grid-cols-3 gap-3" aria-label={t('runner.warehouse.title')}>
                    {[
                        { value: fullBins, label: t('runner.warehouse.full_bins'), color: 'text-red-600', bg: 'bg-red-50 border-red-100' },
                        { value: emptyBins, label: t('runner.empty_bins'), color: emptyBins < 5 ? 'text-amber-700' : 'text-emerald-700', bg: emptyBins < 5 ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100' },
                        { value: inProgress, label: t('orchardMap.status.in_progress'), color: 'text-sky-700', bg: 'bg-sky-50 border-sky-100' },
                    ].map(c => (
                        <div key={c.label} className={`rounded-2xl border p-3 text-center ${c.bg}`}>
                            <p className={`text-2xl font-black tabular-nums ${c.color}`}>{c.value}</p>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider leading-tight">{c.label}</p>
                        </div>
                    ))}
                </div>
                {emptyBins < 5 && (
                    <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                        <span aria-hidden="true" className="material-symbols-outlined text-base">warning</span>
                        {t('runner.warehouse.critical')}
                    </p>
                )}

                {/* Mis solicitudes */}
                <section aria-labelledby="my-requests-title">
                    <h3 id="my-requests-title" className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">{t('runner.warehouse.my_requests')}</h3>
                    {myRequests.length === 0 ? (
                        <p className="text-sm text-slate-500 bg-white rounded-2xl border border-slate-100 p-4">{t('runner.warehouse.no_requests')}</p>
                    ) : (
                        <ul className="space-y-2">
                            {myRequests.map(r => {
                                const st = REQUEST_STATUS[r.status];
                                return (
                                    <li key={r.id} className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center justify-between gap-3" data-testid="my-request">
                                        <div>
                                            <p className="text-sm font-bold text-slate-800">{t('runner.warehouse.req_line', { n: r.bins_count, zone: r.zone })}</p>
                                            <p className="text-[11px] text-slate-500 tabular-nums">{formatNZTime(r.created_at)}{r.assigned_tractor ? ` · ${t('runner.warehouse.vehicle_assigned')}` : ''}</p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${st.className}`}>
                                                <span aria-hidden="true" className="material-symbols-outlined text-[12px]">{st.icon}</span>
                                                {t(st.key)}
                                            </span>
                                            {r.status === 'pending' && (
                                                <button type="button" onClick={() => { void cancelMine(r); }} aria-label={t('runner.warehouse.cancel_request')} className="size-9 rounded-xl bg-slate-100 text-slate-500 hover:text-red-600 flex items-center justify-center">
                                                    <span aria-hidden="true" className="material-symbols-outlined text-base">close</span>
                                                </button>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>

                {/* Bins por zona */}
                <section aria-labelledby="bins-by-zone-title">
                    <h3 id="bins-by-zone-title" className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">{t('runner.warehouse.bins_by_zone')}</h3>
                    {loading ? (
                        <div className="flex justify-center py-6" role="status" aria-busy="true">
                            <div className="w-7 h-7 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
                        </div>
                    ) : zones.length === 0 ? (
                        <EmptyState icon="warehouse" title={t('runner.warehouse.empty_title')} subtitle={t('runner.warehouse.empty_desc')} iconColor="text-primary" />
                    ) : (
                        <div className="space-y-3">
                            {zones.map(z => (
                                <div key={z.zone} className="bg-white rounded-2xl border border-slate-100 p-4" data-testid="zone-card">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-sm font-black text-slate-800">{t('runner.warehouse.zone', { zone: z.zone })}</p>
                                        <p className="text-[11px] font-bold text-slate-500">{t('runner.warehouse.zone_counts', { full: z.full, empty: z.empty })}</p>
                                    </div>
                                    <ul className="flex flex-wrap gap-2">
                                        {z.bins.map(b => {
                                            const bs = BIN_STATUS[b.status];
                                            return (
                                                <li key={b.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-xs font-semibold text-slate-700" title={t(bs.key)}>
                                                    <span aria-hidden="true" className={`size-2 rounded-full ${bs.dot}`} />
                                                    {b.bin_code}
                                                    <span className="sr-only">{t(bs.key)}</span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default WarehouseView;
