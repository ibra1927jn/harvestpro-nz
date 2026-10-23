/**
 * FleetTab.tsx — Logistics Fleet Management
 * Orchard zone map + tractor list with status indicators
 *
 * B6 (auditoría 2026-10-23): conductor y estado se guardan (antes se editaban
 * y no iban a ningún sitio); alta y baja de vehículos con nombre, matrícula,
 * tipo, zona y capacidad; WOF / COF y próximo servicio editables; filtro por tipo.
 */
import React, { useState, useMemo } from 'react';
import { Tractor, type VehicleType, type VehicleWrite } from '@/services/logistics-dept.service';
import { formatNZDate } from '@/utils/nzFormat';
import FilterBar from '@/components/ui/FilterBar';
import InlineSelect from '@/components/ui/InlineSelect';
import InlineEdit from '@/components/ui/InlineEdit';
import { useTranslation } from '@/i18n';
import { statusLabel } from '@/i18n/statusLabel';
import { formatNZTime } from '@/utils/nzFormat';

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
    active: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    idle: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
    maintenance: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
    offline: { bg: 'bg-surface-secondary', text: 'text-text-secondary', dot: 'bg-surface-tertiary' },
};

const LOAD_COLORS: Record<string, string> = {
    empty: 'text-text-muted', partial: 'text-amber-600', full: 'text-emerald-600',
};

interface FleetTabProps {
    tractors: Tractor[];
    /** Guarda cambios de un vehículo; lanza (o rechaza) con el motivo si no se guardó */
    onUpdateTractor?: (id: string, changes: Partial<Tractor>) => Promise<void> | void;
    onAddVehicle?: (input: VehicleWrite & { name: string }) => Promise<void>;
    onRetireVehicle?: (id: string) => Promise<void>;
    readOnly?: boolean;
}

const VEHICLE_TYPES: VehicleType[] = ['tractor', 'forklift', 'truck', 'ute'];

const EMPTY_NEW = { name: '', registration: '', type: 'tractor' as VehicleType, zone: '', max_capacity: '8' };

/** Fecha YYYY-MM-DD para un <input type="date"> */
const ymd = (d?: string) => (d ? d.slice(0, 10) : '');

const STATUS_SELECT_COLORS: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700',
    idle: 'bg-amber-50 text-amber-700',
    maintenance: 'bg-red-50 text-red-700',
    offline: 'bg-surface-secondary text-text-secondary',
};

const FleetTab: React.FC<FleetTabProps> = ({ tractors, onUpdateTractor, onAddVehicle, onRetireVehicle, readOnly = false }) => {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [showAdd, setShowAdd] = useState(false);
    const [newVehicle, setNewVehicle] = useState(EMPTY_NEW);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<Partial<Tractor>>({});
    const [busy, setBusy] = useState(false);

    const run = async (action: () => Promise<void> | void, ok: string) => {
        setError(null);
        setNotice(null);
        setBusy(true);
        try {
            await action();
            setNotice(ok);
            return true;
        } catch (e) {
            setError(t('logi.fleet.save_failed', { error: e instanceof Error ? e.message : String(e) }));
            return false;
        } finally {
            setBusy(false);
        }
    };
    const save = (id: string, changes: Partial<Tractor>) => {
        if (!onUpdateTractor) return;
        void run(() => onUpdateTractor(id, changes), t('logi.fleet.saved'));
    };
    const canEdit = !readOnly && !!onUpdateTractor;

    const statusOptions = useMemo(() =>
        [...new Set(tractors.map(tr => tr.status))].sort(),
        [tractors]
    );

    const filtered = useMemo(() => tractors.filter(tr => {
        const matchesSearch = !searchQuery ||
            tr.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            tr.driver_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            tr.zone.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = !activeFilters.status || tr.status === activeFilters.status;
        const matchesType = !activeFilters.type || tr.type === activeFilters.type;
        return matchesSearch && matchesStatus && matchesType;
    }), [tractors, searchQuery, activeFilters]);

    return (
        <div className="space-y-4">
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
                searchPlaceholder="Search vehicles, drivers, zones..."
                filters={[
                    { key: 'status', label: t('orchardMap.list.col.status'), options: statusOptions, icon: 'local_shipping' },
                    { key: 'type', label: t('logi.fleet.type'), options: VEHICLE_TYPES.map(v => ({ value: v, label: t(`runner.now.vehicle_${v}`) })), icon: 'agriculture' },
                ]}
                activeFilters={activeFilters}
                onFilterChange={(key, value) => setActiveFilters(prev => ({ ...prev, [key]: value }))}
                onClearAll={() => { setSearchQuery(''); setActiveFilters({}); }}
            />

            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
            {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}

            {/* Alta de vehículo */}
            {!readOnly && onAddVehicle && (
                <div className="bg-white rounded-xl p-4 shadow-sm border border-border-light">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-text-primary text-sm">{t('logi.fleet.title')}</h3>
                        <button type="button" onClick={() => setShowAdd(v => !v)} aria-expanded={showAdd}
                            className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-bold flex items-center gap-1">
                            <span aria-hidden="true" className="material-symbols-outlined text-sm">add</span>
                            {t('logi.fleet.add')}
                        </button>
                    </div>
                    {showAdd && (
                        <form
                            className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3"
                            aria-label={t('logi.fleet.add')}
                            onSubmit={async e => {
                                e.preventDefault();
                                if (!newVehicle.name.trim()) { setError(t('logi.fleet.name_required')); return; }
                                const ok = await run(() => onAddVehicle({
                                    name: newVehicle.name,
                                    registration: newVehicle.registration,
                                    type: newVehicle.type,
                                    zone: newVehicle.zone,
                                    max_capacity: Number(newVehicle.max_capacity) || 8,
                                }), t('logi.fleet.added', { name: newVehicle.name.trim() }));
                                if (ok) { setNewVehicle(EMPTY_NEW); setShowAdd(false); }
                            }}
                        >
                            <input aria-label={t('logi.fleet.name')} placeholder={t('logi.fleet.name')} value={newVehicle.name} maxLength={60}
                                onChange={e => setNewVehicle(v => ({ ...v, name: e.target.value }))} className="px-2 py-1.5 rounded border border-border-light text-sm" />
                            <input aria-label={t('logi.fleet.registration')} placeholder={t('logi.fleet.registration')} value={newVehicle.registration} maxLength={12}
                                onChange={e => setNewVehicle(v => ({ ...v, registration: e.target.value.toUpperCase() }))} className="px-2 py-1.5 rounded border border-border-light text-sm" />
                            <select aria-label={t('logi.fleet.type')} value={newVehicle.type}
                                onChange={e => setNewVehicle(v => ({ ...v, type: e.target.value as VehicleType }))} className="px-2 py-1.5 rounded border border-border-light text-sm">
                                {VEHICLE_TYPES.map(v => <option key={v} value={v}>{t(`runner.now.vehicle_${v}`)}</option>)}
                            </select>
                            <input aria-label={t('logi.fleet.zone')} placeholder={t('logi.fleet.zone')} value={newVehicle.zone} maxLength={20}
                                onChange={e => setNewVehicle(v => ({ ...v, zone: e.target.value }))} className="px-2 py-1.5 rounded border border-border-light text-sm" />
                            <input aria-label={t('logi.fleet.capacity')} type="number" min="1" value={newVehicle.max_capacity}
                                onChange={e => setNewVehicle(v => ({ ...v, max_capacity: e.target.value }))} className="px-2 py-1.5 rounded border border-border-light text-sm" />
                            <button type="submit" disabled={busy} className="col-span-2 md:col-span-5 py-2 rounded-lg bg-teal-600 text-white text-sm font-bold disabled:opacity-50">
                                {t('logi.fleet.save_new')}
                            </button>
                        </form>
                    )}
                </div>
            )}

            {/* Zone Map */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-border-light">
                <h3 className="font-bold text-text-primary text-sm mb-3">{t('logi.zone_map')}</h3>
                <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
                    {['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'C1'].map(zone => {
                        const tractorsInZone = tractors.filter(tr => tr.zone === zone);
                        const hasActive = tractorsInZone.some(tr => tr.status === 'active');
                        return (
                            <div
                                key={zone}
                                className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs font-bold border-2 transition-all cursor-pointer hover:scale-105 ${hasActive
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                    : tractorsInZone.length > 0
                                        ? 'bg-amber-50 border-amber-300 text-amber-700'
                                        : 'bg-background-light border-border-light text-text-muted'
                                    }`}
                            >
                                <span>{zone}</span>
                                {tractorsInZone.length > 0 && (
                                    <span aria-hidden="true" className="material-symbols-outlined text-sm mt-0.5">agriculture</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Tractor Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                {filtered.map(tractor => {
                    const s = STATUS_STYLES[tractor.status] || STATUS_STYLES.offline;
                    return (
                        <div key={tractor.id} className="bg-white rounded-xl p-4 shadow-sm border border-border-light hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                    <div className={`size-10 rounded-lg ${s.bg} flex items-center justify-center`}>
                                        <span aria-hidden="true" className={`material-symbols-outlined ${s.text}`}>{tractor.type === 'forklift' ? 'forklift' : tractor.type === 'truck' ? 'local_shipping' : 'agriculture'}</span>
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-text-primary text-sm">
                                            {tractor.name}
                                            {/* Tipo de vehículo: decide si quien lo lleva es driver o forklift (runners en el huerto) */}
                                            <span className="ml-2 text-[10px] font-bold uppercase text-text-muted">{t(`runner.now.vehicle_${tractor.type}`)}</span>
                                        </h4>
                                        <p className="text-xs text-text-secondary flex items-center gap-1">
                                            <InlineEdit
                                                value={tractor.driver_name}
                                                onSave={(val) => save(tractor.id, { driver_name: val })}
                                                placeholder={t('logi.assign_driver')}
                                                disabled={!canEdit}
                                            />
                                            <span className="text-text-disabled">•</span>
                                            {t('logi.zone', { zone: tractor.zone })}
                                        </p>
                                    </div>
                                </div>
                                <InlineSelect
                                    value={tractor.status}
                                    options={['active', 'idle', 'maintenance', 'offline']}
                                    colorMap={STATUS_SELECT_COLORS}
                                    onSave={(val) => save(tractor.id, { status: val as Tractor['status'] })}
                                    disabled={!canEdit}
                                />
                            </div>
                            <div className="flex items-center gap-4 text-xs text-text-secondary">
                                <span className={`flex items-center gap-1 font-medium ${LOAD_COLORS[tractor.load_status] || 'text-text-muted'}`}>
                                    <span aria-hidden="true" className="material-symbols-outlined text-xs">inventory_2</span>
                                    {t('logi.bins_loaded', { n: tractor.bins_loaded, max: tractor.max_capacity })} — {statusLabel(t, tractor.load_status)}
                                </span>
                                <span className="ml-auto text-text-muted">
                                    {formatNZTime(tractor.last_update)}
                                </span>
                            </div>
                            {/* Matrícula, WOF / COF y próximo servicio */}
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-secondary" data-testid={`vehicle-docs-${tractor.id}`}>
                                {tractor.registration && <span className="font-mono">{tractor.registration}</span>}
                                <span>{t('logi.fleet.wof')}: {tractor.wof_expiry ? formatNZDate(tractor.wof_expiry, 'medium') : '—'}</span>
                                <span>{t('logi.fleet.cof')}: {tractor.cof_expiry ? formatNZDate(tractor.cof_expiry, 'medium') : '—'}</span>
                                <span>{t('logi.fleet.next_service')}: {tractor.next_service_date ? formatNZDate(tractor.next_service_date, 'medium') : '—'}</span>
                            </div>
                            {canEdit && (
                                <div className="mt-3 flex gap-2">
                                    <button type="button"
                                        onClick={() => {
                                            setEditingId(editingId === tractor.id ? null : tractor.id);
                                            setDraft({
                                                name: tractor.name, registration: tractor.registration ?? '', type: tractor.type,
                                                zone: tractor.zone === 'Unassigned' ? '' : tractor.zone, max_capacity: tractor.max_capacity,
                                                wof_expiry: ymd(tractor.wof_expiry), cof_expiry: ymd(tractor.cof_expiry), next_service_date: ymd(tractor.next_service_date),
                                            });
                                        }}
                                        aria-expanded={editingId === tractor.id}
                                        aria-label={t('logi.fleet.edit_for', { name: tractor.name })}
                                        className="px-2.5 py-1 rounded-lg border border-border-light text-xs font-bold text-text-secondary hover:bg-slate-50">
                                        {t('logi.fleet.edit')}
                                    </button>
                                    {onRetireVehicle && (
                                        <button type="button"
                                            onClick={() => {
                                                if (!window.confirm(t('logi.fleet.confirm_retire', { name: tractor.name }))) return;
                                                void run(() => onRetireVehicle(tractor.id), t('logi.fleet.retired', { name: tractor.name }));
                                            }}
                                            aria-label={t('logi.fleet.retire_for', { name: tractor.name })}
                                            className="px-2.5 py-1 rounded-lg border border-red-200 text-xs font-bold text-red-600 hover:bg-red-50">
                                            {t('logi.fleet.retire')}
                                        </button>
                                    )}
                                </div>
                            )}
                            {canEdit && editingId === tractor.id && (
                                <form
                                    className="mt-3 grid grid-cols-2 gap-2"
                                    aria-label={t('logi.fleet.edit_for', { name: tractor.name })}
                                    onSubmit={async e => {
                                        e.preventDefault();
                                        const ok = await run(() => onUpdateTractor!(tractor.id, draft), t('logi.fleet.saved'));
                                        if (ok) setEditingId(null);
                                    }}
                                >
                                    <label className="text-[11px] text-text-secondary flex flex-col">{t('logi.fleet.name')}
                                        <input value={String(draft.name ?? '')} maxLength={60} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} className="px-2 py-1 rounded border border-border-light text-sm" />
                                    </label>
                                    <label className="text-[11px] text-text-secondary flex flex-col">{t('logi.fleet.registration')}
                                        <input value={String(draft.registration ?? '')} maxLength={12} onChange={e => setDraft(d => ({ ...d, registration: e.target.value.toUpperCase() }))} className="px-2 py-1 rounded border border-border-light text-sm" />
                                    </label>
                                    <label className="text-[11px] text-text-secondary flex flex-col">{t('logi.fleet.type')}
                                        <select value={draft.type} onChange={e => setDraft(d => ({ ...d, type: e.target.value as VehicleType }))} className="px-2 py-1 rounded border border-border-light text-sm">
                                            {VEHICLE_TYPES.map(v => <option key={v} value={v}>{t(`runner.now.vehicle_${v}`)}</option>)}
                                        </select>
                                    </label>
                                    <label className="text-[11px] text-text-secondary flex flex-col">{t('logi.fleet.zone')}
                                        <input value={String(draft.zone ?? '')} maxLength={20} onChange={e => setDraft(d => ({ ...d, zone: e.target.value }))} className="px-2 py-1 rounded border border-border-light text-sm" />
                                    </label>
                                    <label className="text-[11px] text-text-secondary flex flex-col">{t('logi.fleet.capacity')}
                                        <input type="number" min="1" value={String(draft.max_capacity ?? '')} onChange={e => setDraft(d => ({ ...d, max_capacity: Number(e.target.value) }))} className="px-2 py-1 rounded border border-border-light text-sm" />
                                    </label>
                                    <label className="text-[11px] text-text-secondary flex flex-col">{t('logi.fleet.wof')}
                                        <input type="date" value={String(draft.wof_expiry ?? '')} onChange={e => setDraft(d => ({ ...d, wof_expiry: e.target.value }))} className="px-2 py-1 rounded border border-border-light text-sm" />
                                    </label>
                                    <label className="text-[11px] text-text-secondary flex flex-col">{t('logi.fleet.cof')}
                                        <input type="date" value={String(draft.cof_expiry ?? '')} onChange={e => setDraft(d => ({ ...d, cof_expiry: e.target.value }))} className="px-2 py-1 rounded border border-border-light text-sm" />
                                    </label>
                                    <label className="text-[11px] text-text-secondary flex flex-col">{t('logi.fleet.next_service')}
                                        <input type="date" value={String(draft.next_service_date ?? '')} onChange={e => setDraft(d => ({ ...d, next_service_date: e.target.value }))} className="px-2 py-1 rounded border border-border-light text-sm" />
                                    </label>
                                    <button type="submit" disabled={busy} className="col-span-2 py-1.5 rounded-lg bg-teal-600 text-white text-sm font-bold disabled:opacity-50">{t('logi.fleet.save')}</button>
                                </form>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default FleetTab;
