/**
 * Precio de HOY que enseñan el TL, el runner y el perfil del picker
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { useTodayPieceRate, todayPieceRate, varietyOfRow, rowOfTeam } from './useTodayPieceRate';
import { todayNZST, addDaysYMD } from '@/utils/nzst';
import type { RowAssignment } from '@/types';

const today = todayNZST();

describe('useTodayPieceRate helpers', () => {
    it('varietyOfRow: la variedad de la fila en cualquier bloque; sin fila o placeholder, null', () => {
        const blocks = [{ rowVarieties: { 1: 'Royal Gala', 2: 'Desconocida' } }, { rowVarieties: { 16: ' Braeburn ' } }];
        expect(varietyOfRow(blocks, 16)).toBe('Braeburn');
        expect(varietyOfRow(blocks, 1)).toBe('Royal Gala');
        expect(varietyOfRow(blocks, 2)).toBeNull();
        expect(varietyOfRow(blocks, 99)).toBeNull();
        expect(varietyOfRow(blocks, null)).toBeNull();
    });

    it('rowOfTeam: la última fila asignada al equipo del team leader', () => {
        const rows = [
            { id: 'a', row_number: 3, side: 'north', assigned_pickers: [], completion_percentage: 0, team_leader_id: 'tl1' },
            { id: 'b', row_number: 9, side: 'north', assigned_pickers: [], completion_percentage: 0, team_leader_id: 'tl2' },
            { id: 'c', row_number: 5, side: 'south', assigned_pickers: [], completion_percentage: 0, team_leader_id: 'tl1' },
        ] as RowAssignment[];
        expect(rowOfTeam(rows, 'tl1')).toBe(5);
        expect(rowOfTeam(rows, 'tl3')).toBeNull();
        expect(rowOfTeam(rows, undefined)).toBeNull();
        expect(rowOfTeam(undefined, 'tl1')).toBeNull();
    });

    it('todayPieceRate: variedad de hoy → general de hoy → piece_rate', () => {
        const settings = {
            piece_rate: 7,
            piece_rates: [
                { orchardId: 'o1', variety: null, effectiveDate: today, pieceRate: 7.25 },
                { orchardId: 'o1', variety: 'Braeburn', effectiveDate: addDaysYMD(today, -3), pieceRate: 8.1 },
                { orchardId: 'o1', variety: 'Braeburn', effectiveDate: addDaysYMD(today, 1), pieceRate: 9 },
            ],
        };
        expect(todayPieceRate(settings, 'o1', 'Braeburn')).toBe(8.1);
        expect(todayPieceRate(settings, 'o1', 'Fuji')).toBe(7.25);
        expect(todayPieceRate(settings, 'o1', null)).toBe(7.25);
        expect(todayPieceRate({ piece_rate: 6.8 }, 'o1', 'Braeburn')).toBe(6.8);
        expect(todayPieceRate(null, 'o1', null)).toBe(6.5);
    });
});

describe('useTodayPieceRate', () => {
    beforeEach(() => {
        act(() => {
            useHarvestStore.setState(s => ({
                orchard: { id: 'o1', name: 'A' },
                orchardBlocks: [{ id: 'b', name: 'B', totalRows: 2, startRow: 1, colorCode: '#000', status: 'idle', rowVarieties: { 1: 'Braeburn', 2: 'Royal Gala' } }],
                settings: {
                    ...s.settings,
                    piece_rate: 7,
                    piece_rates: [
                        { orchardId: 'o1', variety: null, effectiveDate: today, pieceRate: 7 },
                        { orchardId: 'o1', variety: 'Braeburn', effectiveDate: today, pieceRate: 8.1 },
                    ],
                },
            }));
        });
    });

    it('precio de la variedad de la fila; sin fila, el general', () => {
        expect(renderHook(() => useTodayPieceRate(1)).result.current).toEqual({ rate: 8.1, variety: 'Braeburn' });
        expect(renderHook(() => useTodayPieceRate(2)).result.current).toEqual({ rate: 7, variety: 'Royal Gala' });
        expect(renderHook(() => useTodayPieceRate()).result.current).toEqual({ rate: 7, variety: null });
    });

    it('se actualiza cuando llegan los precios nuevos (realtime) sin recargar', () => {
        const { result } = renderHook(() => useTodayPieceRate(1));
        act(() => {
            useHarvestStore.setState(s => ({
                settings: { ...s.settings, piece_rates: [{ orchardId: 'o1', variety: 'Braeburn', effectiveDate: today, pieceRate: 9.2 }] },
            }));
        });
        expect(result.current.rate).toBe(9.2);
    });
});
