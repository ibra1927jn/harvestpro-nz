/**
 * Campos propios de SettingsView (movidos sin cambios de marcado desde SettingsView.tsx).
 */
import React from 'react';
import { useTranslation } from '@/i18n';
import { clampToFloor, fillMinWarning } from './settingsLogic';

/** Campo sólo-lectura con candado para valores protegidos por rol */
export const LockedField: React.FC<{ label: string; value: string; tooltip: string }> = ({ label, value, tooltip }) => (
    <div className="flex items-center justify-between py-1">
        <span className="text-sm font-medium text-text-sub flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-amber-500">lock</span>
            {label}
        </span>
        <span title={tooltip} className="text-sm text-text-muted font-medium bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-help">
            {value}
            <span className="material-symbols-outlined text-[13px] text-amber-400">info</span>
        </span>
    </div>
);

interface ComplianceTargetFieldProps {
    value: number;
    floor: number;
    minWage: number;
    pieceRate: number;
    onChange: (v: number) => void;
}

/** Target Buckets/Hour con floor de compliance auto-calculado */
export const ComplianceTargetField: React.FC<ComplianceTargetFieldProps> = ({ value, floor, minWage, pieceRate, onChange }) => {
    const { t } = useTranslation();
    const isAtFloor = value <= floor;
    return (
        <div className="py-1 space-y-1.5">
            <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-text-sub">{t('settings.harvest.target_buckets')}</label>
                <input
                    type="number"
                    value={value}
                    min={floor}
                    step="1"
                    title="Target Buckets / Hour"
                    aria-label="Target Buckets / Hour"
                    onChange={(e) => onChange(clampToFloor(e.target.value, floor))}
                    className="w-24 text-right bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-text-main font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                />
            </div>
            <p className={`text-[11px] font-medium flex items-center gap-1 ${isAtFloor ? 'text-amber-600' : 'text-emerald-600'}`}>
                <span className="material-symbols-outlined text-sm">{isAtFloor ? 'warning' : 'check_circle'}</span>
                {/* Fórmula visible: ceil(minWage / pieceRate) */}
                {fillMinWarning(t('settings.harvest.min_warning'), minWage, pieceRate, floor)}
                {!isAtFloor && <span className="text-text-muted ml-1">(override: {value})</span>}
            </p>
        </div>
    );
};

interface OrchardOption { id: string; name: string; total_rows?: number; varieties?: string }

interface OrchardSelectorProps {
    orchards: OrchardOption[];
    selectedId: string;
    onSelect: (id: string) => void;
}

/** Selector de huerto que auto-rellena Total Rows y Variety desde la DB */
export const OrchardSelector: React.FC<OrchardSelectorProps> = ({ orchards, selectedId, onSelect }) => (
    <div className="flex items-center justify-between py-1">
        <span className="text-sm font-medium text-text-sub flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-text-muted">location_on</span>
            {/* OrchardSelector is rendered inside SettingsView which has translation context */}
            Orchard
        </span>
        {orchards.length > 1 ? (
            <select
                value={selectedId}
                onChange={(e) => onSelect(e.target.value)}
                title="Select orchard"
                aria-label="Select orchard"
                className="max-w-[160px] text-right bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-text-main font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all truncate"
            >
                {orchards.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                ))}
            </select>
        ) : (
            <span className="text-sm text-text-muted font-medium bg-slate-50 px-3 py-1.5 rounded-lg">
                {orchards[0]?.name ?? '—'}
            </span>
        )}
    </div>
);
