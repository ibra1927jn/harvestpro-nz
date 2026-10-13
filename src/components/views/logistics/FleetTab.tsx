/**
 * FleetTab.tsx — Logistics Fleet Management
 * Orchard zone map + tractor list with status indicators
 */
import React, { useState, useMemo } from 'react';
import { Tractor } from '@/services/logistics-dept.service';
import FilterBar from '@/components/ui/FilterBar';
import InlineSelect from '@/components/ui/InlineSelect';
import InlineEdit from '@/components/ui/InlineEdit';

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
    onUpdateTractor?: (id: string, changes: Partial<Tractor>) => void;
    readOnly?: boolean;
}

const STATUS_SELECT_COLORS: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700',
    idle: 'bg-amber-50 text-amber-700',
    maintenance: 'bg-red-50 text-red-700',
    offline: 'bg-surface-secondary text-text-secondary',
};

const FleetTab: React.FC<FleetTabProps> = ({ tractors, onUpdateTractor, readOnly = false }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

    const statusOptions = useMemo(() =>
        [...new Set(tractors.map(t => t.status))].sort(),
        [tractors]
    );

    const filtered = useMemo(() => tractors.filter(t => {
        const matchesSearch = !searchQuery ||
            t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.driver_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.zone.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = !activeFilters.status || t.status === activeFilters.status;
        return matchesSearch && matchesStatus;
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
                    { key: 'status', label: 'Status', options: statusOptions, icon: 'local_shipping' },
                ]}
                activeFilters={activeFilters}
                onFilterChange={(key, value) => setActiveFilters(prev => ({ ...prev, [key]: value }))}
                onClearAll={() => { setSearchQuery(''); setActiveFilters({}); }}
            />

            {/* Zone Map */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-border-light">
                <h3 className="font-bold text-text-primary text-sm mb-3">Orchard Zone Map</h3>
                <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
                    {['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'C1'].map(zone => {
                        const tractorsInZone = tractors.filter(t => t.zone === zone);
                        const hasActive = tractorsInZone.some(t => t.status === 'active');
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
                                        <span aria-hidden="true" className={`material-symbols-outlined ${s.text}`}>agriculture</span>
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-text-primary text-sm">{tractor.name}</h4>
                                        <p className="text-xs text-text-secondary flex items-center gap-1">
                                            <InlineEdit
                                                value={tractor.driver_name}
                                                onSave={(val) => onUpdateTractor?.(tractor.id, { driver_name: val })}
                                                placeholder="Assign driver..."
                                                disabled={readOnly}
                                            />
                                            <span className="text-text-disabled">•</span>
                                            Zone {tractor.zone}
                                        </p>
                                    </div>
                                </div>
                                <InlineSelect
                                    value={tractor.status}
                                    options={['active', 'idle', 'maintenance', 'offline']}
                                    colorMap={STATUS_SELECT_COLORS}
                                    onSave={(val) => onUpdateTractor?.(tractor.id, { status: val as Tractor['status'] })}
                                    disabled={readOnly}
                                />
                            </div>
                            <div className="flex items-center gap-4 text-xs text-text-secondary">
                                <span className={`flex items-center gap-1 font-medium ${LOAD_COLORS[tractor.load_status] || 'text-text-muted'}`}>
                                    <span aria-hidden="true" className="material-symbols-outlined text-xs">inventory_2</span>
                                    {tractor.bins_loaded}/{tractor.max_capacity} bins — {tractor.load_status}
                                </span>
                                <span className="ml-auto text-text-muted">
                                    {new Date(tractor.last_update).toLocaleTimeString('en-NZ', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default FleetTab;
