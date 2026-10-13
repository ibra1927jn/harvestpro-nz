/**
 * BlockCard — Level 1 block card for OrchardMap macro view
 */
import React from 'react';
import { OrchardBlock } from '@/types';
import { BlockStats } from '@/hooks/useOrchardMap';
import {
    getBlockStatusColor, getBlockStatusBorder, getBlockTextColor,
    getStatusLabel, getVarietyStyle,
} from '@/utils/orchardMapUtils';
import { useTranslation } from '@/i18n';

interface BlockCardProps {
    block: OrchardBlock;
    stats: BlockStats;
    varieties: string[];
    index: number;
    onClick: () => void;
}

const BLOCK_STATUS_KEY: Record<string, string> = {
    idle: 'orchardMap.status.idle',
    active: 'orchardMap.status.in_progress',
    complete: 'orchardMap.status.complete',
    alert: 'orchardMap.status.alert',
};

const BlockCard: React.FC<BlockCardProps> = ({ block, stats, varieties, index, onClick }) => {
    const statusInfo = getStatusLabel(block.status);
    const textColor = getBlockTextColor(block.status);
    const { t } = useTranslation();
    const statusLabel = t(BLOCK_STATUS_KEY[block.status] ?? 'orchardMap.status.idle');

    // Construir título localizado: "Block A — Royal Gala" → "Bloque A — Royal Gala" en ES
    // Solo aplica si el nombre contiene " — " como separador (datos reales del mock/DB)
    const blockDisplayName = (() => {
        const parts = block.name.split(' — ');
        if (parts.length < 2) return block.name; // sin separador → mostrar tal cual
        const rawLabel = parts[0]; // "Block A"
        const variety = parts[1];  // "Royal Gala"
        const letterMatch = rawLabel.match(/\s([A-Z])$/i);
        if (!letterMatch) return block.name;
        return t('orchardMap.blockTitle')
            .replace('{letter}', letterMatch[1].toUpperCase())
            .replace('{variety}', variety);
    })();

    return (
        <button
            onClick={onClick}
            className={`
                relative rounded-2xl p-6 text-left
                transition-all duration-300 ease-out
                animate-slide-up anim-delay
                hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] cursor-pointer shadow-md
                focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2
                min-h-[120px] block-card-dynamic
            `}
            style={{
                '--block-bg': getBlockStatusColor(block.status),
                '--block-border': getBlockStatusBorder(block.status),
                '--block-text': textColor,
                '--delay': `${index * 0.08}s`,
            } as React.CSSProperties}
        >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
                <div>
                    <h3 className="text-xl font-black dynamic-text-color">{blockDisplayName}</h3>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {varieties.map(v => {
                            const vs = getVarietyStyle(v);
                            return (
                                <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold variety-badge" style={{ '--variety-bg': vs.bg, '--variety-text': vs.text, '--variety-dot': vs.dot } as React.CSSProperties}>
                                    <span className="w-1.5 h-1.5 rounded-full variety-dot" />
                                    {v}
                                </span>
                            );
                        })}
                    </div>
                </div>
                <div className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0
                    ${block.status === 'active' ? 'bg-amber-100 text-amber-800' : ''}
                    ${block.status === 'idle' ? 'bg-slate-100 text-slate-600' : ''}
                    ${block.status === 'complete' ? 'bg-white/20 text-white' : ''}
                    ${block.status === 'alert' ? 'bg-white/20 text-white animate-breathe' : ''}
                `}>
                    <span aria-hidden="true" className="material-symbols-outlined text-sm">{statusInfo.icon}</span>
                    {statusLabel}
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
                {[
                    { value: block.totalRows, label: t('orchardMap.block.rows') },
                    { value: stats.activePickers, label: t('orchardMap.block.pickers') },
                    { value: `🍒 ${stats.buckets}`, label: t('orchardMap.block.buckets') },
                ].map(stat => (
                    <div key={stat.label} className="bg-white/30 backdrop-blur-sm rounded-xl px-3 py-2 text-center">
                        <div className="text-lg font-black dynamic-text-color">{stat.value}</div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider dynamic-text-color opacity-70">{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* Progress bar */}
            <div className="mt-4">
                <div className="flex justify-between text-[10px] font-bold mb-1 dynamic-text-color opacity-80">
                    <span>{t('orchardMap.block.progress')}</span>
                    <span>{t('orchardMap.block.rows_of').replace('{completed}', String(stats.completedRows)).replace('{total}', String(block.totalRows))}</span>
                </div>
                <div className="h-2 rounded-full bg-black/10 overflow-hidden">
                    <div
                        className="h-full rounded-full bg-white/60 animate-progress dynamic-width"
                        style={{ '--w': `${Math.round(stats.progress * 100)}%` } as React.CSSProperties}
                    />
                </div>
            </div>

            {/* Drill-in hint */}
            <div className="mt-3 flex items-center justify-end gap-1 text-xs font-semibold dynamic-text-color opacity-60">
                <span>{t('orchardMap.block.view_rows')}</span>
                <span aria-hidden="true" className="material-symbols-outlined text-sm">chevron_right</span>
            </div>
        </button>
    );
};

export default BlockCard;
