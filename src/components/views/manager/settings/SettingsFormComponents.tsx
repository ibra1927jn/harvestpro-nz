/**
 * Settings form sub-components — reusable across settings views
 *   SettingsSection — card wrapper with icon, title, accent
 *   FormField       — labeled input/select with prefix/suffix
 *   ReadonlyField   — display-only labeled value
 *   ToggleRow       — labeled boolean switch
 */
import React, { useState, useEffect } from 'react';
import { parseMoney, formatMoneyInput } from '@/utils/money';
import { useTranslation } from '@/i18n';

/* ── SettingsSection ─────────────────────── */

interface SettingsSectionProps {
    icon: string;
    iconBg: string;
    iconColor: string;
    title: string;
    subtitle?: string;
    accentColor: string;
    stagger: number;
    children: React.ReactNode;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
    icon, iconBg, iconColor, title, subtitle, accentColor, stagger, children,
}) => (
    <section className={`glass-card overflow-hidden border-l-4 ${accentColor} section-enter stagger-${Math.min(stagger, 8)}`}>
        <div className="px-5 py-3.5 border-b border-slate-100">
            <div className="flex items-center gap-3">
                <div className={`${iconBg} p-2 rounded-xl`}>
                    <span aria-hidden="true" className={`material-symbols-outlined text-base ${iconColor}`}>{icon}</span>
                </div>
                <div>
                    <h3 className="text-sm font-bold text-text-main">{title}</h3>
                    {subtitle && <p className="text-[11px] text-text-muted font-medium">{subtitle}</p>}
                </div>
            </div>
        </div>
        <div className="px-5 py-4 space-y-3">
            {children}
        </div>
    </section>
);

/* ── FormField ───────────────────────────── */

interface FormFieldProps {
    label: string;
    value: string | number;
    onChange: (value: string | number) => void;
    type?: 'text' | 'number' | 'select';
    prefix?: string;
    suffix?: string;
    step?: string;
    options?: string[];
}

export const FormField: React.FC<FormFieldProps> = ({
    label, value, onChange, type = 'text', prefix, suffix, step, options,
}) => {
    // Para inputs numéricos: estado local de texto para evitar cursor-jump
    // y garantizar '.' como separador decimal sin importar el locale del navegador.
    const decimals = step?.includes('.') ? (step.split('.')[1]?.length ?? 2) : 0;
    const [localText, setLocalText] = useState<string>(
        type === 'number' ? formatMoneyInput(value as number, decimals) : ''
    );

    // Sincronizar desde el padre sólo cuando la fuente cambia externamente
    useEffect(() => {
        if (type === 'number') {
            const numericLocal = parseMoney(localText);
            if (numericLocal !== (value as number)) {
                setLocalText(formatMoneyInput(value as number, decimals));
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, type]);

    return (
    <div className="flex items-center justify-between py-1">
        <label className="text-sm font-medium text-text-sub">{label}</label>
        <div className="flex items-center gap-1.5">
            {prefix && <span className="text-sm text-text-muted font-medium">{prefix}</span>}
            {type === 'select' && options ? (
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    title={label}
                    aria-label={label}
                    className="w-32 text-right bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-text-main font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                >
                    {options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
            ) : type === 'number' ? (
                /* type="text" + inputMode="decimal" garantiza '.' en todos los locales */
                <input
                    type="text"
                    inputMode="decimal"
                    value={localText}
                    title={label}
                    aria-label={label}
                    onChange={(e) => {
                        const raw = e.target.value.replace(',', '.');
                        setLocalText(raw);
                        const parsed = parseMoney(raw);
                        if (!isNaN(parsed)) onChange(parsed);
                    }}
                    onBlur={() => {
                        // Al salir, formatear a decimales canónicos
                        const parsed = parseMoney(localText);
                        const formatted = formatMoneyInput(isNaN(parsed) ? 0 : parsed, decimals);
                        setLocalText(formatted);
                        onChange(isNaN(parsed) ? 0 : parsed);
                    }}
                    className="w-24 text-right bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-text-main font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                />
            ) : (
                <input
                    type={type}
                    value={value}
                    step={step}
                    title={label}
                    aria-label={label}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-24 text-right bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-text-main font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                />
            )}
            {suffix && <span className="text-xs text-text-muted font-medium">{suffix}</span>}
        </div>
    </div>
    );
};

/* ── ReadonlyField ───────────────────────── */

export const ReadonlyField: React.FC<{ label: string; value: string; icon?: string }> = ({ label, value, icon }) => (
    <div className="flex items-center justify-between py-1">
        <span className="text-sm font-medium text-text-sub flex items-center gap-2">
            {icon && <span aria-hidden="true" className="material-symbols-outlined text-sm text-text-muted">{icon}</span>}
            {label}
        </span>
        <span className="text-sm text-text-muted font-medium bg-slate-50 px-3 py-1.5 rounded-lg">{value}</span>
    </div>
);

/* ── ToggleRow ───────────────────────────── */

interface ToggleRowProps {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (value: boolean) => void;
    locked?: boolean;
    icon?: string;
    compact?: boolean;
}

export const ToggleRow: React.FC<ToggleRowProps> = ({ label, description, checked, onChange, locked, icon, compact }) => {
    const { t } = useTranslation();
    return (
    <div className={`flex items-center justify-between ${compact ? '' : 'py-0.5'}`}>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {icon && (
                <span aria-hidden="true" className={`material-symbols-outlined text-sm ${locked ? 'text-text-muted/50' : 'text-text-muted'}`}>
                    {icon}
                </span>
            )}
            <div className="min-w-0">
                <span className={`text-sm font-medium ${locked ? 'text-text-sub/60' : 'text-text-sub'} flex items-center gap-1.5`}>
                    {label}
                    {locked && <span aria-hidden="true" className="material-symbols-outlined text-[11px] text-text-muted/50">lock</span>}
                </span>
                {description && !compact && (
                    <p className="text-[11px] text-text-muted leading-tight mt-0.5">{description}</p>
                )}
            </div>
        </div>
        <button
            onClick={() => !locked && onChange(!checked)}
            aria-label={t('mgr.toggle', { label })}
            role="switch"
            aria-checked={checked ? "true" : "false"}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 flex-shrink-0 ml-3 ${locked ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'} ${checked ? 'bg-green-500 shadow-sm shadow-green-200' : 'bg-slate-200'}`}
        >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-all duration-300 shadow-sm ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
    </div>
);
};
