/**
 * storeSync — Sync logic extracted from useHarvestStore (I/O: Supabase, Dexie)
 *   La lógica pura (delta, fusiones, mapeos) está en storeSyncLogic.ts
 *   hydrateFromRecovery    — Recover crash-saved buckets from localStorage
 *   hydrateFromDexie       — Recover pending buckets from IndexedDB
 *   fetchOrchardData       — Delta/full sync with Supabase
 *   setupRealtimeSubscriptions — Supabase real-time channels
 */
import { supabase } from '@/services/supabase';
import { offlineService } from '@/services/offline.service';
import { logger } from '@/utils/logger';
import { todayNZST, nzMidnight } from '@/utils/nzst';
import { fetchAllRows } from '@/utils/fetchAllRows';
import type { BucketRecord } from '@/types';
import type { HarvestStoreState, ScannedBucket } from './storeTypes';
import { storeSyncRepository } from '@/repositories/store-sync.repository';
import { pieceRatesRepository } from '@/repositories/piece-rates.repository';
import { pieceRateOn } from '@/services/harvestMetrics/pay';
import {
  applyAttendanceRecord,
  applyElsewhere,
  applyRowAssignmentEvent,
  deltaSinceISO,
  mapPickerWithAttendance,
  mergeBins,
  mergeBucketDelta,
  mergeCrewDelta,
  resolveRowAssignments,
  shouldUseDelta,
  type AttendanceRecord,
  type PickerWithAttendance,
  type ServerRowAssignment,
} from './storeSyncLogic';

// Compatibilidad: attendanceFields vivía aquí
export { attendanceFields } from './storeSyncLogic';

export type StoreSetter = (
  partial: Partial<HarvestStoreState> | ((state: HarvestStoreState) => Partial<HarvestStoreState>)
) => void;
export type StoreGetter = () => HarvestStoreState;

/* ── Hydration ────────────────────────────── */

export function hydrateFromRecovery(set: StoreSetter): void {
  try {
    const recoveryData = localStorage.getItem('harvest-pro-recovery');
    if (recoveryData) {
      const parsed = JSON.parse(recoveryData);
      const recoveredBuckets = parsed?.state?.buckets || [];
      if (recoveredBuckets.length > 0) {
        set(state => {
          const existingIds = new Set(state.buckets.map(b => b.id));
          const uniqueRecovered = recoveredBuckets.filter(
            (b: ScannedBucket) => !existingIds.has(b.id)
          );
          if (uniqueRecovered.length > 0) {
            logger.info(`[Store] Recovered ${uniqueRecovered.length} buckets from crash backup`);
            return { buckets: [...uniqueRecovered, ...state.buckets] };
          }
          return state;
        });
      }
      localStorage.removeItem('harvest-pro-recovery');
      logger.info('[Store] Recovery data consumed and cleared');
    }
  } catch (e) {
    logger.error('[Store] Failed to hydrate from recovery:', e);
    localStorage.removeItem('harvest-pro-recovery');
  }
}

export async function hydrateFromDexie(set: StoreSetter): Promise<void> {
  try {
    const pendingBuckets = await offlineService.getPendingBuckets();
    if (pendingBuckets && pendingBuckets.length > 0) {
      set(state => {
        const existingIds = new Set(state.buckets.map(b => b.id));
        const uniquePending = pendingBuckets
          .filter(b => !existingIds.has(String(b.id)))
          .map(pb => ({ ...pb, id: String(pb.id), synced: false }));
        if (uniquePending.length > 0) {
          logger.info(`[Store] Hydrated ${uniquePending.length} pending buckets from Dexie`);
          return { buckets: [...uniquePending, ...state.buckets] };
        }
        return state;
      });
    }
  } catch (e) {
    logger.error('[Store] Failed to hydrate from Dexie:', e);
  }
}

/* ── Fetch Orchard Data (Delta/Full Sync) ── */

/**
 * Huerto y día cuyas cubetas ya están en memoria en esta sesión (no se guarda
 * en el navegador: tras recargar la app hay que volver a bajarlas).
 */
let bucketsLoadedKey: string | null = null;

/** Cada cuánto, como mucho, se vuelven a pedir los bins al desbloquear el móvil */
export const BINS_REFRESH_MS = 5 * 60_000;
let binsLoadedAt = 0;

export async function fetchOrchardData(
  get: StoreGetter,
  set: StoreSetter,
  orchardId?: string | null,
  opts: { catchUp?: boolean } = {}
): Promise<{ id: string; name?: string; total_rows?: number } | null> {
  const state = get();
  const lastSync = state.lastSyncAt;
  const now = new Date().toISOString();
  const today = todayNZST();
  const useDelta = shouldUseDelta({
    lastSyncAt: lastSync,
    todayNZ: today,
    crewCount: state.crew.length,
    bucketCount: state.bucketRecords.length,
    bucketsLoaded: bucketsLoadedKey === `${orchardId ?? state.orchard?.id ?? ''}|${today}`,
  });

  // Al desbloquear el móvil (catchUp) solo se pide lo que cambia durante el día:
  // huerto, ajustes de pago y bloques/filas ya están en memoria. En el campo el
  // teléfono se bloquea y desbloquea decenas de veces al día y cada vez se
  // repetían 11 consultas (prueba de carga 2026-10-21).
  const light = !!opts.catchUp && useDelta && !!state.orchard?.id && !orchardId;
  let activeOrchard: ActiveOrchard;
  if (light) {
    activeOrchard = state.orchard as ActiveOrchard;
  } else {
    activeOrchard = await loadActiveOrchard(orchardId ?? state.orchard?.id);
    const settings = activeOrchard ? await storeSyncRepository.getSettings(activeOrchard.id) : null;
    set({ orchard: activeOrchard, settings: settings || state.settings });
  }

  // Medianoche NZ real (desfase vigente a medianoche: el día del cambio de
  // hora no es el de ahora), independiente del timezone del dispositivo
  const startOfDayNZ = nzMidnight(today);
  const orchardKey = activeOrchard?.id ?? '';

  try {
    await loadCrewAndBuckets({ state, set, orchardKey, today, startOfDayNZ, useDelta, lastSync, now });
    bucketsLoadedKey = `${orchardKey}|${today}`;
  } catch (syncError) {
    logger.warn('[Sync] Delta/full sync failed — falling back to simple fetch:', syncError);
    const [pickersRes, bucketsData] = await Promise.all([
      storeSyncRepository.getPickersQuery(orchardKey, today),
      fetchAllRows<BucketRecord>((from, to) =>
        storeSyncRepository.getBucketRecordsQuery(orchardKey, startOfDayNZ).order('id').range(from, to)
      ).catch(() => [] as BucketRecord[]),
    ]);
    const crewWithAttendance = pickersRes.data?.map(mapPickerWithAttendance) || [];
    set({ crew: crewWithAttendance, bucketRecords: bucketsData, lastSyncAt: null });
    logger.info(
      `[Sync] Fallback load: ${crewWithAttendance.length} pickers, ${bucketsData.length} buckets`
    );
  }

  if (activeOrchard?.id) {
    await loadShiftsElsewhere(set, activeOrchard.id, today);
    if (!light) await get().fetchBlocks(activeOrchard.id);
    await loadRowAssignments(get, set, activeOrchard.id);
    // Bins: al desbloquear solo si hace más de BINS_REFRESH_MS (los bins no
    // llegan por realtime y cambian poco; era la consulta que más datos bajaba
    // de cada team leader en la prueba de carga de temporada)
    if (!light || Date.now() - binsLoadedAt > BINS_REFRESH_MS) {
      await loadBins(set, activeOrchard.id);
      binsLoadedAt = Date.now();
    }
  } else if (get().rowAssignments.length > 0) {
    logger.info(`[Store] Using ${get().rowAssignments.length} persisted row assignments`);
  }

  return activeOrchard;
}

type ActiveOrchard = { id: string; name?: string; total_rows?: number } | null;

/**
 * Huerto pedido (el del usuario, desde OrchardDataBootstrap); si no se pasa,
 * el que ya está cargado (refrescos tras una acción); solo en último caso el primero.
 */
async function loadActiveOrchard(targetOrchardId: string | undefined | null): Promise<ActiveOrchard> {
  let activeOrchard: ActiveOrchard = null;
  if (targetOrchardId) {
    const { data } = await supabase.from('orchards').select('*').eq('id', targetOrchardId).single();
    activeOrchard = data;
  }
  return activeOrchard ?? (await storeSyncRepository.getFirstOrchard());
}

/** Pickers con sus fichajes de hoy + cubetas de hoy, por delta o carga completa */
async function loadCrewAndBuckets(p: {
  /** Estado al empezar la sincronización: base del delta */
  state: HarvestStoreState;
  set: StoreSetter;
  orchardKey: string;
  today: string;
  startOfDayNZ: string;
  useDelta: boolean;
  lastSync: string | null | undefined;
  now: string;
}): Promise<void> {
  const { state, set, orchardKey, today, startOfDayNZ, useDelta, lastSync, now } = p;
  let pickersQuery = storeSyncRepository.getPickersQuery(orchardKey, today, { onlyStaff: !useDelta });

  if (useDelta) {
    const safeSyncDate = deltaSinceISO(lastSync!);
    pickersQuery = pickersQuery.gte('updated_at', safeSyncDate);
    logger.info(`[Sync] Delta mode: fetching changes since ${safeSyncDate}`);
  } else {
    pickersQuery = pickersQuery.is('deleted_at', null);
    logger.info('[Sync] Full mode: downloading all active records');
  }

  // Por páginas, también el delta: PostgREST devuelve como mucho 1000 filas por
  // petición. Un móvil que estuvo bloqueado una hora en un huerto que hace
  // ~400 cubetas/h pedía un delta de más de 1000 y el resto se perdía sin aviso
  // (prueba de carga 2026-10-21).
  const bucketsPromise = useDelta
    ? fetchAllRows<BucketRecord>((from, to) =>
        storeSyncRepository
          .getBucketRecordsQuery(orchardKey, startOfDayNZ)
          .gte('updated_at', deltaSinceISO(lastSync!))
          .order('id')
          .range(from, to)
      ).then(data => ({ data, error: null }))
    : fetchAllRows<BucketRecord>((from, to) =>
        storeSyncRepository
          .getBucketRecordsQuery(orchardKey, startOfDayNZ)
          .is('deleted_at', null)
          .order('id')
          .range(from, to)
      ).then(data => ({ data, error: null }));
  const [pickersRes, bucketsRes] = await Promise.all([pickersQuery, bucketsPromise]);
  if (pickersRes.error) throw pickersRes.error;
  if (bucketsRes.error) throw bucketsRes.error;

  if (useDelta) {
    set({
      crew: mergeCrewDelta(state.crew, pickersRes.data as PickerWithAttendance[]),
      bucketRecords: mergeBucketDelta(state.bucketRecords, bucketsRes.data as BucketRecord[]),
      lastSyncAt: now,
    });
    logger.info(
      `[Sync] Delta applied: ${pickersRes.data.length} pickers, ${bucketsRes.data.length} buckets`
    );
  } else {
    const crewWithAttendance = pickersRes.data?.map(mapPickerWithAttendance) || [];
    set({ crew: crewWithAttendance, bucketRecords: bucketsRes.data || [], lastSyncAt: now });
    logger.info(
      `[Sync] Full load: ${crewWithAttendance.length} pickers, ${(bucketsRes.data || []).length} buckets`
    );
  }
}

/** Quién está trabajando ahora en otro huerto (la gente rota entre huertos) */
async function loadShiftsElsewhere(set: StoreSetter, orchardId: string, today: string): Promise<void> {
  try {
    const elsewhere = await storeSyncRepository.getOpenShiftsElsewhere(orchardId, today);
    set(s => ({ crew: applyElsewhere(s.crew, elsewhere) }));
  } catch (e) {
    logger.warn('[Sync] Could not load shifts in other orchards:', e);
  }
}

/**
 * Row assignments: el servidor manda (antes solo se pedían si el móvil no
 * tenía ninguna guardada, y el team leader no veía las nuevas)
 */
async function loadRowAssignments(get: StoreGetter, set: StoreSetter, orchardId: string): Promise<void> {
  const existing = get().rowAssignments;
  const { data, error } = await supabase
    .from('row_assignments')
    .select('id, row_number, side, assigned_pickers, completion_percentage, team_leader_id')
    .eq('orchard_id', orchardId)
    .eq('status', 'active')
    .is('deleted_at', null);

  const server = (data as ServerRowAssignment[] | null) ?? null;
  const next = resolveRowAssignments({ server, serverError: !!error, existing, crew: get().crew });
  if (next === null) return;
  set({ rowAssignments: next });
  if (!error && server && server.length > 0) {
    logger.info(`[Store] Loaded ${next.length} row assignments from server`);
  } else if (next.length > 0) {
    logger.info(`[Store] Rebuilt ${next.length} row assignments from crew data (fallback)`);
  }
}

/**
 * Bins del huerto (escaneo de bins del runner y panel de Logística).
 * Se conservan los dados de alta en el móvil que aún no estén en el servidor.
 */
async function loadBins(set: StoreSetter, orchardId: string): Promise<void> {
  try {
    // Import diferido: el store no arrastra el servicio de bins al cargarse
    const { binService } = await import('@/services/bin.service');
    const bins = await binService.getBins(orchardId);
    set(state => ({ inventory: mergeBins(bins, state.inventory) }));
  } catch (e) {
    logger.warn('[Store] Could not load bins:', e);
  }
}

/* ── Realtime Subscriptions ─────────────── */

/**
 * Vuelve a leer los precios por cubeta que valen hoy (piece_rates) y los pone
 * en los ajustes del store: el TL y el runner ven el precio nuevo sin recargar.
 * Se relee en vez de aplicar el evento: al borrar el precio de hoy vuelve a
 * valer el anterior, que no viene en el evento.
 */
export async function refreshTodayPieceRates(orchardId: string, get: StoreGetter, set: StoreSetter): Promise<void> {
  const today = todayNZST();
  try {
    const rates = await pieceRatesRepository.loadRange(today, today, orchardId);
    if (get().orchard?.id !== orchardId) return;
    set(state => ({
      settings: {
        ...state.settings,
        piece_rates: rates,
        piece_rate: pieceRateOn(rates, orchardId, null, today, state.settings.piece_rate),
      },
    }));
    get().recalculateIntelligence();
  } catch (e) {
    logger.warn('[Store] Could not refresh piece rates:', e);
  }
}

export function setupRealtimeSubscriptions(
  orchardId: string,
  get: StoreGetter,
  set: StoreSetter
): void {
  logger.info('[Store] Setting up real-time subscriptions (single channel)...');
  // Elimina solo el canal harvest-live anterior — removeAllChannels() destruía el canal de
  // MessagingContext ('public:broadcasts'), dejándolo sin suscripción activa silenciosamente
  const existingChannels = supabase.getChannels();
  existingChannels
    .filter(ch => ch.topic.includes(`harvest-live-${orchardId}`))
    .forEach(ch => supabase.removeChannel(ch));
  logger.info('[CONN-TRACE] setupRealtimeSubscriptions — WebSocket (no consume connection pool)');

  supabase
    .channel(`harvest-live-${orchardId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'bucket_records',
        filter: `orchard_id=eq.${orchardId}`,
      },
      payload => {
        if (document.hidden) return;
        logger.info('[Store] Real-time bucket record received');
        set(state => {
          const newRecord = payload.new as BucketRecord;
          if (state.bucketRecords.some(b => b.id === newRecord.id)) return state;
          return { bucketRecords: [newRecord, ...state.bucketRecords] };
        });
        get().recalculateIntelligence();
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'daily_attendance',
        filter: `orchard_id=eq.${orchardId}`,
      },
      payload => {
        if (document.hidden) return;
        const todayStr = todayNZST();
        const attendanceRecord = payload.new as AttendanceRecord;
        if (attendanceRecord && attendanceRecord.date === todayStr) {
          set(state => ({
            crew: state.crew.map(p =>
              p.id === attendanceRecord.picker_id ? applyAttendanceRecord(p, attendanceRecord) : p
            ),
          }));
          // Horas y pago de hoy al instante (salida o descanso corregidos)
          get().recalculateIntelligence();
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'qc_inspections',
        filter: `orchard_id=eq.${orchardId}`,
      },
      payload => {
        if (document.hidden) return;
        set(state => ({
          recentQcInspections: [
            payload.new as Record<string, unknown>,
            ...state.recentQcInspections,
          ].slice(0, 50),
        }));
      }
    )
    // (Sin 'timesheets': esa tabla no existe y una suscripción a una tabla
    //  inexistente dejaba el canal entero mudo — ni cubetas ni fichajes en vivo)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'row_assignments',
        filter: `orchard_id=eq.${orchardId}`,
      },
      payload => {
        // Realtime: Team Leader recibe row assignments del Manager inmediatamente
        if (document.hidden) return;
        const record = payload.new as ServerRowAssignment;
        if (!record?.id) return;

        set(state => ({
          rowAssignments: applyRowAssignmentEvent(state.rowAssignments, record, payload.eventType),
        }));
        logger.info(`[Store] Realtime row_assignment ${payload.eventType}: row ${record.row_number}`);
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'piece_rates',
        filter: `orchard_id=eq.${orchardId}`,
      },
      () => {
        // El manager cambió el precio de hoy (raro y barato: también en segundo plano,
        // porque al volver a la app la sincronización ligera no relee los ajustes)
        logger.info('[Store] Realtime piece_rates change');
        void refreshTodayPieceRates(orchardId, get, set);
      }
    )
    .subscribe(status => logger.info(`[Store] Realtime subscription: ${status}`));
}

