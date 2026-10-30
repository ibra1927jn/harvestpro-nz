/**
 * FilterBar.tsx — Reusable Filter Bar Component
 *
 * Renders a horizontal bar with text search + dropdown filter chips.
 * Designed for high-traffic tables/lists in orchards with 400+ pickers.
 *
 * Usage:
 *   <FilterBar
 *     searchValue={q}
 *     onSearchChange={setQ}
 *     searchPlaceholder="Search employees..."
 *     filters={[
 *       { key: 'role',   label: 'Role',   options: ['team_leader', 'runner', 'manager'] },
 *       { key: 'status', label: 'Status', options: ['active', 'on_leave', 'terminated'] },
 *     ]}
 *     activeFilters={activeFilters}
 *     onFilterChange={(key, value) => setActiveFilters(prev => ({ ...prev, [key]: value }))}
 *     onClearAll={() => { setQ(''); setActiveFilters({}); }}
 *   />
 */
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '@/i18n';
import { statusLabel } from '@/i18n/statusLabel';

/* ── Types ── */
/** Opción con texto y recuento: las de 0 salen en gris pero se pueden elegir */
export interface FilterChoice {
    value: string;
    /** Texto a mostrar; si falta, status.<value> */
    label?: string;
    /** Cuántos elementos tienen este valor */
    count?: number;
}

export interface FilterOption {
    /** Unique filter key (matches data property) */
    key: string;
    /** Display label */
    label: string;
    /** Selectable values (plain values or value + label + count) */
    options: (string | FilterChoice)[];
    /** Optional icon name from material-symbols */
    icon?: string;
}

const toChoice = (opt: string | FilterChoice): FilterChoice => (typeof opt === 'string' ? { value: opt } : opt);

export interface FilterBarProps {
    /** Current search text */
    searchValue: string;
    /** Search change handler */
    onSearchChange: (value: string) => void;
    /** Search input placeholder */
    searchPlaceholder?: string;
    /** Filter definitions */
    filters: FilterOption[];
    /** Currently active filter values: { key: selectedValue } */
    activeFilters: Record<string, string>;
    /** Called when a filter value changes */
    onFilterChange: (key: string, value: string) => void;
    /** Clear all filters + search */
    onClearAll: () => void;
}

/* ── Dropdown Component ── */
const FilterDropdown: React.FC<{
    filter: FilterOption;
    activeValue: string;
    onChange: (key: string, value: string) => void;
}> = ({ filter, activeValue, onChange }) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        if (open) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const choices = filter.options.map(toChoice);
    const labelOf = (c: FilterChoice) => c.label ?? statusLabel(t, c.value);
    const isActive = activeValue !== '';
    const active = choices.find(c => c.value === activeValue);
    const displayLabel = isActive
        ? (active ? labelOf(active) : statusLabel(t, activeValue))
        : filter.label;

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(!open)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap
                    ${isActive
                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                        : 'bg-white text-text-secondary border border-border-light hover:border-border-medium'
                    }`}
            >
                {filter.icon && (
                    <span aria-hidden="true" className="material-symbols-outlined text-sm">{filter.icon}</span>
                )}
                <span className="capitalize">{displayLabel}</span>
                <span aria-hidden="true" className="material-symbols-outlined text-sm">
                    {open ? 'expand_less' : 'expand_more'}
                </span>
            </button>

            {open && (
                <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-lg border border-border-light py-1 z-50 min-w-[160px] animate-in fade-in slide-in-from-top-1 duration-150">
                    {/* "All" option */}
                    <button
                        onClick={() => { onChange(filter.key, ''); setOpen(false); }}
                        className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-background-light transition-colors flex items-center gap-2
                            ${!isActive ? 'text-indigo-700 bg-indigo-50/50' : 'text-text-secondary'}`}
                    >
                        {t('ui.all_of', { label: filter.label })}
                        {!isActive && <span aria-hidden="true" className="material-symbols-outlined text-xs ml-auto">check</span>}
                    </button>
                    {choices.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => { onChange(filter.key, opt.value); setOpen(false); }}
                            data-count={opt.count}
                            className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-background-light transition-colors flex items-center gap-2 capitalize
                                ${activeValue === opt.value ? 'text-indigo-700 bg-indigo-50/50' : opt.count === 0 ? 'text-text-muted' : 'text-text-secondary'}`}
                        >
                            {labelOf(opt)}
                            {opt.count !== undefined && (
                                <span className={`tabular-nums ${opt.count === 0 ? 'text-text-muted' : 'text-text-secondary'}`}>({opt.count})</span>
                            )}
                            {activeValue === opt.value && <span aria-hidden="true" className="material-symbols-outlined text-xs ml-auto">check</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

/* ── Main FilterBar ── */
const FilterBar: React.FC<FilterBarProps> = ({
    searchValue,
    onSearchChange,
    searchPlaceholder = 'Search...',
    filters,
    activeFilters,
    onFilterChange,
    onClearAll,
}) => {
    const { t } = useTranslation();
    const hasActiveFilters = Object.values(activeFilters).some(v => v !== '') || searchValue !== '';
    const pillLabel = (key: string, value: string) => {
        const choice = filters.find(f => f.key === key)?.options.map(toChoice).find(c => c.value === value);
        return choice?.label ?? statusLabel(t, value);
    };

    return (
        <div className="space-y-2">
            {/* Search + Filters Row */}
            <div className="flex items-center gap-2 flex-wrap">
                {/* Search Input */}
                <div className="relative flex-1 min-w-[180px]">
                    <span aria-hidden="true" className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-lg">search</span>
                    <input
                        type="text"
                        placeholder={searchPlaceholder}
                        value={searchValue}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-xl bg-white border border-border-light text-text-primary placeholder-text-muted text-sm font-medium focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all"
                    />
                    {searchValue && (
                        <button aria-label={t('ui.clear_search')}
                            onClick={() => onSearchChange('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-sm">close</span>
                        </button>
                    )}
                </div>

                {/* Filter Dropdowns */}
                {filters.map(f => (
                    <FilterDropdown
                        key={f.key}
                        filter={f}
                        activeValue={activeFilters[f.key] || ''}
                        onChange={onFilterChange}
                    />
                ))}

                {/* Clear All */}
                {hasActiveFilters && (
                    <button
                        onClick={onClearAll}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-sm">filter_list_off</span>
                        {t('ui.clear')}
                    </button>
                )}
            </div>

            {/* Active Filter Pills Summary */}
            {hasActiveFilters && (
                <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <span aria-hidden="true" className="material-symbols-outlined text-sm text-text-muted">filter_alt</span>
                    <span className="font-medium">{t('ui.active_filters')}</span>
                    {searchValue && (
                        <span className="px-2 py-0.5 bg-surface-secondary rounded-full text-text-secondary font-medium">
                            "{searchValue}"
                        </span>
                    )}
                    {Object.entries(activeFilters)
                        .filter(([, v]) => v !== '')
                        .map(([k, v]) => (
                            <span key={k} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-medium capitalize flex items-center gap-1">
                                {pillLabel(k, v)}
                                <button aria-label={t('ui.remove_filter', { name: k })}
                                    onClick={() => onFilterChange(k, '')}
                                    className="hover:text-red-600 transition-colors"
                                >
                                    <span aria-hidden="true" className="material-symbols-outlined text-xs">close</span>
                                </button>
                            </span>
                        ))}
                </div>
            )}
        </div>
    );
};

export default FilterBar;
