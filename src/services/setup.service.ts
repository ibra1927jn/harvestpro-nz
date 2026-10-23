/**
 * setup.service.ts — Alta de un huerto nuevo (asistente del admin)
 *
 * Una sola llamada a `setup_orchard_atomic` (migración 20261024010000): huerto,
 * ajustes de pago, día de hoy, temporada activa, bloques y filas, todo o nada.
 * Antes, si la función no existía, se insertaba el huerto suelto (sin
 * temporada ni filas): un huerto inservible. Ya no hay ese camino.
 */
import { rpcRepository } from '@/repositories/rpc.repository';
import { logger } from '@/utils/logger';
import { Result, Ok, Err } from '@/types/result';
import { minWageFloorOn } from '@/services/harvestMetrics/pay';
import { todayNZST } from '@/utils/nzst';

// ── Types ──────────────────────────────────────────────────── */
export interface SetupBlock {
    name: string;
    row_from: number;
    row_to: number;
    variety: string;
    target_buckets: number;
}

export interface OrchardSetupData {
    orchard: {
        code: string;
        name: string;
        location: string;
    };
    season: {
        name: string;
        start_date: string;
        end_date: string;
    };
    blocks: SetupBlock[];
    rates: {
        variety: string;
        piece_rate: number;
        start_time: string;
    };
}

interface CreatedOrchard {
    id: string;
    code: string;
    name: string;
    seasonId: string | null;
    blocks: number;
    rows: number;
}

interface SetupRpcResult {
    id: string;
    code: string;
    name: string;
    season_id?: string;
    blocks?: number;
    rows?: number;
}

/** Filas totales de los bloques del asistente */
export function totalSetupRows(blocks: readonly Pick<SetupBlock, 'row_from' | 'row_to'>[]): number {
    return blocks.reduce((n, b) => n + Math.max(0, b.row_to - b.row_from + 1), 0);
}

// ── Service Functions ──────────────────────────────────────── */

/** Crea el huerto completo; devuelve el huerto creado o el error de la base */
export async function createOrchardSetup(data: OrchardSetupData): Promise<Result<CreatedOrchard>> {
    try {
        const blocks = data.blocks.map(b => ({
            name: b.name.trim(),
            row_from: b.row_from,
            row_to: b.row_to,
            variety: b.variety.trim() || data.rates.variety.trim() || null,
            target_buckets: b.target_buckets,
        }));
        const { data: rpcResult, error } = await rpcRepository.call<SetupRpcResult>('setup_orchard_atomic', {
            p_code: data.orchard.code,
            p_name: data.orchard.name,
            p_location: data.orchard.location || null,
            p_total_rows: totalSetupRows(data.blocks),
            p_start_time: data.rates.start_time,
            p_piece_rate: data.rates.piece_rate,
            p_variety: data.rates.variety.trim() || null,
            p_min_wage: minWageFloorOn(todayNZST()),
            p_season_name: data.season.name.trim() || null,
            p_season_start: data.season.start_date || null,
            p_season_end: data.season.end_date || null,
            p_blocks: blocks,
        });

        if (error || !rpcResult) {
            return Err('RPC_FAILED', `RPC setup_orchard_atomic failed: ${error?.message ?? 'no result'}`, error);
        }
        return Ok({
            id: rpcResult.id,
            code: rpcResult.code,
            name: rpcResult.name,
            seasonId: rpcResult.season_id ?? null,
            blocks: rpcResult.blocks ?? 0,
            rows: rpcResult.rows ?? 0,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error during setup';
        logger.error('[Setup] Orchard setup failed:', message);
        return Err('SETUP_UNEXPECTED_ERROR', message, err);
    }
}
