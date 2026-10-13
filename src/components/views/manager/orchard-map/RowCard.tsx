/**
 * RowCard — Level 2 row card for OrchardMap micro view
 * Includes picker avatars with North/South side split.
 */
import React from 'react';
import { Picker, RowAssignment } from '@/types';
import { RowData } from '@/hooks/useOrchardMap';
import { getRowGradient, getVarietyStyle, AVATAR_COLORS } from '@/utils/orchardMapUtils';
import { useTranslation, translate as t } from '@/i18n';



interface RowCardProps {
    rd: RowData;
    index: number;
    rowAssignments: RowAssignment[];
    onRowClick?: (rowNum: number) => void;
    isDimmed?: boolean;
}

/* ── Avatar renderer ─────────────────────── */
function renderAvatar(p: Picker, pi: number) {
    const initials = p.name.split(' ').map(n => n[0]).join('').slice(0, 2);
    const isTeamLead = p.role === 'team_leader';
    const isRunner = p.role === 'runner' || p.role === 'bucket_runner';

    if (isTeamLead) {
        return (
            <div key={p.id} className="w-6 h-6 rounded-full flex items-center justify-center text-[7px] font-bold text-white bg-slate-800 ring-2 ring-amber-400 shadow-sm" title={`${p.name} (${t('roles.team_leader')})`}>
                {initials}
            </div>
        );
    }
    if (isRunner) {
        return (
            <div key={p.id} className="w-6 h-6 rounded-full flex items-center justify-center text-[7px] font-bold text-white bg-blue-500 ring-2 ring-white/80 shadow-sm" title={`${p.name} (${t('roles.runner')})`}>
                {initials}
            </div>
        );
    }
    return (
        <div key={p.id} className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold text-white ring-1 ring-white/60 avatar-bg" style={{ '--avatar-bg': AVATAR_COLORS[pi % AVATAR_COLORS.length] } as React.CSSProperties} title={p.name}>
            {initials}
        </div>
    );
}

const RowCard: React.FC<RowCardProps> = ({ rd, index, rowAssignments, onRowClick, isDimmed = false }) => {
    const isComplete = rd.progress >= 1;
    const hasActivePickers = rd.pickers.length > 0;
    const vs = getVarietyStyle(rd.variety);
    const { t } = useTranslation();

    return (
        <button
            onClick={() => onRowClick?.(rd.rowNum)}
            disabled={isDimmed}
            className={`
                relative rounded-xl p-3 text-left
                transition-all duration-300 ease-out
                animate-slide-up row-card-bg anim-delay
                focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-1
                shadow-sm hover:scale-[1.04] hover:shadow-lg active:scale-[0.98]
                ${isComplete ? 'ring-1 ring-emerald-300' : ''}
            `}
            style={{
                '--row-bg': getRowGradient(rd.progress),
                '--row-border': isComplete ? '#10b981' : hasActivePickers ? '#fbbf24' : '#e2e8f0',
                '--delay': `${index * 0.03}s`,
                minHeight: '80px',
            } as React.CSSProperties}
        >
            {/* Row header */}
            <div className="flex items-center justify-between mb-1">
                <span className={`text-sm font-black ${rd.progress > 0.5 ? 'text-white' : 'text-text-main'}`}>R{rd.rowNum}</span>
                <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-bold variety-badge" style={{ '--variety-bg': vs.bg, '--variety-text': vs.text, '--variety-dot': vs.dot } as React.CSSProperties} title={rd.variety}>
                        <span className="w-1.5 h-1.5 rounded-full variety-dot" />
                        {rd.variety}
                    </span>
                    {isComplete && <span className="text-xs" title={t('orchardMap.status.complete')}>✅</span>}
                    {hasActivePickers && !isComplete && <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-breathe" />}
                </div>
            </div>

            {/* Bucket count */}
            <div className={`text-xs font-semibold tabular-nums ${rd.progress > 0.5 ? 'text-white/80' : 'text-text-sub'}`}>
                🍒 {rd.buckets}/{rd.rowTarget}
            </div>
            {/* Bins per hour rate */}
            <div className={`text-[10px] tabular-nums mt-0.5 ${rd.progress > 0.5 ? 'text-white/60' : 'text-text-muted'}`}>
                {rd.binsPerHour !== null ? `${rd.binsPerHour}/hr` : '—'}
            </div>

            {/* Progress bar */}
            <div className="mt-2 h-1.5 rounded-full bg-black/10 overflow-hidden">
                <div
                    className={`h-full rounded-full animate-progress dynamic-width ${rd.progress >= 1 ? 'progress-gradient-complete' : rd.progress > 0.5 ? 'progress-gradient-mid' : 'progress-gradient-low'}`}
                    style={{ '--w': `${Math.round(rd.progress * 100)}%` } as React.CSSProperties}
                />
            </div>

            {/* Picker avatars */}
            {rd.pickers.length > 0 && <PickerAvatars pickers={rd.pickers} rowNum={rd.rowNum} rowAssignments={rowAssignments} />}

            {/* Assign hint for empty rows */}
            {rd.pickers.length === 0 && rd.buckets === 0 && (
                <div className="mt-2 text-[9px] text-text-muted italic">{t('orchardMap.row.tap_to_assign')}</div>
            )}
        </button>
    );
};

/* ── Picker Avatars with North/South split ── */
const PickerAvatars: React.FC<{
    pickers: Picker[];
    rowNum: number;
    rowAssignments: RowAssignment[];
}> = ({ pickers, rowNum, rowAssignments }) => {
    const rowRA = rowAssignments.filter(ra => ra.row_number === rowNum);
    const northIds = new Set<string>();
    const southIds = new Set<string>();
    rowRA.forEach(ra => {
        ra.assigned_pickers.forEach(pid => {
            if (ra.side === 'north') northIds.add(pid);
            else southIds.add(pid);
        });
    });
    const northPickers = pickers.filter(p => northIds.has(p.id));
    const southPickers = pickers.filter(p => southIds.has(p.id));
    const unassigned = pickers.filter(p => !northIds.has(p.id) && !southIds.has(p.id));
    const hasBothSides = northPickers.length > 0 && southPickers.length > 0;

    return (
        <div className={`flex items-center mt-2 ${hasBothSides ? 'justify-between' : ''}`}>
            {northPickers.length > 0 && (
                <div className="flex items-center gap-0.5">
                    {hasBothSides && <span className="text-[7px] font-bold text-slate-400 mr-0.5">N</span>}
                    <div className="flex -space-x-1.5">
                        {northPickers.slice(0, 3).map((p, pi) => renderAvatar(p, pi))}
                    </div>
                </div>
            )}
            {southPickers.length > 0 && (
                <div className="flex items-center gap-0.5">
                    <div className="flex -space-x-1.5">
                        {southPickers.slice(0, 3).map((p, pi) => renderAvatar(p, pi + 4))}
                    </div>
                    {hasBothSides && <span className="text-[7px] font-bold text-slate-400 ml-0.5">S</span>}
                </div>
            )}
            {unassigned.length > 0 && northPickers.length === 0 && southPickers.length === 0 && (
                <div className="flex -space-x-1.5">
                    {unassigned.slice(0, 4).map((p, pi) => renderAvatar(p, pi))}
                </div>
            )}
            {pickers.length > 6 && (
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold bg-slate-500 text-white ring-1 ring-white/60">
                    +{pickers.length - 6}
                </div>
            )}
        </div>
    );
};

export default RowCard;
