/**
 * setup.service.ts — Orchard setup business logic
 * 
 * Extracted from SetupWizard.tsx to keep Supabase calls out of components.
 * 
 * Uses the `setup_orchard_atomic` RPC (deployed in 001_atomic_rpcs.sql) for
 * ACID-guaranteed orchard creation. Falls back to sequential inserts only if
 * the RPC is not yet deployed (error code 42883).
 */
import { rpcRepository } from '@/repositories/rpc.repository';
import { setupRepository } from '@/repositories/setup.repository';
import { logger } from '@/utils/logger';
import { Result, Ok, Err } from '@/types/result';

// ── Types ──────────────────────────────────────────────────── */
export interface OrchardSetupData {
    orchard: {
        code: string;
        name: string;
        location: string;
        total_rows: number;
    };
    teams: {
        name: string;
        leader_name: string;
        max_pickers: number;
    }[];
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
}

// ── Service Functions ──────────────────────────────────────── */

/**
 * Create a complete orchard setup: orchard + day_setup with rates.
 * 
 * Returns the created orchard data or an error.
 * 
 * Uses the `setup_orchard_atomic` RPC for transactional guarantees.
 * Falls back to sequential inserts if the RPC is unavailable.
 */
export async function createOrchardSetup(data: OrchardSetupData): Promise<Result<CreatedOrchard>> {
    try {
        // ── Attempt atomic RPC (preferred) ──
        const { data: rpcResult, error: rpcErr } = await rpcRepository.call<{ id: string; code: string; name: string }>('setup_orchard_atomic', {
            p_code: data.orchard.code,
            p_name: data.orchard.name,
            p_location: data.orchard.location || null,
            p_total_rows: data.orchard.total_rows,
            p_start_time: data.rates.start_time,
            p_piece_rate: data.rates.piece_rate,
            p_variety: data.rates.variety || null,
        });

        if (!rpcErr && rpcResult) {
            const result = rpcResult as { id: string; code: string; name: string };
            return Ok({ id: result.id, code: result.code, name: result.name });
        }

        // ── Fallback: RPC not deployed yet (42883 = function not found) ──
        if (rpcErr && rpcErr.code !== '42883') {
            return Err('RPC_FAILED', `RPC setup_orchard_atomic failed: ${rpcErr.message}`, rpcErr);
        }

        logger.warn('[Setup] RPC not available, falling back to sequential inserts');

        // 1. Create orchard
        const { data: orchardRow, error: orchardErr } = await setupRepository.insertOrchard({
            code: data.orchard.code,
            name: data.orchard.name,
            location: data.orchard.location || null,
            total_rows: data.orchard.total_rows,
        });

        if (orchardErr) {
            return Err('ORCHARD_CREATE_FAILED', `Failed to create orchard: ${orchardErr.message}`, orchardErr);
        }

        // 2. Create day setup with rates (non-blocking — warn on failure)
        const { error: setupErr } = await setupRepository.insertDaySetup({
            orchard_id: orchardRow.id,
            date: new Date().toISOString().slice(0, 10),
            start_time: data.rates.start_time,
            piece_rate: data.rates.piece_rate,
        });

        if (setupErr) {
            logger.warn('[Setup] Day setup created with warning:', setupErr.message);
        }

        return Ok({
            id: orchardRow.id,
            code: orchardRow.code,
            name: orchardRow.name,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error during setup';
        logger.error('[Setup] Orchard setup failed:', message);
        return Err('SETUP_UNEXPECTED_ERROR', message, err);
    }
}
