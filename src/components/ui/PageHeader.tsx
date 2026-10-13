/**
 * PageHeader — Shared page header component for manager views.
 * Provides consistent visual hierarchy: icon + title, subtitle, badges, optional action.
 */
import React, { ReactNode } from 'react';

interface Badge {
    label: string;
    icon?: string;
    color?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';
}

interface PageHeaderProps {
    /** Material icon name for the title */
    icon: string;
    /** Page title */
    title: string;
    /** Optional subtitle text */
    subtitle?: string;
    /** Status badges to show below subtitle */
    badges?: Badge[];
    /** Optional action button or content to render on the right */
    action?: ReactNode;
    /** Optional extra content (like tab toggles) to render on the right */
    children?: ReactNode;
}

const BADGE_COLORS: Record<string, string> = {
    indigo: 'text-indigo-700 bg-indigo-50',
    emerald: 'text-emerald-700 bg-emerald-50',
    amber: 'text-amber-700 bg-amber-50',
    rose: 'text-rose-700 bg-rose-50',
    slate: 'text-slate-600 bg-slate-100',
};

const PageHeader: React.FC<PageHeaderProps> = ({ icon, title, subtitle, badges, action, children }) => (
    <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
            <h1 className="text-2xl font-black text-text-main flex items-center gap-2">
                <span aria-hidden="true" className="material-symbols-outlined text-primary text-3xl">{icon}</span>
                {title}
            </h1>
            {subtitle && (
                <p className="text-sm text-text-muted font-medium mt-0.5">{subtitle}</p>
            )}
            {badges && badges.length > 0 && (
                <div className="flex items-center gap-3 mt-2">
                    {badges.map((badge, i) => (
                        <span
                            key={i}
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${BADGE_COLORS[badge.color || 'indigo']}`}
                        >
                            {badge.icon && (
                                <span aria-hidden="true" className="material-symbols-outlined text-sm">{badge.icon}</span>
                            )}
                            {badge.label}
                        </span>
                    ))}
                </div>
            )}
        </div>
        {(action || children) && (
            <div className="flex items-center gap-3">
                {children}
                {action}
            </div>
        )}
    </div>
);

export default React.memo(PageHeader);
