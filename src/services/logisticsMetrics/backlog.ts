/**
 * logisticsMetrics/backlog.ts — Serie temporal de cubetas pendientes por hora de turno.
 *
 * Módulo puro sin React. Usa buildShiftSlotsUntilNow de @/utils/time.
 */
import { buildShiftSlotsUntilNow } from '@/utils/time';

// ── Tipos compartidos del módulo ──────────────────────────────────────────────

export interface BinFillEvent {
  binId: string;
  filledAt: string; // ISO timestamp
}

export interface PickupRun {
  id: string;
  runnerId: string;
  runnerName: string;
  requestedAt: string;  // ISO — cuando se solicitó el pickup
  completedAt: string | null; // ISO — null si aún en progreso
  durationSec: number | null; // null si no completado
  binsCount: number;
}

export interface BacklogPoint {
  hour: number;  // 0–23
  pending: number;
}

export interface RunnerStats {
  runnerId: string;
  name: string;
  cyclesToday: number;
  avgCycleSec: number;
}

// ── Función principal ─────────────────────────────────────────────────────────

/**
 * binBacklogSeries — conteo acumulado de cubetas pendientes de pickup por hora del turno.
 * Usa el mismo stream de BucketRecord que harvestMetrics (sin rutas de datos nuevas).
 */
export function binBacklogSeries(params: {
  fills: BinFillEvent[];
  runs: PickupRun[];
  shiftStart: string; // "07:00"
  now: Date;
}): BacklogPoint[] {
  const { fills, runs, shiftStart, now } = params;

  // Tramos desde el inicio de turno hasta la hora actual (no hay hora de fin de turno)
  const allSlots = buildShiftSlotsUntilNow(shiftStart, now);

  // Filtrar solo slots que ya comenzaron (slotStartMs <= now)
  const nowMs = now.getTime();
  const activeSlots = allSlots.filter(s => s.slotStartMs <= nowMs);

  if (activeSlots.length === 0) return [];

  let pendingRunning = 0;
  const series: BacklogPoint[] = [];

  for (const slot of activeSlots) {
    // Cubetas llenadas en este slot
    const fillsInSlot = fills.filter(f => {
      const ts = new Date(f.filledAt).getTime();
      return ts >= slot.slotStartMs && ts < slot.slotEndMs;
    }).length;

    // Pickups completados en este slot (cada run aporta binsCount cubetas recogidas)
    const pickupsInSlot = runs
      .filter(r => {
        if (!r.completedAt) return false;
        const ts = new Date(r.completedAt).getTime();
        return ts >= slot.slotStartMs && ts < slot.slotEndMs;
      })
      .reduce((sum, r) => sum + r.binsCount, 0);

    // Acumular: nunca negativo
    pendingRunning = Math.max(0, pendingRunning + fillsInSlot - pickupsInSlot);
    series.push({ hour: slot.hour, pending: pendingRunning });
  }

  return series;
}
