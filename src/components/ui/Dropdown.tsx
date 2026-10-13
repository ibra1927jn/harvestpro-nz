/**
 * Dropdown — Searchable select menu with keyboard navigation.
 *
 * Replaces native <select> with a styled, accessible dropdown
 * supporting search filtering, custom rendering, and keyboard nav.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from '@/i18n';

export interface DropdownOption {
    value: string;
    label: string;
    icon?: string;          // Material Symbols icon name
    disabled?: boolean;
}

export interface DropdownProps {
    id: string;
    label?: string;
    options: DropdownOption[];
    value: string | null;
    onChange: (value: string) => void;
    placeholder?: string;
    searchable?: boolean;
    error?: string;
    disabled?: boolean;
    required?: boolean;
    className?: string;
}

const Dropdown: React.FC<DropdownProps> = ({
    id,
    label,
    options,
    value,
    onChange,
    placeholder,
    searchable = false,
    error,
    disabled = false,
    required = false,
    className = '',
}) => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [highlightIndex, setHighlightIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const selected = options.find(o => o.value === value);

    const filtered = searchable && search
        ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
        : options;

    // Close on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Focus search on open
    useEffect(() => {
        if (isOpen && searchable && searchRef.current) {
            searchRef.current.focus();
        }
    }, [isOpen, searchable]);

    // Keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                e.preventDefault();
                setIsOpen(true);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightIndex(prev => Math.min(prev + 1, filtered.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightIndex(prev => Math.max(prev - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightIndex >= 0 && filtered[highlightIndex] && !filtered[highlightIndex].disabled) {
                    onChange(filtered[highlightIndex].value);
                    setIsOpen(false);
                    setSearch('');
                }
                break;
            case 'Escape':
                setIsOpen(false);
                setSearch('');
                break;
        }
    }, [isOpen, filtered, highlightIndex, onChange]);

    const handleSelect = (opt: DropdownOption) => {
        if (opt.disabled) return;
        onChange(opt.value);
        setIsOpen(false);
        setSearch('');
    };

    return (
        <div className={`flex flex-col gap-1 ${className}`} ref={containerRef}>
            {label && (
                <label
                    htmlFor={id}
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                    {label}
                    {required && <span className="text-red-500 ml-0.5">*</span>}
                </label>
            )}

            {/* Trigger button */}
            <button
                id={id}
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                className={`
                    w-full px-3 py-2.5 rounded-xl text-sm text-left
                    flex items-center justify-between gap-2
                    bg-white dark:bg-slate-800
                    border transition-all duration-200
                    ${error
                        ? 'border-red-400'
                        : isOpen
                            ? 'border-indigo-500 ring-2 ring-indigo-100 dark:ring-indigo-900'
                            : 'border-slate-200 dark:border-slate-600 hover:border-slate-300'
                    }
                    ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-900' : 'cursor-pointer'}
                `}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
            >
                <span className={selected ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}>
                    {selected ? (
                        <span className="flex items-center gap-2">
                            {selected.icon && (
                                <span aria-hidden="true" className="material-symbols-outlined text-base">{selected.icon}</span>
                            )}
                            {selected.label}
                        </span>
                    ) : (placeholder ?? t('ui.select'))}
                </span>
                <span aria-hidden="true"
                    className={`material-symbols-outlined text-base text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                >
                    expand_more
                </span>
            </button>

            {/* Dropdown menu */}
            {isOpen && (
                <div
                    className="relative z-50 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600
                        rounded-xl shadow-lg max-h-60 overflow-auto animate-scale-in"
                    role="listbox"
                >
                    {/* Search input */}
                    {searchable && (
                        <div className="p-2 border-b border-slate-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800">
                            <input
                                ref={searchRef}
                                type="text"
                                value={search}
                                onChange={e => { setSearch(e.target.value); setHighlightIndex(0); }}
                                onKeyDown={handleKeyDown}
                                placeholder={t('ui.search')}
                                className="w-full px-3 py-1.5 text-sm rounded-lg bg-slate-50 dark:bg-slate-700
                                    border border-slate-200 dark:border-slate-600
                                    text-slate-900 dark:text-slate-100 placeholder-slate-400
                                    focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                    )}

                    {/* Options */}
                    {filtered.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-slate-400 text-center">
                            {t('ui.no_results')}
                        </div>
                    ) : (
                        filtered.map((opt, idx) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => handleSelect(opt)}
                                className={`
                                    w-full px-3 py-2.5 text-sm text-left flex items-center gap-2
                                    transition-colors duration-100
                                    ${opt.value === value ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium' : ''}
                                    ${idx === highlightIndex ? 'bg-slate-100 dark:bg-slate-700' : ''}
                                    ${opt.disabled
                                        ? 'opacity-40 cursor-not-allowed'
                                        : 'hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer'
                                    }
                                    text-slate-700 dark:text-slate-200
                                `}
                                role="option"
                                aria-selected={opt.value === value}
                                disabled={opt.disabled}
                            >
                                {opt.icon && (
                                    <span aria-hidden="true" className="material-symbols-outlined text-base">{opt.icon}</span>
                                )}
                                {opt.label}
                                {opt.value === value && (
                                    <span aria-hidden="true" className="material-symbols-outlined text-base ml-auto text-indigo-500">check</span>
                                )}
                            </button>
                        ))
                    )}
                </div>
            )}

            {error && (
                <p className="text-xs text-red-500 mt-0.5 flex items-center gap-1">
                    <span aria-hidden="true" className="material-symbols-outlined text-xs">error</span>
                    {error}
                </p>
            )}
        </div>
    );
};

export default Dropdown;
