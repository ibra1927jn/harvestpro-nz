/**
 * payroll.repository.test.ts — Tests para payrollRepository
 *
 * Verifica las 3 funciones del repositorio:
 * - invokeCalculatePayroll: invoca Edge Function con los parámetros correctos
 * - fetchTimesheetAttendance: construye la query correcta y devuelve los datos
 * - fetchPickerNames: cortocircuito con array vacío, map id→name correcto
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { payrollRepository } from './payroll.repository';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/services/supabase', () => ({
    supabase: {
        from: vi.fn(),
    },
}));

vi.mock('@/repositories/edge-functions.repository', () => ({
    edgeFunctionsRepository: {
        invoke: vi.fn(),
    },
}));

import { supabase } from '@/services/supabase';
import { edgeFunctionsRepository } from '@/repositories/edge-functions.repository';

const mockSupabase = supabase as unknown as { from: ReturnType<typeof vi.fn> };
const mockEdge = edgeFunctionsRepository as unknown as { invoke: ReturnType<typeof vi.fn> };

// ─── Helpers de mock para el query builder de Supabase ──────────────────────

function makeQueryBuilder(resolveWith: { data: unknown; error: unknown }) {
    const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue(resolveWith),
    };
    // fetchTimesheetAttendance usa order como última llamada
    builder.order.mockResolvedValue(resolveWith);
    return builder;
}

// ─── invokeCalculatePayroll ──────────────────────────────────────────────────

describe('payrollRepository.invokeCalculatePayroll', () => {
    beforeEach(() => vi.clearAllMocks());

    it('invoca la Edge Function con los parámetros correctos', async () => {
        mockEdge.invoke.mockResolvedValue({ data: { total: 1200 }, error: null });

        await payrollRepository.invokeCalculatePayroll('orchard-1', '2026-04-01', '2026-04-07');

        expect(mockEdge.invoke).toHaveBeenCalledWith('calculate-payroll', {
            orchard_id: 'orchard-1',
            start_date: '2026-04-01',
            end_date: '2026-04-07',
        });
    });

    it('devuelve los datos de la Edge Function si no hay error', async () => {
        const mockData = { entries: [{ picker_id: 'p1', total: 450.0 }] };
        mockEdge.invoke.mockResolvedValue({ data: mockData, error: null });

        const result = await payrollRepository.invokeCalculatePayroll('orchard-1', '2026-04-01', '2026-04-07');
        expect(result).toEqual(mockData);
    });

    it('lanza error si la Edge Function devuelve error', async () => {
        mockEdge.invoke.mockResolvedValue({
            data: null,
            error: { message: 'Edge Function unavailable' },
        });

        await expect(
            payrollRepository.invokeCalculatePayroll('orchard-1', '2026-04-01', '2026-04-07')
        ).rejects.toThrow('Edge Function unavailable');
    });
});

// ─── fetchTimesheetAttendance ────────────────────────────────────────────────

describe('payrollRepository.fetchTimesheetAttendance', () => {
    beforeEach(() => vi.clearAllMocks());

    it('consulta daily_attendance con orchard_id y date correctos', async () => {
        const builder = makeQueryBuilder({ data: [], error: null });
        mockSupabase.from.mockReturnValue(builder);

        await payrollRepository.fetchTimesheetAttendance('orchard-abc', '2026-04-10');

        expect(mockSupabase.from).toHaveBeenCalledWith('daily_attendance');
        expect(builder.eq).toHaveBeenCalledWith('orchard_id', 'orchard-abc');
        expect(builder.eq).toHaveBeenCalledWith('date', '2026-04-10');
    });

    it('ordena por check_in ascendente', async () => {
        const builder = makeQueryBuilder({ data: [], error: null });
        mockSupabase.from.mockReturnValue(builder);

        await payrollRepository.fetchTimesheetAttendance('orchard-abc', '2026-04-10');

        expect(builder.order).toHaveBeenCalledWith('check_in', { ascending: true });
    });

    it('devuelve array vacío si Supabase devuelve null', async () => {
        const builder = makeQueryBuilder({ data: null, error: null });
        mockSupabase.from.mockReturnValue(builder);

        const { data } = await payrollRepository.fetchTimesheetAttendance('orchard-abc', '2026-04-10');
        expect(data).toEqual([]);
    });

    it('devuelve los registros cuando existen', async () => {
        const records = [
            { id: 'att-1', picker_id: 'p1', check_in: '07:00', check_out: '15:00' },
            { id: 'att-2', picker_id: 'p2', check_in: '07:05', check_out: '15:00' },
        ];
        const builder = makeQueryBuilder({ data: records, error: null });
        mockSupabase.from.mockReturnValue(builder);

        const { data, error } = await payrollRepository.fetchTimesheetAttendance('orchard-abc', '2026-04-10');
        expect(data).toHaveLength(2);
        expect(error).toBeNull();
    });

    it('propaga el error de Supabase sin lanzar', async () => {
        const supabaseError = { message: 'Connection error', code: '500' };
        const builder = makeQueryBuilder({ data: null, error: supabaseError });
        mockSupabase.from.mockReturnValue(builder);

        const { data, error } = await payrollRepository.fetchTimesheetAttendance('orchard-abc', '2026-04-10');
        expect(data).toEqual([]);
        expect(error).toEqual(supabaseError);
    });
});

// ─── fetchPickerNames ────────────────────────────────────────────────────────

describe('payrollRepository.fetchPickerNames', () => {
    beforeEach(() => vi.clearAllMocks());

    it('devuelve {} sin llamar a Supabase si el array de IDs está vacío', async () => {
        const result = await payrollRepository.fetchPickerNames([]);

        expect(result).toEqual({});
        expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('consulta pickers con los IDs proporcionados', async () => {
        const builder = makeQueryBuilder({
            data: [{ id: 'p1', name: 'Ana' }],
            error: null,
        });
        mockSupabase.from.mockReturnValue(builder);

        await payrollRepository.fetchPickerNames(['p1', 'p2']);

        expect(mockSupabase.from).toHaveBeenCalledWith('pickers');
        expect(builder.in).toHaveBeenCalledWith('id', ['p1', 'p2']);
    });

    it('construye el mapa id→name correctamente', async () => {
        const builder = makeQueryBuilder({
            data: [
                { id: 'p1', name: 'Ana García' },
                { id: 'p2', name: 'Pedro Ruiz' },
            ],
            error: null,
        });
        mockSupabase.from.mockReturnValue(builder);

        const result = await payrollRepository.fetchPickerNames(['p1', 'p2']);

        expect(result).toEqual({ p1: 'Ana García', p2: 'Pedro Ruiz' });
    });

    it('devuelve {} si Supabase devuelve null', async () => {
        const builder = makeQueryBuilder({ data: null, error: null });
        mockSupabase.from.mockReturnValue(builder);

        const result = await payrollRepository.fetchPickerNames(['p1']);
        expect(result).toEqual({});
    });
});
