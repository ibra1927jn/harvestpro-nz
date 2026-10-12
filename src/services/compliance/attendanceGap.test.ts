/**
 * Tests para attendanceGap — BUG-07 y BUG-08
 *
 * Test 1: Tom Blackwood 07 abr — scans sin check-in → scansWithoutAttendance: true
 * Test 2: Emily Foster 09 abr — horas sin scans → attendanceWithoutScans: true
 * Test 3: picker normal — ambos flags false
 */

import { describe, it, expect, vi, type Mock } from 'vitest';
import { checkAttendanceGap } from './attendanceGap';

/** Construye un mock de SupabaseClient con respuestas configurables */
function mockSupabase(
  attendanceData: { check_in: string | null; check_out?: string | null } | null,
  scanCount: number
) {
  const buildQuery = (data: unknown, count?: number | null) => {
    const chain: Record<string, unknown> = {};
    const methods = ['from', 'select', 'eq', 'gte', 'lt', 'lte', 'is', 'maybeSingle', 'limit'] as const;
    methods.forEach(m => {
      chain[m] = vi.fn().mockReturnValue(chain);
    });
    chain['maybeSingle'] = vi.fn().mockResolvedValue({ data, error: null });
    if (count === undefined) {
      // Fichajes del día: lista de tramos (puede haber varios)
      chain['is'] = vi.fn().mockResolvedValue({ data: data ? [data] : [], error: null });
    }
    if (count !== undefined) {
      // Para el query de scans (head: true), la cadena resuelve con { count }
      // Sobreescribimos el objeto resuelto final con un mock del select encadenado
      chain['is'] = vi.fn().mockResolvedValue({ data: null, error: null, count });
    }
    return chain;
  };

  const attendanceQuery = buildQuery(attendanceData);
  const scansQuery = buildQuery(null, scanCount);

  let callCount = 0;
  const fromMock: Mock = vi.fn(() => {
    callCount++;
    return callCount === 1 ? attendanceQuery : scansQuery;
  });

  return { from: fromMock } as unknown as Parameters<typeof checkAttendanceGap>[0];
}

describe('checkAttendanceGap', () => {
  it('BUG-07: scans sin check-in → scansWithoutAttendance = true', async () => {
    // Tom Blackwood el 07 abr: 5 scans pero sin check_in
    const supabase = mockSupabase(null, 5);
    const result = await checkAttendanceGap(supabase, 'tom-blackwood-uuid', '2026-04-07');

    expect(result.pickerId).toBe('tom-blackwood-uuid');
    expect(result.date).toBe('2026-04-07');
    expect(result.hasAttendance).toBe(false);
    expect(result.scanCount).toBe(5);
    expect(result.scansWithoutAttendance).toBe(true);
    expect(result.attendanceWithoutScans).toBe(false);
  });

  it('BUG-08: horas sin actividad de cosecha → attendanceWithoutScans = true', async () => {
    // Emily Foster el 09 abr: check_in presente, 6h trabajadas, 0 scans
    const supabase = mockSupabase({ check_in: '2026-04-09T07:00:00+12:00', check_out: '2026-04-09T13:30:00+12:00' }, 0);
    const result = await checkAttendanceGap(supabase, 'emily-foster-uuid', '2026-04-09');

    expect(result.hasAttendance).toBe(true);
    expect(result.scanCount).toBe(0);
    expect(result.hoursWorked).toBe(6);
    expect(result.attendanceWithoutScans).toBe(true);
    expect(result.scansWithoutAttendance).toBe(false);
  });

  it('picker normal: sin gaps — ambos flags false', async () => {
    // Picker normal: check_in presente, 8h, 45 scans
    const supabase = mockSupabase({ check_in: '2026-04-10T07:00:00+12:00', check_out: '2026-04-10T15:30:00+12:00' }, 45);
    const result = await checkAttendanceGap(supabase, 'normal-picker-uuid', '2026-04-10');

    expect(result.hasAttendance).toBe(true);
    expect(result.scanCount).toBe(45);
    expect(result.scansWithoutAttendance).toBe(false);
    expect(result.attendanceWithoutScans).toBe(false);
  });

  it('attendanceWithoutScans es false cuando horas <= 2 (umbral)', async () => {
    // Picker con 1h registrada sin scans — dentro del umbral de gracia
    const supabase = mockSupabase({ check_in: '2026-04-10T07:00:00+12:00', check_out: '2026-04-10T08:00:00+12:00' }, 0);
    const result = await checkAttendanceGap(supabase, 'short-shift-uuid', '2026-04-10');

    expect(result.attendanceWithoutScans).toBe(false);
  });
});
