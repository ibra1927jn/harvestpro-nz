/**
 * useLogisticsHealth — Datos derivados para el panel de salud logística del manager.
 *
 * Combina datos del store de cosecha (crew, bucketRecords, settings) con datos
 * del hook useLogistics (bins, history, requests) para derivar métricas puras
 * y el semáforo de salud en tiempo real.
 */
import { useRef, useEffect, useMemo, useState } from 'react';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { useLogistics } from '@/hooks/useLogistics';
import { selectRunners } from '@/services/harvestMetrics/roster';
import {
  binBacklogSeries,
  avgPickupTime,
  avgCycleTime,
  logisticsHealth,
  runnerLeaderboard,
  AMBER_RATIO,
} from '@/services/logisticsMetrics';
import type { BacklogPoint, BinFillEvent, PickupRun, RunnerStats } from '@/services/logisticsMetrics';
import { todayNZST } from '@/utils/nzst';

export interface RecentEvent {
  id: string;
  type: 'pickup_requested' | 'row_blocked' | 'alert';
  label: string;
  at: string; // ISO
}

export interface LogisticsHealthData {
  health: 'green' | 'amber' | 'red';
  backlogSeries: BacklogPoint[];
  avgPickup: number;  // segundos
  avgCycle: number;   // segundos
  runnerLeaderboard: RunnerStats[];
  recentEvents: RecentEvent[];
  isLoading: boolean;
}

export function useLogisticsHealth(): LogisticsHealthData {
  const crew = useHarvestStore(s => s.crew);
  const bucketRecords = useHarvestStore(s => s.bucketRecords);
  const settings = useHarvestStore(s => s.settings);

  const { requests, history, isLoading } = useLogistics();

  // Rastrear minutos sostenidos por encima del umbral ámbar
  const sustainedRef = useRef<number>(0);
  const [sustainedAboveAmberMinutes, setSustainedAboveAmberMinutes] = useState(0);

  // Derivar runners activos del crew
  const runners = useMemo(() => selectRunners(crew).filter(p => p.status === 'active'), [crew]);

  // Derivar BinFillEvents desde bucketRecords
  // Agrupa por bin_id, toma el primer scanned_at o created_at como fill time
  const fills = useMemo((): BinFillEvent[] => {
    const binFirstSeen = new Map<string, string>();

    for (const record of bucketRecords) {
      const binId = record.bin_id;
      if (!binId) continue;

      const ts = record.scanned_at ?? record.created_at ?? '';
      if (!ts) continue;

      const existing = binFirstSeen.get(binId);
      if (!existing || ts < existing) {
        binFirstSeen.set(binId, ts);
      }
    }

    const result: BinFillEvent[] = [];
    for (const [binId, filledAt] of binFirstSeen.entries()) {
      result.push({ binId, filledAt });
    }
    return result;
  }, [bucketRecords]);

  // Derivar PickupRuns sintéticos desde runners (Picker[])
  // Un run sintético por runner activo
  const pickupRuns = useMemo((): PickupRun[] => {
    const today = todayNZST();

    return runners.map((picker): PickupRun => {
      const hasTime = picker.hours > 0;
      const buckets = picker.total_buckets_today;
      const durationSec = hasTime
        ? (picker.hours * 3600) / Math.max(1, buckets)
        : null;

      return {
        id: picker.id,
        runnerId: picker.id,
        runnerName: picker.name,
        requestedAt: `${today}T07:00:00+12:00`,
        completedAt: hasTime ? `${today}T${String(Math.floor(picker.hours + 7)).padStart(2, '0')}:00:00+12:00` : null,
        durationSec,
        binsCount: buckets,
      };
    });
  }, [runners]);

  // Runner throughput per hour: sum of (buckets / max(1, hours)) por runner
  const runnerThroughputPerHour = useMemo(() => {
    return runners.reduce((sum, p) => {
      return sum + p.total_buckets_today / Math.max(1, p.hours);
    }, 0);
  }, [runners]);

  // Backlog actual (último punto de la serie)
  const shiftStart = settings?.shift_start_time ?? '07:00';

  const backlogSeries = useMemo((): BacklogPoint[] => {
    return binBacklogSeries({
      fills,
      runs: pickupRuns,
      shiftStart,
      now: new Date(),
    });
  }, [fills, pickupRuns, shiftStart]);

  const backlogNow = backlogSeries.length > 0
    ? backlogSeries[backlogSeries.length - 1].pending
    : 0;

  // Detectar si el ratio está por encima del umbral ámbar y rastrear sostenimiento
  const currentRatio = runnerThroughputPerHour > 0
    ? backlogNow / runnerThroughputPerHour
    : backlogNow > 0 ? Infinity : 0;

  useEffect(() => {
    const interval = setInterval(() => {
      if (currentRatio >= AMBER_RATIO) {
        sustainedRef.current += 1;
      } else {
        sustainedRef.current = 0;
      }
      setSustainedAboveAmberMinutes(sustainedRef.current);
    }, 60_000);

    return () => clearInterval(interval);
  }, [currentRatio]);

  const health = useMemo(() => logisticsHealth({
    backlogNow,
    runnerThroughputPerHour,
    sustainedAboveAmberMinutes,
  }), [backlogNow, runnerThroughputPerHour, sustainedAboveAmberMinutes]);

  const computedAvgPickup = useMemo(() => avgPickupTime(fills, pickupRuns), [fills, pickupRuns]);
  const computedAvgCycle = useMemo(() => avgCycleTime(pickupRuns), [pickupRuns]);

  const leaderboard = useMemo(() => runnerLeaderboard(pickupRuns), [pickupRuns]);

  // Eventos recientes: últimas 5 requests ordenadas por created_at desc
  const recentEvents = useMemo((): RecentEvent[] => {
    return [...requests]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 5)
      .map((req): RecentEvent => ({
        id: req.id,
        type: 'pickup_requested',
        label: req.requester_name,
        at: req.created_at,
      }));
  }, [requests]);

  // history está disponible para métricas futuras (evita lint warning con void)
  void history;

  return {
    health,
    backlogSeries,
    avgPickup: computedAvgPickup,
    avgCycle: computedAvgCycle,
    runnerLeaderboard: leaderboard,
    recentEvents,
    isLoading,
  };
}
