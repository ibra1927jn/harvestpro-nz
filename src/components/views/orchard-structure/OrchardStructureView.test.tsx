/**
 * OrchardStructureView — montar un huerto desde cero: temporada, bloque con
 * sus filas, variedad por rango, edición y archivado (repositorio en memoria)
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import type { BlockRow, OrchardRowRecord, SeasonRow, RowPatch } from '@/repositories/orchard-structure.repository';

// Base en memoria con las mismas reglas que la de verdad (lo justo para la pantalla)
const db = vi.hoisted(() => ({
    seasons: [] as SeasonRow[],
    blocks: [] as BlockRow[],
    rows: [] as OrchardRowRecord[],
    n: 0,
}));
const repo = vi.hoisted(() => ({
    listSeasons: vi.fn(async () => [...db.seasons]),
    // Como create_harvest_season: crear, copiar y activar en una sola llamada
    createSeason: vi.fn(async (i: { orchardId: string; name: string; startDate: string; endDate: string | null; copyFrom: string | null; activate: boolean }) => {
        const s: SeasonRow = { id: `s${++db.n}`, orchard_id: i.orchardId, name: i.name, start_date: i.startDate, end_date: i.endDate, status: 'planning' };
        db.seasons.unshift(s);
        if (i.activate) for (const x of db.seasons) x.status = x.id === s.id ? 'active' : x.status === 'active' ? 'closed' : x.status;
        return s.id;
    }),
    updateSeason: vi.fn(async () => undefined),
    activateSeason: vi.fn(async (id: string) => {
        for (const s of db.seasons) s.status = s.id === id ? 'active' : s.status === 'active' ? 'closed' : s.status;
    }),
    closeSeason: vi.fn(async () => undefined),
    copySeasonStructure: vi.fn(async () => 0),
    listBlocks: vi.fn(async (seasonId: string) => db.blocks.filter(b => b.season_id === seasonId && !b.deleted_at)),
    // Como create_orchard_block: el bloque y sus filas en una sola llamada
    createBlock: vi.fn(async (i: { seasonId: string; name: string; colorCode: string; rowFrom: number | null; rowTo: number | null; variety: string | null; target: number | null }) => {
        const b: BlockRow = { id: `b${++db.n}`, orchard_id: 'o1', season_id: i.seasonId, name: i.name, total_rows: 0, start_row: i.rowFrom ?? 1, color_code: i.colorCode, deleted_at: null };
        db.blocks.push(b);
        if (i.rowFrom !== null && i.rowTo !== null) {
            for (let n = i.rowFrom; n <= i.rowTo; n++) db.rows.push({ id: `r${n}`, block_id: b.id, row_number: n, variety: i.variety, target_buckets: i.target ?? 100 });
        }
        return b.id;
    }),
    renameBlock: vi.fn(async (id: string, name: string) => { const b = db.blocks.find(x => x.id === id); if (b) b.name = name; }),
    archiveBlock: vi.fn(async () => undefined),
    listRows: vi.fn(async (ids: readonly string[]) => db.rows.filter(r => ids.includes(r.block_id))),
    addRows: vi.fn(async (blockId: string, from: number, to: number, variety: string | null, target: number | null) => {
        for (let n = from; n <= to; n++) db.rows.push({ id: `r${n}`, block_id: blockId, row_number: n, variety, target_buckets: target ?? 100 });
        return to - from + 1;
    }),
    updateRowsRange: vi.fn(async (blockId: string, from: number, to: number, patch: RowPatch) => {
        const hit = db.rows.filter(r => r.block_id === blockId && r.row_number >= from && r.row_number <= to);
        for (const r of hit) Object.assign(r, patch);
        return hit.length;
    }),
    updateRow: vi.fn(async (id: string, patch: RowPatch) => { Object.assign(db.rows.find(r => r.id === id) ?? {}, patch); }),
    archiveRow: vi.fn(async (id: string) => { db.rows = db.rows.filter(r => r.id !== id); }),
}));
vi.mock('@/repositories/orchard-structure.repository', () => ({
    orchardStructureRepository: repo,
    BLOCK_COLORS: ['#dc2626', '#2563eb'],
}));

import OrchardStructureView from './OrchardStructureView';
import { useHarvestStore } from '@/stores/useHarvestStore';

const fetchBlocks = vi.fn(async () => undefined);

beforeEach(() => {
    db.seasons = []; db.blocks = []; db.rows = []; db.n = 0;
    vi.clearAllMocks();
    act(() => useHarvestStore.setState({ orchard: { id: 'o1', name: 'Hastings' }, fetchBlocks }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('OrchardStructureView', () => {
    it('sets up an empty orchard: season, block with rows 1–15, variety by range', async () => {
        render(<OrchardStructureView orchardId="o1" orchardName="Hastings" />);

        // Sin temporadas: el formulario de la primera ya está abierto
        const seasonForm = await screen.findByTestId('ostruct-season-form');
        expect((within(seasonForm).getByTestId('ostruct-season-name') as HTMLInputElement).value).toMatch(/^Season \d{4}–\d{2}$/);
        fireEvent.click(screen.getByTestId('ostruct-create-season'));
        await waitFor(() => expect(repo.createSeason).toHaveBeenCalledWith(expect.objectContaining({ orchardId: 'o1', endDate: null, copyFrom: null, activate: true })));
        // Huerto abierto en la app: el mapa del store se recarga
        await waitFor(() => expect(fetchBlocks).toHaveBeenCalledWith('o1'));

        // Bloque con sus filas en un paso
        expect(await screen.findByTestId('ostruct-no-blocks')).toBeInTheDocument();
        fireEvent.change(screen.getByTestId('ostruct-block-name'), { target: { value: 'Block A' } });
        fireEvent.change(screen.getByTestId('ostruct-block-from'), { target: { value: '1' } });
        fireEvent.change(screen.getByTestId('ostruct-block-to'), { target: { value: '15' } });
        fireEvent.change(screen.getByTestId('ostruct-block-variety'), { target: { value: 'Braeburn' } });
        fireEvent.click(screen.getByTestId('ostruct-add-block'));
        await waitFor(() => expect(repo.createBlock).toHaveBeenCalledWith(expect.objectContaining({
            seasonId: 's1', name: 'Block A', rowFrom: 1, rowTo: 15, variety: 'Braeburn', target: null,
        })));
        expect(repo.addRows).not.toHaveBeenCalled();
        const blockLine = await screen.findByTestId('ostruct-block-Block A');
        expect(blockLine).toHaveTextContent('15 rows (1–15)');
        expect(blockLine).toHaveTextContent('Braeburn ×15');

        // Variedad y objetivo por rango: «filas 1–10 Royal Gala»
        fireEvent.click(screen.getByTestId('ostruct-open-Block A'));
        const rows = await screen.findByTestId('ostruct-rows');
        fireEvent.change(within(rows).getByTestId('ostruct-rows-from'), { target: { value: '1' } });
        fireEvent.change(within(rows).getByTestId('ostruct-rows-to'), { target: { value: '10' } });
        fireEvent.change(within(rows).getByTestId('ostruct-rows-variety'), { target: { value: 'Royal Gala' } });
        fireEvent.change(within(rows).getByTestId('ostruct-rows-target'), { target: { value: '80' } });
        fireEvent.click(within(rows).getByTestId('ostruct-rows-submit'));
        await waitFor(() => expect(repo.updateRowsRange).toHaveBeenCalledWith('b2', 1, 10, { variety: 'Royal Gala', target_buckets: 80 }));
        expect(await screen.findByText('10 rows updated')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByTestId('ostruct-block-Block A')).toHaveTextContent('Royal Gala ×10 · Braeburn ×5'));
    });

    it('edits one row and archives another', async () => {
        db.seasons = [{ id: 's1', orchard_id: 'o1', name: 'S', start_date: '2026-10-01', end_date: null, status: 'active' }];
        db.blocks = [{ id: 'b1', orchard_id: 'o1', season_id: 's1', name: 'Block A', total_rows: 2, start_row: 1, color_code: null, deleted_at: null }];
        db.rows = [
            { id: 'r1', block_id: 'b1', row_number: 1, variety: 'Gala', target_buckets: 100 },
            { id: 'r2', block_id: 'b1', row_number: 2, variety: 'Gala', target_buckets: 100 },
        ];
        render(<OrchardStructureView orchardId="o1" />);
        fireEvent.click(await screen.findByTestId('ostruct-open-Block A'));
        fireEvent.change(await screen.findByLabelText('Target of row 1'), { target: { value: '120' } });
        fireEvent.click(screen.getByLabelText('Save row 1'));
        await waitFor(() => expect(repo.updateRow).toHaveBeenCalledWith('r1', { variety: 'Gala', target_buckets: 120 }));
        fireEvent.click(screen.getByLabelText('Archive row 2'));
        await waitFor(() => expect(repo.archiveRow).toHaveBeenCalledWith('r2'));
        await waitFor(() => expect(screen.queryByTestId('ostruct-row-2')).toBeNull());
    });

    it('validates ranges before calling the database and shows DB errors clearly', async () => {
        db.seasons = [{ id: 's1', orchard_id: 'o1', name: 'S', start_date: '2026-10-01', end_date: null, status: 'active' }];
        render(<OrchardStructureView orchardId="o1" />);
        fireEvent.change(await screen.findByTestId('ostruct-block-from'), { target: { value: '9' } });
        fireEvent.change(screen.getByTestId('ostruct-block-to'), { target: { value: '3' } });
        fireEvent.click(screen.getByTestId('ostruct-add-block'));
        expect(await screen.findByText(/The last row must be/)).toBeInTheDocument();
        expect(repo.createBlock).not.toHaveBeenCalled();

        repo.createBlock.mockRejectedValueOnce(Object.assign(new Error('duplicate key value violates unique constraint "idx_unique_active_block"'), { code: '23505' }));
        fireEvent.change(screen.getByTestId('ostruct-block-from'), { target: { value: '' } });
        fireEvent.change(screen.getByTestId('ostruct-block-to'), { target: { value: '' } });
        fireEvent.click(screen.getByTestId('ostruct-add-block'));
        expect(await screen.findByText('There is already a block with that name in this season.')).toBeInTheDocument();
    });

    it('activating a planned season goes through the database function', async () => {
        db.seasons = [
            { id: 's2', orchard_id: 'o1', name: 'Next', start_date: '2027-10-01', end_date: null, status: 'planning' },
            { id: 's1', orchard_id: 'o1', name: 'Now', start_date: '2026-10-01', end_date: null, status: 'active' },
        ];
        render(<OrchardStructureView orchardId="o1" />);
        fireEvent.click(await screen.findByRole('button', { name: /Next/ }));
        fireEvent.click(await screen.findByTestId('ostruct-activate-season'));
        await waitFor(() => expect(repo.activateSeason).toHaveBeenCalledWith('s2'));
    });
});
