/**
 * RunnersView — «Runners en el huerto»: quién está y qué hace cada uno.
 *
 * Antes esta pestaña («Corredores») listaba pickers, no runners. Ahora:
 *   - mapa de filas: dónde está cada runner a pie (su última fila escaneada),
 *     y cuántos pickers hay en cada fila;
 *   - vehículos activos con su conductor (driver / forklift), carga y zona;
 *   - lista de runners con su actividad derivada de los datos (runnersNow.ts):
 *     recogiendo · fila N / conduciendo tractor / forklift / en espera / sin actividad.
 * No hay GPS: la posición es la última fila escaneada o la zona del vehículo.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { fetchFleet, type Tractor } from '@/services/logistics-dept.service';
import { runnersNow, pickersByRow, type RunnerNow, type RunnerActivity } from '@/services/runnersNow';
import EmptyState from '@/components/ui/EmptyState';
import { logger } from '@/utils/logger';

export const FLEET_REFRESH_MS = 60_000;

const ACTIVITY: Record<RunnerActivity, { key: string; icon: string; className: string }> = {
    on_foot: { key: 'runner.now.on_foot', icon: 'directions_run', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
    driver: { key: 'runner.now.driver', icon: 'agriculture', className: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
    forklift: { key: 'runner.now.forklift', icon: 'forklift', className: 'bg-violet-50 text-violet-700 border-violet-100' },
    waiting: { key: 'runner.now.waiting', icon: 'hourglass_top', className: 'bg-amber-50 text-amber-700 border-amber-100' },
    idle: { key: 'runner.now.idle', icon: 'pause_circle', className: 'bg-slate-100 text-slate-500 border-slate-200' },
};

interface RunnersViewProps {
    onBack: () => void;
}

/** Mapa de filas: celdas 1..N con runners a pie y pickers por fila */
const RowMap: React.FC<{ totalRows: number; runners: RunnerNow[]; pickersPerRow: Map<number, number> }> = ({ totalRows, runners, pickersPerRow }) => {
    const { t } = useTranslation();
    const runnersByRow = useMemo(() => {
        const m = new Map<number, RunnerNow[]>();
        for (const r of runners) {
            if (r.activity !== 'on_foot' || r.row === null) continue;
            m.set(r.row, [...(m.get(r.row) ?? []), r]);
        }
        return m;
    }, [runners]);

    if (totalRows <= 0) return null;
    const rows = Array.from({ length: totalRows }, (_, i) => i + 1);

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4" aria-label={t('runner.now.map_title')}>
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">{t('runner.now.map_title')}</h3>
                <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
                    <span className="flex items-center gap-1"><span aria-hidden="true" className="size-2.5 rounded-full bg-emerald-500" />{t('runner.now.legend_runner')}</span>
                    <span className="flex items-center gap-1"><span aria-hidden="true" className="size-2.5 rounded-sm bg-slate-300" />{t('runner.now.legend_pickers')}</span>
                </div>
            </div>
            <div className="grid grid-cols-9 sm:grid-cols-12 lg:grid-cols-[repeat(15,minmax(0,1fr))] gap-1.5">
                {rows.map(row => {
                    const here = runnersByRow.get(row) ?? [];
                    const pickers = pickersPerRow.get(row) ?? 0;
                    const active = here.length > 0;
                    return (
                        <div
                            key={row}
                            data-testid={`row-cell-${row}`}
                            title={here.length ? here.map(r => r.name).join(', ') : undefined}
                            className={`relative aspect-square rounded-lg border flex flex-col items-center justify-center text-[10px] font-bold ${active ? 'bg-emerald-500 border-emerald-600 text-white' : pickers > 0 ? 'bg-slate-200 border-slate-300 text-slate-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                        >
                            <span>{row}</span>
                            {pickers > 0 && !active && <span className="text-[8px] leading-none">{pickers}</span>}
                            {active && <span className="sr-only">{here.map(r => r.name).join(', ')}</span>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const RunnersView: React.FC<RunnersViewProps> = ({ onBack }) => {
    const { t } = useTranslation();
    const crew = useHarvestStore(s => s.crew);
    const orchard = useHarvestStore(s => s.orchard);
    const bucketRecords = useHarvestStore(s => s.bucketRecords);
    const [fleet, setFleet] = useState<Tractor[]>([]);
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const f = await fetchFleet(orchard?.id);
                if (!cancelled) setFleet(f);
            } catch (e) {
                logger.warn('[RunnersView] fleet load failed', e);
            }
            if (!cancelled) setNow(new Date());
        };
        void load();
        const id = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, FLEET_REFRESH_MS);
        return () => { cancelled = true; clearInterval(id); };
    }, [orchard?.id]);

    const runners = useMemo(() => runnersNow({ crew, fleet, bucketRecords, now }), [crew, fleet, bucketRecords, now]);
    const pickersPerRow = useMemo(() => pickersByRow(crew), [crew]);
    const activeVehicles = useMemo(() => fleet.filter(v => v.status === 'active'), [fleet]);
    const totalRows = orchard?.total_rows ?? 0;

    return (
        <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
            <header className="pt-10 pb-4 px-6 flex items-center justify-between z-20 bg-white/80 backdrop-blur-xl sticky top-0 border-b border-slate-100">
                <button aria-label={t('common.back')} onClick={onBack} className="size-11 flex items-center justify-center rounded-2xl bg-white border border-slate-200 text-slate-600 active:scale-95">
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">arrow_back</span>
                </button>
                <div className="text-center">
                    <h1 className="text-xl font-black text-slate-800 tracking-tight">{t('runner.now.title')}</h1>
                    <p className="text-[11px] text-primary font-bold tracking-widest uppercase mt-0.5">{orchard?.name || t('runner.crew.live_ops')}</p>
                </div>
                <div className="size-11" />
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-24">
                <RowMap totalRows={totalRows} runners={runners} pickersPerRow={pickersPerRow} />

                {/* Vehículos activos */}
                {activeVehicles.length > 0 && (
                    <section aria-labelledby="vehicles-title" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                        <h3 id="vehicles-title" className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">{t('runner.now.vehicles')}</h3>
                        <ul className="space-y-2">
                            {activeVehicles.map(v => (
                                <li key={v.id} className="flex items-center justify-between gap-3 text-sm" data-testid="vehicle-row">
                                    <span className="flex items-center gap-2 font-bold text-slate-800">
                                        <span aria-hidden="true" className="material-symbols-outlined text-base text-indigo-500">{v.type === 'forklift' ? 'forklift' : 'agriculture'}</span>
                                        {v.name}
                                        <span className="text-[10px] font-bold uppercase text-slate-400">{t(`runner.now.vehicle_${v.type}`)}</span>
                                    </span>
                                    <span className="text-xs text-slate-500 tabular-nums">{v.driver_name} · {v.bins_loaded}/{v.max_capacity} · {v.zone}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {/* Runners */}
                <section aria-labelledby="runners-title">
                    <div className="flex items-center justify-between px-1 mb-2">
                        <h3 id="runners-title" className="text-xs font-black text-slate-500 uppercase tracking-widest">{t('runner.now.list_title')}</h3>
                        <span className="text-emerald-700 font-bold text-[10px] uppercase tracking-wider px-2.5 py-1 bg-emerald-50 rounded-full border border-emerald-100">
                            {t('runner.now.in_orchard_n', { n: runners.length })}
                        </span>
                    </div>
                    {runners.length === 0 ? (
                        <EmptyState icon="directions_run" title={t('runner.now.empty_title')} subtitle={t('runner.now.empty_desc')} iconColor="text-emerald-400" />
                    ) : (
                        <ul className="space-y-2">
                            {runners.map(r => {
                                const a = ACTIVITY[r.activity];
                                return (
                                    <li key={r.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3" data-testid="runner-row">
                                        <div className="size-11 rounded-xl bg-slate-100 flex items-center justify-center text-sm font-black text-slate-500 uppercase shrink-0">{r.avatar || r.name.slice(0, 2)}</div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-slate-800 truncate">{r.name}{!r.checkedIn && <span className="ml-2 text-[10px] font-bold text-amber-700">{t('runner.now.not_checked_in')}</span>}</p>
                                            <p className="text-xs text-slate-500 truncate">
                                                {r.vehicle
                                                    ? t('runner.now.detail_vehicle', { name: r.vehicle.name, loaded: r.vehicle.binsLoaded, max: r.vehicle.maxCapacity, zone: r.vehicle.zone })
                                                    : r.row !== null
                                                        ? t('runner.now.detail_row', { n: r.row, min: r.minutesSinceScan ?? 0 })
                                                        : t('runner.now.detail_none')}
                                            </p>
                                        </div>
                                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-bold shrink-0 ${a.className}`}>
                                            <span aria-hidden="true" className="material-symbols-outlined text-[12px]">{a.icon}</span>
                                            {t(a.key)}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </div>
        </div>
    );
};

export default RunnersView;
