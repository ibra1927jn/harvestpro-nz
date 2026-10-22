/**
 * Precio por cubeta de HOY para enseñar en pantalla (TL, runner, perfil del
 * picker): el de la variedad de la fila si se conoce, si no el general de hoy
 * del huerto. Los precios de hoy vienen con los ajustes (settings.piece_rates,
 * con realtime desde storeSync), así un cambio del manager se ve sin recargar.
 */
import { useMemo } from 'react';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { pieceRateOn, nzDateOf } from '@/services/harvestMetrics/pay';
import type { HarvestSettings, OrchardBlock, RowAssignment } from '@/types';

/** Variedad de una fila del huerto (block_rows), o null si no se conoce */
export function varietyOfRow(blocks: ReadonlyArray<Pick<OrchardBlock, 'rowVarieties'>>, rowNumber: number | null | undefined): string | null {
    if (rowNumber == null) return null;
    for (const b of blocks) {
        const v = b.rowVarieties?.[rowNumber]?.trim();
        if (v && v !== 'Desconocida' && v !== 'Unknown') return v;
    }
    return null;
}

/** Fila donde trabaja hoy el equipo de un team leader (la última asignada) */
export function rowOfTeam(assignments: ReadonlyArray<RowAssignment> | null | undefined, teamLeaderId: string | null | undefined): number | null {
    if (!teamLeaderId || !assignments) return null;
    const own = assignments.filter(a => a.team_leader_id === teamLeaderId);
    return own.length > 0 ? own[own.length - 1].row_number : null;
}

/** Precio de hoy de una variedad (null = general) con los ajustes del store */
export function todayPieceRate(
    settings: Pick<HarvestSettings, 'piece_rate' | 'piece_rates'> | null | undefined,
    orchardId: string | null | undefined,
    variety: string | null,
    now: Date = new Date(),
): number {
    const fallback = settings?.piece_rate || 6.5;
    return pieceRateOn(settings?.piece_rates ?? [], orchardId, variety, nzDateOf(now), fallback);
}

/**
 * Precio de hoy de la fila (si se pasa y se conoce su variedad) o el general.
 * Devuelve también la variedad usada (null = precio general).
 */
export function useTodayPieceRate(rowNumber?: number | null): { rate: number; variety: string | null } {
    const settings = useHarvestStore(s => s.settings);
    const orchardId = useHarvestStore(s => s.orchard?.id);
    const blocks = useHarvestStore(s => s.orchardBlocks);
    return useMemo(() => {
        const variety = varietyOfRow(blocks ?? [], rowNumber);
        return { rate: todayPieceRate(settings, orchardId, variety), variety };
    }, [settings, orchardId, blocks, rowNumber]);
}
