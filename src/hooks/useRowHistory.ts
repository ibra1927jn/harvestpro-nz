/**
 * Historial de filas: por qué filas pasó cada equipo (hoy o esta semana).
 * Se refresca solo cuando cambian las filas activas (tiempo real).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { rowRepository } from '@/repositories/row.repository';
import { nzMidnight, startOfWeekNZ, todayNZST } from '@/utils/nzst';
import { logger } from '@/utils/logger';
import type { RowVisit } from '@/types';
import { useTranslation } from '@/i18n';

export type RowHistoryPeriod = 'today' | 'week';

export interface TeamRowHistory {
    teamLeaderId: string | null;
    teamName: string;
    visits: RowVisit[];
}

/** Agrupa las visitas por equipo, en orden de llegada */
export function groupByTeam(
    visits: RowVisit[],
    nameOf: (teamLeaderId: string | null) => string
): TeamRowHistory[] {
    const map = new Map<string, TeamRowHistory>();
    for (const v of visits) {
        const key = v.team_leader_id ?? 'none';
        if (!map.has(key)) map.set(key, { teamLeaderId: v.team_leader_id, teamName: nameOf(v.team_leader_id), visits: [] });
        map.get(key)!.visits.push(v);
    }
    const teams = [...map.values()];
    for (const t of teams) t.visits.sort((a, b) => a.assigned_at.localeCompare(b.assigned_at));
    return teams.sort((a, b) => a.teamName.localeCompare(b.teamName));
}

export function useRowHistory(period: RowHistoryPeriod, teamLeaderId?: string) {
    const orchardId = useHarvestStore(s => s.orchard?.id);
    const crew = useHarvestStore(s => s.crew);
    // Cambia cuando se asigna/mueve una fila (llega por tiempo real)
    const activeKey = useHarvestStore(s => s.rowAssignments.map(r => r.id).join(','));
    const [visits, setVisits] = useState<RowVisit[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { t } = useTranslation();
    const load = useCallback(async () => {
        if (!orchardId) return;
        setLoading(true);
        setError(null);
        try {
            const since = period === 'today' ? nzMidnight(todayNZST()) : nzMidnight(startOfWeekNZ());
            setVisits(await rowRepository.getHistory(orchardId, since, teamLeaderId));
        } catch (e) {
            logger.warn('[RowHistory] Could not load:', e);
            setError(t('rowHistory.offline'));
        } finally {
            setLoading(false);
        }
    }, [orchardId, period, teamLeaderId, t]);

    useEffect(() => { void load(); }, [load, activeKey]);

    const teams = useMemo(() => {
        const nameOf = (id: string | null) =>
            id ? (crew.find(p => p.id === id)?.name ?? 'Team') : 'No team leader';
        return groupByTeam(visits, nameOf);
    }, [visits, crew]);

    return { teams, loading, error, reload: load };
}
