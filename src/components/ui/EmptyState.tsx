/**
 * EmptyState — Reusable empty state placeholder
 * Shows icon, title, subtitle, and optional action button
 * Used when lists/tables have zero items to display
 */
import React from 'react';

interface EmptyStateProps {
    /** Material Symbols icon name */
    icon: string;
    /** Primary heading */
    title: string;
    /** Secondary description text */
    subtitle?: string;
    /** Optional action button */
    action?: {
        label: string;
        onClick: () => void;
        icon?: string;
    };
    /** Icon color class (default: text-text-muted) */
    iconColor?: string;
    /** Compact mode for inline/tab usage */
    compact?: boolean;
}

const EmptyState: React.FC<EmptyStateProps> = ({
    icon,
    title,
    subtitle,
    action,
    iconColor = 'text-text-disabled',
    compact = false,
}) => (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8 px-4' : 'py-16 px-6'}`}>
        {/* Icon container with subtle background */}
        <div className={`rounded-full bg-surface-secondary flex items-center justify-center mb-4 ${compact ? 'w-14 h-14' : 'w-20 h-20'}`}>
            <span aria-hidden="true" className={`material-symbols-outlined ${iconColor} ${compact ? 'text-2xl' : 'text-4xl'}`}>
                {icon}
            </span>
        </div>

        {/* Title */}
        <h3 className={`font-semibold text-text-primary mb-1 ${compact ? 'text-sm' : 'text-base'}`}>
            {title}
        </h3>

        {/* Subtitle */}
        {subtitle && (
            <p className={`text-text-muted max-w-xs ${compact ? 'text-xs' : 'text-sm'}`}>
                {subtitle}
            </p>
        )}

        {/* Optional CTA button */}
        {action && (
            <button
                onClick={action.onClick}
                className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-50 text-indigo-600 font-medium text-sm hover:bg-indigo-100 transition-colors active:scale-95"
            >
                {action.icon && (
                    <span aria-hidden="true" className="material-symbols-outlined text-base">{action.icon}</span>
                )}
                {action.label}
            </button>
        )}
    </div>
);

export default EmptyState;
