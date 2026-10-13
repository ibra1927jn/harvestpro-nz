/**
 * RowHistory — recorrido de filas de cada equipo: «1 → 4 → 6 → ahora 10».
 * Manager: todos los equipos. Team leader: solo el suyo (teamLeaderId).
 */
import React, { useState } from 'react';
import { useRowHistory, type RowHistoryPeriod } from '@/hooks/useRowHistory';
import type { RowVisit } from '@/types';
import { useTranslation } from '@/i18n';
import { formatNZTime, NZ_LOCALE, NZ_TZ } from '@/utils/nzFormat';

const time = (iso: string) => formatNZTime(iso);
const day = (iso: string) =>
    new Date(iso).toLocaleDateString(NZ_LOCALE, { timeZone: NZ_TZ, weekday: 'short', day: 'numeric' });

function VisitChip({ v, showDay }: { v: RowVisit; showDay: boolean }) {
    const { t } = useTranslation();
    const now = v.status === 'active';
    return (
        <span
            data-testid="row-visit"
            className={`inline-flex flex-col rounded-lg border px-2.5 py-1 text-xs ${now
                ? 'border-primary bg-primary/10 text-primary font-bold'
                : 'border-border-light bg-white text-text-main'}`}
            title={v.status === 'completed' ? t('rowHistory.finished') : undefined}
        >
            <span>
                {t('runner.row_n', { n: v.row_number })}{v.side === 'south' ? ' S' : ''}
                {v.status === 'completed' && ' ✓'}
                {now && ` · ${t('rowHistory.now')}`}
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

export default function RowHistory({ teamLeaderId, title }: RowHistoryProps) {
    const { t } = useTranslation();
    const [period, setPeriod] = useState<RowHistoryPeriod>('today');
    const { teams, loading, error } = useRowHistory(period, teamLeaderId);

    return (
        <section className="rounded-2xl border border-border-light bg-white p-4" data-testid="row-history">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-black text-text-main">
                    <span aria-hidden="true" className="material-symbols-outlined text-base">route</span>
                    {title ?? t('rowHistory.title')}
                </h3>
                <div className="flex gap-1 text-xs">
                    {(['today', 'week'] as const).map(p => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`rounded-lg px-2.5 py-1 font-bold ${period === p ? 'bg-primary text-white' : 'bg-slate-100 text-text-muted'}`}
                        >
                            {p === 'today' ? t('common.today') : t('rowHistory.this_week')}
                        </button>
                    ))}
                </div>
            </div>

            {error && <p className="text-xs text-amber-700">{error}</p>}
            {!error && !loading && teams.length === 0 && (
                <p className="text-xs text-text-muted">{period === 'today' ? t('rowHistory.none_today') : t('rowHistory.none_week')}</p>
            )}

            <div className="space-y-3">
                {teams.map(team => (
                    <div key={team.teamLeaderId ?? 'none'}>
                        {!teamLeaderId && (
                            <p className="mb-1 text-xs font-bold text-text-secondary">{team.teamName}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5">
                            {team.visits.map((v, i) => (
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
