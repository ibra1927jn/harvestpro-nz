/**
 * piece-rates.repository — precio por cubeta por día, huerto y variedad
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { pieceRatesRepository, toDailyPieceRate } from '@/repositories/piece-rates.repository';

type Call = { method: string; args: unknown[] };

/** Consulta encadenable que registra las llamadas y devuelve `result` al hacer await */
function chain(result: { data?: unknown; error?: unknown }, calls: Call[] = []) {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'in', 'gt', 'gte', 'lte', 'ilike', 'order', 'range', 'update', 'insert', 'delete']) {
        c[m] = vi.fn((...args: unknown[]) => { calls.push({ method: m, args }); return c; });
    }
    c.then = (ok?: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve(result).then(ok, fail);
    return c;
}

const row = (over: Record<string, unknown>) => ({
    id: 'r1', orchard_id: 'o1', variety: null, effective_date: '2026-10-20', piece_rate: '6.50', ...over,
});

describe('pieceRatesRepository', () => {
    let fromSpy: ReturnType<typeof vi.spyOn>;
    let rpcSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        fromSpy = vi.spyOn(supabase, 'from').mockReturnValue(chain({ data: [], error: null }) as never);
        rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: [], error: null } as never);
    });

    it('toDailyPieceRate convierte la fila (número, fecha sin hora)', () => {
        expect(toDailyPieceRate(row({ variety: 'Braeburn', effective_date: '2026-10-20T00:00:00', piece_rate: '8.10' })))
            .toEqual({ orchardId: 'o1', variety: 'Braeburn', effectiveDate: '2026-10-20', pieceRate: 8.1 });
    });

    it('loadRange: el último precio antes del inicio (piece_rates_as_of) + los fijados dentro del rango', async () => {
        rpcSpy.mockResolvedValue({ data: [row({ id: 'old', effective_date: '2026-10-01' })], error: null } as never);
        const calls: Call[] = [];
        fromSpy.mockReturnValue(chain({ data: [row({ id: 'new', effective_date: '2026-10-22', piece_rate: 7.25 })], error: null }, calls) as never);
        const rates = await pieceRatesRepository.loadRange('2026-10-19', '2026-10-25', 'o1');
        expect(rpcSpy).toHaveBeenCalledWith('piece_rates_as_of', { p_date: '2026-10-19', p_orchard_ids: ['o1'] });
        expect(fromSpy).toHaveBeenCalledWith('piece_rates');
        expect(calls).toEqual(expect.arrayContaining([
            { method: 'gt', args: ['effective_date', '2026-10-19'] },
            { method: 'lte', args: ['effective_date', '2026-10-25'] },
            { method: 'eq', args: ['orchard_id', 'o1'] },
            { method: 'order', args: ['id'] },
        ]));
        expect(rates.map(r => [r.effectiveDate, r.pieceRate])).toEqual([['2026-10-01', 6.5], ['2026-10-22', 7.25]]);
    });

    it('loadRange de la empresa: sin filtro de huerto', async () => {
        const calls: Call[] = [];
        fromSpy.mockReturnValue(chain({ data: [], error: null }, calls) as never);
        await pieceRatesRepository.loadRange('2026-10-19', '2026-10-25');
        expect(rpcSpy).toHaveBeenCalledWith('piece_rates_as_of', { p_date: '2026-10-19', p_orchard_ids: null });
        expect(calls.some(c => c.method === 'eq')).toBe(false);
    });

    it('loadRange lanza si la función falla (no paga con precios a medias)', async () => {
        rpcSpy.mockResolvedValue({ data: null, error: { message: 'boom' } } as never);
        await expect(pieceRatesRepository.loadRange('2026-10-19', '2026-10-25')).rejects.toThrow('boom');
    });

    it('loadForPay: precios del rango + harvest_settings.piece_rate de cada huerto', async () => {
        fromSpy.mockImplementation(((table: string) => table === 'harvest_settings'
            ? chain({ data: [{ orchard_id: 'o1', piece_rate: '6.5' }, { orchard_id: 'o2', piece_rate: null }], error: null })
            : chain({ data: [], error: null })) as never);
        const out = await pieceRatesRepository.loadForPay('2026-10-19', '2026-10-25');
        expect(out).toEqual({ rates: [], orchardFallbacks: { o1: 6.5 } });
    });

    it('setForDay: actualiza la fila de ese día si existe', async () => {
        const calls: Call[] = [];
        fromSpy
            .mockReturnValueOnce(chain({ data: [{ id: 'today', variety: 'Braeburn' }], error: null }, calls) as never)
            .mockReturnValueOnce(chain({ data: null, error: null }, calls) as never);
        await pieceRatesRepository.setForDay('o1', ' Braeburn ', 8.1, '2026-10-23');
        expect(calls).toEqual(expect.arrayContaining([
            { method: 'eq', args: ['effective_date', '2026-10-23'] },
            { method: 'ilike', args: ['variety', 'Braeburn'] },
            { method: 'update', args: [{ piece_rate: 8.1 }] },
            { method: 'eq', args: ['id', 'today'] },
        ]));
        expect(calls.some(c => c.method === 'insert')).toBe(false);
    });

    it('setForDay: inserta la fila de hoy (general: variety null) si no existe', async () => {
        const calls: Call[] = [];
        fromSpy.mockReturnValue(chain({ data: [], error: null }, calls) as never);
        await pieceRatesRepository.setForDay('o1', null, 7.25, '2026-10-23');
        expect(calls).toEqual(expect.arrayContaining([
            { method: 'is', args: ['variety', null] },
            { method: 'insert', args: [{ orchard_id: 'o1', variety: null, effective_date: '2026-10-23', piece_rate: 7.25 }] },
        ]));
    });

    it('setForDay lanza el error del servidor (p. ej. el RLS no deja reescribir días pasados)', async () => {
        fromSpy
            .mockReturnValueOnce(chain({ data: [], error: null }) as never)
            .mockReturnValueOnce(chain({ data: null, error: { message: 'new row violates row-level security policy' } }) as never);
        await expect(pieceRatesRepository.setForDay('o1', null, 7, '2026-10-01')).rejects.toThrow('row-level security');
    });

    it('clearForDay: borra solo la fila de ese día y esa variedad', async () => {
        const calls: Call[] = [];
        fromSpy
            .mockReturnValueOnce(chain({ data: [{ id: 'a', variety: 'Braeburn' }, { id: 'b', variety: 'Braeburn Extra' }], error: null }, calls) as never)
            .mockReturnValueOnce(chain({ data: null, error: null }, calls) as never);
        await pieceRatesRepository.clearForDay('o1', 'braeburn', '2026-10-23');
        expect(calls).toEqual(expect.arrayContaining([
            { method: 'delete', args: [] },
            { method: 'in', args: ['id', ['a']] },
        ]));
    });

    it('loadOrchardVarieties: variedades distintas de las filas, sin repetir mayúsculas', async () => {
        fromSpy.mockReturnValue(chain({ data: [
            { id: '1', variety: 'Royal Gala' }, { id: '2', variety: 'royal gala ' }, { id: '3', variety: 'Braeburn' }, { id: '4', variety: null },
        ], error: null }) as never);
        expect(await pieceRatesRepository.loadOrchardVarieties('o1')).toEqual(['Braeburn', 'Royal Gala']);
    });
});
