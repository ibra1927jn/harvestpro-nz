/**
 * Orchard Structure Repository — temporadas, bloques y filas del huerto
 *
 * Lo usan las pantallas «Estructura del huerto» (admin en cualquier huerto,
 * manager en el suyo; lo decide la RLS de la migración 20261024010000).
 * Nada se borra: bloques y filas se archivan (deleted_at); las temporadas se
 * cierran. Los totales de bloque y huerto los recalcula la base.
 */
import { supabase } from '@/services/supabase';
import { fetchInChunks } from '@/utils/fetchInChunks';

export type SeasonStatus = 'planning' | 'active' | 'closed' | 'archived';

export interface SeasonRow {
    id: string;
    orchard_id: string;
    name: string;
    start_date: string;
    end_date: string | null;
    status: SeasonStatus;
}

export interface BlockRow {
    id: string;
    orchard_id: string;
    season_id: string;
    name: string;
    total_rows: number;
    start_row: number;
    color_code: string | null;
    deleted_at: string | null;
}

export interface OrchardRowRecord {
    id: string;
    block_id: string;
    row_number: number;
    variety: string | null;
    target_buckets: number | null;
}

export interface RowPatch {
    variety?: string | null;
    target_buckets?: number | null;
}

/** Error de la base con su código (la pantalla elige el mensaje) */
export class StructureError extends Error {
    constructor(message: string, readonly code: string | undefined) {
        super(message);
        this.name = 'StructureError';
    }
}

function fail(error: { message: string; code?: string } | null): void {
    if (error) throw new StructureError(error.message, error.code);
}

const SEASON_COLS = 'id, orchard_id, name, start_date, end_date, status';
const BLOCK_COLS = 'id, orchard_id, season_id, name, total_rows, start_row, color_code, deleted_at';
const ROW_COLS = 'id, block_id, row_number, variety, target_buckets';

/** Colores de los bloques (los mismos que el asistente de huerto nuevo) */
export const BLOCK_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'] as const;

export const orchardStructureRepository = {
    /** Temporadas del huerto, la más reciente primero */
    async listSeasons(orchardId: string): Promise<SeasonRow[]> {
        const { data, error } = await supabase
            .from('harvest_seasons')
            .select(SEASON_COLS)
            .eq('orchard_id', orchardId)
            .is('deleted_at', null)
            .order('start_date', { ascending: false })
            .order('id');
        fail(error);
        return (data ?? []) as SeasonRow[];
    },

    async createSeason(input: { orchardId: string; name: string; startDate: string; endDate: string | null }): Promise<SeasonRow> {
        const { data, error } = await supabase
            .from('harvest_seasons')
            .insert({
                orchard_id: input.orchardId,
                name: input.name.trim(),
                start_date: input.startDate,
                end_date: input.endDate,
                status: 'planning',
            })
            .select(SEASON_COLS)
            .single();
        fail(error);
        return data as SeasonRow;
    },

    async updateSeason(id: string, patch: { name?: string; start_date?: string; end_date?: string | null }): Promise<void> {
        const { error } = await supabase.from('harvest_seasons').update(patch).eq('id', id);
        fail(error);
    },

    /** Activa la temporada; la activa anterior del huerto se cierra */
    async activateSeason(id: string): Promise<void> {
        const { error } = await supabase.rpc('activate_harvest_season', { p_season_id: id });
        fail(error);
    },

    async closeSeason(id: string, endDate: string | null): Promise<void> {
        const { error } = await supabase.rpc('close_harvest_season', { p_season_id: id, p_end_date: endDate });
        fail(error);
    },

    /** Copia bloques y filas a una temporada vacía; devuelve las filas copiadas */
    async copySeasonStructure(fromSeasonId: string, toSeasonId: string): Promise<number> {
        const { data, error } = await supabase.rpc('copy_season_structure', {
            p_from_season: fromSeasonId,
            p_to_season: toSeasonId,
        });
        fail(error);
        return typeof data === 'number' ? data : 0;
    },

    /** Bloques activos de una temporada, en orden de fila */
    async listBlocks(seasonId: string): Promise<BlockRow[]> {
        const { data, error } = await supabase
            .from('orchard_blocks')
            .select(BLOCK_COLS)
            .eq('season_id', seasonId)
            .is('deleted_at', null)
            .order('start_row', { ascending: true })
            .order('id');
        fail(error);
        return (data ?? []) as BlockRow[];
    },

    async createBlock(input: { orchardId: string; seasonId: string; name: string; colorCode: string; startRow: number }): Promise<BlockRow> {
        const { data, error } = await supabase
            .from('orchard_blocks')
            .insert({
                orchard_id: input.orchardId,
                season_id: input.seasonId,
                name: input.name.trim(),
                color_code: input.colorCode,
                start_row: input.startRow,
                total_rows: 0,
            })
            .select(BLOCK_COLS)
            .single();
        fail(error);
        return data as BlockRow;
    },

    async renameBlock(id: string, name: string): Promise<void> {
        const { error } = await supabase.from('orchard_blocks').update({ name: name.trim() }).eq('id', id);
        fail(error);
    },

    /** Archiva el bloque (y la base archiva sus filas) */
    async archiveBlock(id: string): Promise<void> {
        const { error } = await supabase.from('orchard_blocks').update({ deleted_at: new Date().toISOString() }).eq('id', id);
        fail(error);
    },

    /** Filas activas de los bloques (pueden ser más de 1000 en un huerto grande) */
    async listRows(blockIds: readonly string[]): Promise<OrchardRowRecord[]> {
        const rows = await fetchInChunks<OrchardRowRecord>(blockIds, (chunk, from, to) => supabase
            .from('block_rows')
            .select(ROW_COLS)
            .in('block_id', chunk)
            .is('deleted_at', null)
            .order('id')
            .range(from, to));
        return rows.sort((a, b) => a.row_number - b.row_number);
    },

    /** «Filas 1–15 en Bloque A»: añade las que falten; devuelve cuántas añadió */
    async addRows(blockId: string, from: number, to: number, variety: string | null, target: number | null): Promise<number> {
        const { data, error } = await supabase.rpc('add_block_rows', {
            p_block_id: blockId,
            p_from: from,
            p_to: to,
            p_variety: variety,
            p_target: target,
        });
        fail(error);
        return typeof data === 'number' ? data : 0;
    },

    /** «Filas 1–15 Royal Gala»: variedad y/o objetivo para un rango de filas del bloque */
    async updateRowsRange(blockId: string, from: number, to: number, patch: RowPatch): Promise<number> {
        const { data, error } = await supabase
            .from('block_rows')
            .update(patch)
            .eq('block_id', blockId)
            .gte('row_number', from)
            .lte('row_number', to)
            .is('deleted_at', null)
            .select('id');
        fail(error);
        return (data ?? []).length;
    },

    async updateRow(id: string, patch: RowPatch): Promise<void> {
        const { error } = await supabase.from('block_rows').update(patch).eq('id', id);
        fail(error);
    },

    async archiveRow(id: string): Promise<void> {
        const { error } = await supabase.from('block_rows').update({ deleted_at: new Date().toISOString() }).eq('id', id);
        fail(error);
    },
};
