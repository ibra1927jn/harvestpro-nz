/**
 * backlog.test.ts — Tests para binBacklogSeries
 */
import { describe, it, expect } from 'vitest';
import { binBacklogSeries } from './backlog';
import type { BinFillEvent, PickupRun } from './backlog';

// Helper: crea ISO timestamp para hoy a H:MM en UTC+12 (NZ)
// Usamos offsets relativos a "ahora" para evitar problemas de timezone.
// Para tests deterministas, construimos timestamps con offset +12:00 explícito.
const makeNZTimestamp = (date: string, hour: number, minute = 0): string => {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${date}T${hh}:${mm}:00+12:00`;
};

// Fecha de referencia fija para todos los tests
const TEST_DATE = '2026-04-14';
const makeTs = (hour: number, minute = 0) => makeNZTimestamp(TEST_DATE, hour, minute);

// now = 12:00 NZ → buildShiftSlots retornará slots 07-11 (los completados)
const nowAt12 = new Date(`${TEST_DATE}T12:00:00+12:00`);

describe('binBacklogSeries', () => {
  it('devuelve array vacío con fills y runs vacíos', () => {
    const result = binBacklogSeries({
      fills: [],
      runs: [],
      shiftStart: '07:00',
      now: nowAt12,
    });

    expect(Array.isArray(result)).toBe(true);
    // Puede devolver slots con pending=0 o array vacío — lo importante es que pending=0
    for (const point of result) {
      expect(point.pending).toBe(0);
    }
  });

  it('calcula backlog acumulado correctamente con fills y pickups', () => {
    // Fills: hora 8, 9, 10 (una cubeta cada hora)
    const fills: BinFillEvent[] = [
      { binId: 'b1', filledAt: makeTs(8, 10) },
      { binId: 'b2', filledAt: makeTs(9, 5) },
      { binId: 'b3', filledAt: makeTs(10, 15) },
    ];

    // Runs: uno completa en hora 9 (1 bin), otro en hora 11
    // PERO now=12:00 → slot 11 está activo
    const nowAt12Extended = new Date(`${TEST_DATE}T12:00:00+12:00`);
    const runs: PickupRun[] = [
      {
        id: 'r1', runnerId: 'ru1', runnerName: 'Ana',
        requestedAt: makeTs(8, 30), completedAt: makeTs(9, 30),
        durationSec: 3600, binsCount: 1,
      },
      {
        id: 'r2', runnerId: 'ru1', runnerName: 'Ana',
        requestedAt: makeTs(10, 30), completedAt: makeTs(11, 30),
        durationSec: 3600, binsCount: 1,
      },
    ];

    const result = binBacklogSeries({
      fills,
      runs,
      shiftStart: '07:00',
      now: nowAt12Extended,
    });

    // Slots activos: 7,8,9,10,11 (now=12:00)
    // Hora 7: 0 fills, 0 pickups → pending=0
    // Hora 8: 1 fill, 0 pickups → pending=1
    // Hora 9: 1 fill, 1 pickup (r1 completa a 9:30) → pending=1
    // Hora 10: 1 fill, 0 pickups → pending=2
    // Hora 11: 0 fills, 1 pickup (r2 completa a 11:30) → pending=1
    const byHour = Object.fromEntries(result.map(p => [p.hour, p.pending]));

    expect(byHour[7]).toBe(0);
    expect(byHour[8]).toBe(1);
    expect(byHour[9]).toBe(1);
    expect(byHour[10]).toBe(2);
    expect(byHour[11]).toBe(1);
  });

  it('el backlog nunca es negativo (clamp a 0)', () => {
    // Más pickups que fills en el primer slot
    const fills: BinFillEvent[] = [
      { binId: 'b1', filledAt: makeTs(8, 10) },
    ];
    const runs: PickupRun[] = [
      {
        id: 'r1', runnerId: 'ru1', runnerName: 'Ana',
        requestedAt: makeTs(7, 30), completedAt: makeTs(7, 50),
        durationSec: 1200, binsCount: 5, // 5 bins recogidas cuando aún no hay fills
      },
    ];

    const result = binBacklogSeries({
      fills,
      runs,
      shiftStart: '07:00',
      now: nowAt12,
    });

    for (const point of result) {
      expect(point.pending).toBeGreaterThanOrEqual(0);
    }
  });

  it('devuelve array vacío o longitud 0 si now es antes del inicio del turno', () => {
    const beforeShift = new Date(`${TEST_DATE}T06:00:00+12:00`);
    const result = binBacklogSeries({
      fills: [],
      runs: [],
      shiftStart: '07:00',
      now: beforeShift,
    });

    expect(result).toHaveLength(0);
  });
});
