/**
 * RowHistory — recorrido de filas de cada equipo: «1 → 4 → 6 → ahora 10».
 * Manager: todos los equipos. Team leader: solo el suyo (teamLeaderId).
 */
import React, { useState } from 'react';
import { useRowHistory, type RowHistoryPeriod } from '@/hooks/useRowHistory';
import type { RowVisit } from '@/types';

const NZ = 'Pacific/Auckland';
const time = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-NZ', { timeZone: NZ, hour: '2-digit', minute: '2-digit', hour12: false });
const day = (iso: string) =>
    new Date(iso).toLocaleDateString('en-NZ', { timeZone: NZ, weekday: 'short', day: 'numeric' });

function VisitChip({ v, showDay }: { v: RowVisit; showDay: boolean }) {
    const now = v.status === 'active';
    return (
        <span
            data-testid="row-visit"
            className={`inline-flex flex-col rounded-lg border px-2.5 py-1 text-xs ${now
                ? 'border-primary bg-primary/10 text-primary font-bold'
                : 'border-border-light bg-white text-text-main'}`}
            title={v.status === 'completed' ? 'Row finished' : undefined}
        >
            <span>
                Row {v.row_number}{v.side === 'south' ? ' S' : ''}
                {v.status === 'completed' && ' ✓'}
                {now && ' · now'}
            </span>
            <span className="text-[10px] font-normal text-text-muted">
                {showDay && `${day(v.assigned_at)} `}
                {time(v.assigned_at)}–{v.ended_at ? time(v.ended_at) : ''}
            </span>
        </span>
    );
}

interface RowHistoryProps {
    /** Solo este equipo (vista del team leader) */
    teamLeaderId?: string;
    title?: string;
}

export default function RowHistory({ teamLeaderId, title = 'Row history' }: RowHistoryProps) {
    const [period, setPeriod] = useState<RowHistoryPeriod>('today');
    const { teams, loading, error } = useRowHistory(period, teamLeaderId);

    return (
        <section className="rounded-2xl border border-border-light bg-white p-4" data-testid="row-history">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-black text-text-main">
                    <span className="material-symbols-outlined text-base">route</span>
                    {title}
                </h3>
                <div className="flex gap-1 text-xs">
                    {(['today', 'week'] as const).map(p => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`rounded-lg px-2.5 py-1 font-bold ${period === p ? 'bg-primary text-white' : 'bg-slate-100 text-text-muted'}`}
                        >
                            {p === 'today' ? 'Today' : 'This week'}
                        </button>
                    ))}
                </div>
            </div>

            {error && <p className="text-xs text-amber-700">{error}</p>}
            {!error && !loading && teams.length === 0 && (
                <p className="text-xs text-text-muted">No rows assigned {period === 'today' ? 'today' : 'this week'}.</p>
            )}

            <div className="space-y-3">
                {teams.map(t => (
                    <div key={t.teamLeaderId ?? 'none'}>
                        {!teamLeaderId && (
                            <p className="mb-1 text-xs font-bold text-text-secondary">{t.teamName}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5">
                            {t.visits.map((v, i) => (
                                <React.Fragment key={v.id}>
                                    {i > 0 && <span className="text-text-muted">→</span>}
                                    <VisitChip v={v} showDay={period === 'week'} />
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
