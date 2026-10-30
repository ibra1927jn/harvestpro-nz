/** Estado de hoy de una persona: fichado / en descanso / salió / de permiso / sin fichar */
import React from 'react';
import type { Presence } from '@/services/presence';
import { useTranslation } from '@/i18n';

const STYLE: Record<Presence, { cls: string; icon: string }> = {
    on_shift: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: 'login' },
    on_break: { cls: 'bg-sky-50 text-sky-700 border-sky-200', icon: 'coffee' },
    left: { cls: 'bg-slate-100 text-slate-600 border-slate-200', icon: 'logout' },
    on_leave: { cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'event_busy' },
    not_in: { cls: 'bg-white text-slate-400 border-slate-200', icon: 'schedule' },
};

export const PresenceBadge: React.FC<{ presence: Presence; leaveTypeLabel?: string; testId?: string }> = ({ presence, leaveTypeLabel, testId }) => {
    const { t } = useTranslation();
    const s = STYLE[presence];
    const label = presence === 'on_leave' && leaveTypeLabel
        ? t('comms.on_leave_type', { type: leaveTypeLabel })
        : t(`comms.presence.${presence}`);
    return (
        <span data-testid={testId} data-presence={presence} className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide border px-1.5 py-0.5 rounded ${s.cls}`}>
            <span aria-hidden="true" className="material-symbols-outlined text-[11px]">{s.icon}</span>
            {label}
        </span>
    );
};

export default PresenceBadge;
