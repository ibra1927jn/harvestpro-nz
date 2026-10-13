/**
 * TabGroup — Lightweight tab switcher with animated underline
 * 
 * Replaces manual tab implementations across views.
 */
import React from 'react';
import { cn } from '@/utils/cn';

export interface Tab {
    /** Unique key */
    key: string;
    /** Display label */
    label: string;
    /** Optional Material Symbols icon */
    icon?: string;
    /** Optional badge count */
    badge?: number;
}

interface TabGroupProps {
    /** Tab definitions */
    tabs: Tab[];
    /** Currently active tab key */
    activeTab: string;
    /** Tab change handler */
    onChange: (key: string) => void;
    /** Visual variant */
    variant?: 'underline' | 'pill';
    /** Size */
    size?: 'sm' | 'md';
    /** Full width (stretch to fill container) */
    fullWidth?: boolean;
    /** Extra wrapper classes */
    className?: string;
}

const TabGroup: React.FC<TabGroupProps> = ({
    tabs,
    activeTab,
    onChange,
    variant = 'underline',
    size = 'md',
    fullWidth = false,
    className,
}) => {
    const isUnderline = variant === 'underline';

    return (
        <div
            className={cn(
                'flex',
                isUnderline ? 'border-b border-slate-200 gap-1' : 'bg-slate-100 rounded-lg p-1 gap-0.5',
                fullWidth && 'w-full',
                className,
            )}
            role="tablist"
        >
            {tabs.map((tab) => {
                const isActive = tab.key === activeTab;
                return (
                    <button
                        key={tab.key}
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => onChange(tab.key)}
                        className={cn(
                            'inline-flex items-center justify-center gap-1.5 font-medium transition-all duration-200',
                            fullWidth && 'flex-1',
                            // Size
                            size === 'sm' ? 'text-xs px-3 py-1.5' : 'text-sm px-4 py-2',
                            // Variant styles
                            isUnderline
                                ? cn(
                                    '-mb-px border-b-2',
                                    isActive
                                        ? 'border-indigo-600 text-indigo-600'
                                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
                                )
                                : cn(
                                    'rounded-md',
                                    isActive
                                        ? 'bg-white text-slate-900 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700',
                                ),
                        )}
                    >
                        {tab.icon && (
                            <span aria-hidden="true" className={cn(
                                'material-symbols-outlined',
                                size === 'sm' ? 'text-sm' : 'text-base',
                            )}>{tab.icon}</span>
                        )}
                        {tab.label}
                        {tab.badge !== undefined && tab.badge > 0 && (
                            <span className={cn(
                                'inline-flex items-center justify-center rounded-full font-bold min-w-[18px] h-[18px] px-1',
                                isActive
                                    ? 'bg-indigo-100 text-indigo-700'
                                    : 'bg-slate-200 text-slate-600',
                                'text-[10px]',
                            )}>
                                {tab.badge > 99 ? '99+' : tab.badge}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};

export default React.memo(TabGroup);
