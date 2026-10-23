/**
 * harvestMetrics/projection.ts — Horas de turno transcurridas
 *
 * Pure helper — sin React. La proyección «a fin de día» se quitó el 2026-10-21:
 * no hay hora de fin de turno (cada equipo y runner acaba cuando acaba).
 */
import { getNZShiftBoundaryMs } from '@/utils/time';

/**
 * Calcula las horas de turno transcurridas desde shiftStart hasta now.
 * Nunca negativo.
 */
export function computeHoursElapsed(
    shiftStartHHMM: string,
    now: Date = new Date()
): number {
    const shiftStartMs = getNZShiftBoundaryMs(shiftStartHHMM, now);
    const nowMs = now.getTime();
    return Math.max(0, (nowMs - shiftStartMs) / 3_600_000);
}
