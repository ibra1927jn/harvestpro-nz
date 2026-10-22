/**
 * «Precio por cubeta — hoy»: general y por variedad, con el de ayer y el historial
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@/test-utils';
import { todayNZST, addDaysYMD } from '@/utils/nzst';
import type { PieceRateRow } from '@/repositories/piece-rates.repository';

const loadHistory = vi.fn();
const loadOrchardVarieties = vi.fn();
const setForDay = vi.fn();
const clearForDay = vi.fn();
const upsert = vi.fn();

vi.mock('@/repositories/piece-rates.repository', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/repositories/piece-rates.repository')>();
    return {
        ...actual,
        pieceRatesRepository: {
            loadHistory: (...a: unknown[]) => loadHistory(...a),
            loadOrchardVarieties: (...a: unknown[]) => loadOrchardVarieties(...a),
            setForDay: (...a: unknown[]) => setForDay(...a),
            clearForDay: (...a: unknown[]) => clearForDay(...a),
        },
    };
});
vi.mock('@/repositories/settings.repository', () => ({
    settingsRepository: { upsert: (...a: unknown[]) => upsert(...a) },
}));

import { DailyPieceRatesEditor, buildRateLines } from './DailyPieceRatesEditor';
import { useHarvestStore } from '@/stores/useHarvestStore';

const today = todayNZST();
const yesterday = addDaysYMD(today, -1);
const row = (id: string, variety: string | null, date: string, rate: number): PieceRateRow =>
    ({ id, orchard_id: 'o1', variety, effective_date: date, piece_rate: rate });

describe('buildRateLines', () => {
    it('general + cada variedad (con el nombre de las filas), con el precio de hoy y el de ayer', () => {
        const rows = [
            { orchardId: 'o1', variety: null, effectiveDate: '2026-01-01', pieceRate: 6.5 },
            { orchardId: 'o1', variety: null, effectiveDate: today, pieceRate: 7.25 },
            { orchardId: 'o1', variety: 'Braeburn', effectiveDate: '2026-01-01', pieceRate: 8.1 },
        ];
        const lines = buildRateLines(rows, 'o1', ['Royal Gala', 'braeburn'], 6, today);
        expect(lines.map(l => [l.variety, l.today, l.yesterday, l.own, l.setToday])).toEqual([
            [null, 7.25, 6.5, true, true],
            ['braeburn', 8.1, 8.1, true, false],
            ['Royal Gala', 7.25, 6.5, false, false],
        ]);
    });

    it('sin precios: el guardado (fallback)', () => {
        const [general] = buildRateLines([], 'o1', [], 6.8, today);
        expect([general.today, general.yesterday]).toEqual([6.8, 6.8]);
    });
});

describe('DailyPieceRatesEditor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        loadHistory.mockResolvedValue([
            row('g0', null, '2026-01-01', 6.5),
            row('g1', null, yesterday, 7),
            row('v1', 'Braeburn', today, 8.1),
        ]);
        loadOrchardVarieties.mockResolvedValue(['Braeburn', 'Royal Gala']);
        setForDay.mockResolvedValue(undefined);
        clearForDay.mockResolvedValue(undefined);
        upsert.mockResolvedValue(undefined);
        act(() => { useHarvestStore.setState(s => ({ orchard: { id: 'o1', name: 'A' }, settings: { ...s.settings, piece_rate: 6.5 } })); });
    });

    it('enseña el precio de hoy, el de ayer, el aviso y deja los precios de hoy en el store', async () => {
        const onGeneral = vi.fn();
        render(<DailyPieceRatesEditor orchardId="o1" onGeneralRateChange={onGeneral} />);
        await waitFor(() => expect(screen.getByTestId('piece-rate-Braeburn')).toBeTruthy());
        expect(screen.getByText(/earlier days keep their price/i)).toBeTruthy();
        expect(screen.getByTestId('piece-rate-general').textContent).toMatch(/\$7\.00.*yesterday \$7\.00/);
        expect(screen.getByTestId('piece-rate-Braeburn').textContent).toMatch(/\$8\.10.*yesterday \$7\.00/);
        expect(screen.getByTestId('piece-rate-Royal Gala').textContent).toMatch(/uses general/);
        expect(onGeneral).toHaveBeenCalledWith(7);
        expect(useHarvestStore.getState().settings.piece_rate).toBe(7);
        expect(useHarvestStore.getState().settings.piece_rates?.length).toBe(3);
        expect(loadHistory).toHaveBeenCalledWith('o1', 14, today);
    });

    it('guardar el general escribe la fila de HOY y copia el precio a harvest_settings', async () => {
        render(<DailyPieceRatesEditor orchardId="o1" />);
        const input = await screen.findByLabelText(/Price per bucket today: General price/);
        fireEvent.change(input, { target: { value: '7.5' } });
        fireEvent.click(screen.getByTestId('piece-rate-general').querySelector('button') as HTMLButtonElement);
        await waitFor(() => expect(setForDay).toHaveBeenCalledWith('o1', null, 7.5, today));
        expect(upsert).toHaveBeenCalledWith('o1', { piece_rate: 7.5 });
        expect(await screen.findByRole('status')).toBeTruthy();
    });

    it('guardar una variedad solo escribe su fila de hoy (no toca harvest_settings)', async () => {
        render(<DailyPieceRatesEditor orchardId="o1" />);
        const input = await screen.findByLabelText(/Price per bucket today: Royal Gala/);
        fireEvent.change(input, { target: { value: '9' } });
        fireEvent.click(screen.getByTestId('piece-rate-Royal Gala').querySelector('button') as HTMLButtonElement);
        await waitFor(() => expect(setForDay).toHaveBeenCalledWith('o1', 'Royal Gala', 9, today));
        expect(upsert).not.toHaveBeenCalled();
    });

    it('precio no válido: no guarda y avisa', async () => {
        render(<DailyPieceRatesEditor orchardId="o1" />);
        const input = await screen.findByLabelText(/Price per bucket today: Braeburn/);
        fireEvent.change(input, { target: { value: '-1' } });
        fireEvent.click(screen.getByTestId('piece-rate-Braeburn').querySelector('button') as HTMLButtonElement);
        expect((await screen.findByRole('status')).textContent).toMatch(/Invalid price for Braeburn/);
        expect(setForDay).not.toHaveBeenCalled();
    });

    it('deshacer el cambio de hoy de una variedad borra solo la fila de hoy', async () => {
        render(<DailyPieceRatesEditor orchardId="o1" />);
        const undo = await screen.findByText('Undo today');
        fireEvent.click(undo);
        await waitFor(() => expect(clearForDay).toHaveBeenCalledWith('o1', 'Braeburn', today));
    });

    it('historial plegable de los últimos 14 días (sin la fila antigua)', async () => {
        render(<DailyPieceRatesEditor orchardId="o1" />);
        const history = await screen.findByTestId('piece-rates-history');
        await waitFor(() => expect(history.querySelectorAll('li').length).toBe(2));
        expect(history.textContent).toMatch(/Braeburn.*\$8\.10/);
    });

    it('si el servidor rechaza el guardado, lo dice', async () => {
        setForDay.mockRejectedValue(new Error('rls'));
        render(<DailyPieceRatesEditor orchardId="o1" />);
        const input = await screen.findByLabelText(/Price per bucket today: General price/);
        fireEvent.change(input, { target: { value: '7.5' } });
        fireEvent.click(screen.getByTestId('piece-rate-general').querySelector('button') as HTMLButtonElement);
        expect((await screen.findByRole('status')).textContent).toMatch(/Could not save the price/);
    });
});
