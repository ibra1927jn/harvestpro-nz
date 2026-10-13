/**
 * DatePicker — Styled native date input with label and validation support.
 *
 * Uses the native HTML date input for maximum compatibility on mobile/PWA,
 * wrapped with consistent HarvestPro styling.
 */
import React from 'react';

export interface DatePickerProps {
    id: string;
    label?: string;
    value: string;               // YYYY-MM-DD format
    onChange: (value: string) => void;
    min?: string;                // YYYY-MM-DD
    max?: string;                // YYYY-MM-DD
    error?: string;
    disabled?: boolean;
    required?: boolean;
    className?: string;
    helperText?: string;
}

const DatePicker: React.FC<DatePickerProps> = ({
    id,
    label,
    value,
    onChange,
    min,
    max,
    error,
    disabled = false,
    required = false,
    className = '',
    helperText,
}) => {
    return (
        <div className={`flex flex-col gap-1 ${className}`}>
            {label && (
                <label
                    htmlFor={id}
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                    {label}
                    {required && <span className="text-red-500 ml-0.5">*</span>}
                </label>
            )}
            <div className="relative">
                <input
                    id={id}
                    type="date"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    min={min}
                    max={max}
                    disabled={disabled}
                    required={required}
                    className={`
                        w-full px-3 py-2.5 rounded-xl text-sm
                        bg-white dark:bg-slate-800
                        border transition-all duration-200
                        ${error
                            ? 'border-red-400 focus:ring-2 focus:ring-red-200'
                            : 'border-slate-200 dark:border-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900'
                        }
                        ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-900' : ''}
                        text-slate-900 dark:text-slate-100
                        placeholder-slate-400 dark:placeholder-slate-500
                    `}
                />
                <span aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none material-symbols-outlined text-lg">
                    calendar_today
                </span>
            </div>
            {error && (
                <p className="text-xs text-red-500 mt-0.5 flex items-center gap-1">
                    <span aria-hidden="true" className="material-symbols-outlined text-xs">error</span>
                    {error}
                </p>
            )}
            {helperText && !error && (
                <p className="text-xs text-slate-400 dark:text-slate-500">{helperText}</p>
            )}
        </div>
    );
};

export default DatePicker;
