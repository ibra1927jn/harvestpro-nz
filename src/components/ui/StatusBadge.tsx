/**
 * StatusBadge — Semantic status pill with icon
 * 
 * Static class maps (no dynamic interpolation) for Tailwind JIT safety.
 */
import React from 'react';
import { cn } from '@/utils/cn';

type StatusVariant = 'active' | 'inactive' | 'warning' | 'danger' | 'info' | 'success' | 'neutral';

interface StatusBadgeProps {
    /** Status variant */
    status: StatusVariant;
    /** Text label */
    label: string;
    /** Optional Material Symbols icon */
    icon?: string;
    /** Size variant */
    size?: 'sm' | 'md';
    /** Extra classes */
    className?: string;
}

// Static class map — NOT interpolated. Tailwind JIT will find all of these.
const STATUS_STYLES: Record<StatusVariant, string> = {
    active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    inactive: 'bg-slate-50 text-slate-600 ring-slate-500/20',
    neutral: 'bg-slate-50 text-slate-600 ring-slate-500/20',
    warning: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    danger: 'bg-red-50 text-red-700 ring-red-600/20',
    info: 'bg-blue-50 text-blue-700 ring-blue-600/20',
};

const STATUS_DOTS: Record<StatusVariant, string> = {
    active: 'bg-emerald-500',
    success: 'bg-emerald-500',
    inactive: 'bg-slate-400',
    neutral: 'bg-slate-400',
    warning: 'bg-amber-500',
    danger: 'bg-red-500',
    info: 'bg-blue-500',
};

const SIZE_CLASSES = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
};

const StatusBadge: React.FC<StatusBadgeProps> = ({
    status,
    label,
    icon,
    size = 'md',
    className,
}) => (
    <span
        className={cn(
            'inline-flex items-center font-semibold rounded-full ring-1 ring-inset',
            STATUS_STYLES[status],
            SIZE_CLASSES[size],
            className,
        )}
    >
        {icon ? (
            <span aria-hidden="true" className="material-symbols-outlined text-[14px] leading-none">{icon}</span>
        ) : (
            <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_DOTS[status])} />
        )}
        {label}
    </span>
);

export default React.memo(StatusBadge);
