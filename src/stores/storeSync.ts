/**
 * storeSync — Sync logic extracted from useHarvestStore
 *   hydrateFromRecovery    — Recover crash-saved buckets from localStorage
 *   hydrateFromDexie       — Recover pending buckets from IndexedDB
 *   fetchOrchardData       — Delta/full sync with Supabase
 *   setupRealtimeSubscriptions — Supabase real-time channels
 */
import { supabase } from '@/services/supabase';
import { offlineService } from '@/services/offline.service';
import { logger } from '@/utils/logger';
import { todayNZST, toNZST } from '@/utils/nzst';
import { fetchAllRows } from '@/utils/fetchAllRows';
import { BucketRecord, Picker } from '@/types';
import type { HarvestStoreState, ScannedBucket } from './storeTypes';
import { storeSyncRepository } from '@/repositories/store-sync.repository';

export type StoreSetter = (
  partial: Partial<HarvestStoreState> | ((state: HarvestStoreState) => Partial<HarvestStoreState>)
) => void;
export type StoreGetter = () => HarvestStoreState;

/** Picker row extended with attendance join + soft-delete field from Supabase query */
interface PickerWithAttendance extends Picker {
  daily_attendance?: {
    check_in: string | null;
    check_out?: string | null;
    break_start?: string | null;
    break_minutes?: number | null;
  }[];
  deleted_at?: string | null;
}

/** Realtime attendance payload from Supabase channel */
interface AttendanceRecord {
  picker_id: string;
  date: string;
  check_in: string | null;
  orchard_id: string;
}

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

export async function fetchOrchardData(
  get: StoreGetter,
  set: StoreSetter,
  orchardId?: string | null
): Promise<{ id: string; name?: string; total_rows?: number } | null> {
  const state = get();
  const lastSync = state.lastSyncAt;
  const now = new Date().toISOString();

  // Delta solo si la última sincronización fue HOY (fecha NZ) y las cubetas de
  // hoy ya están en memoria. Las cubetas NO se guardan en el navegador (crew y
  // lastSyncAt sí): tras recargar la página, el delta (filtrado por updated_at)
  // nunca volvía a traer las cubetas de la mañana y el panel se quedaba en 0.
  // Igual al cambiar de día: el store tendría cubetas y fichajes de ayer.
  const sameNZDay =
    !!lastSync &&
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date(lastSync)) ===
      todayNZST();
  const useDelta = sameNZDay && state.crew.length > 0 && state.bucketRecords.length > 0;

  // Huerto pedido (el del usuario, desde OrchardDataBootstrap); si no se pasa,
  // el que ya está cargado (refrescos tras una acción); solo en último caso el primero.
  const targetOrchardId = orchardId ?? state.orchard?.id;
  let activeOrchard: { id: string; name?: string; total_rows?: number } | null = null;
  if (targetOrchardId) {
    const { data } = await supabase.from('orchards').select('*').eq('id', targetOrchardId).single();
    activeOrchard = data;
  }
  if (!activeOrchard) {
    activeOrchard = await storeSyncRepository.getFirstOrchard();
  }

  const settings = activeOrchard ? await storeSyncRepository.getSettings(activeOrchard.id) : null;

  set({ orchard: activeOrchard, settings: settings || state.settings });

  // Pickers + Attendance
  const today = todayNZST();
  // Medianoche NZ real — independiente del timezone del dispositivo.
  // toNZST(new Date()) devuelve el offset correcto (+12:00 NZST o +13:00 NZDT).
  // d.setHours(0,0,0,0) usaba medianoche local → en timezone negativo (ej. UTC-3)
  // el corte caía a las 15:00 NZ, perdiendo registros de la mañana NZ.
  const nzOffset = toNZST(new Date()).slice(-6); // "+12:00" o "+13:00"
  const startOfDayNZ = `${today}T00:00:00${nzOffset}`;

  const mapPickerWithAttendance = (p: PickerWithAttendance): Picker =>
    ({
      ...p,
      checked_in_today: !!p.daily_attendance?.[0]?.check_in,
      check_in: p.daily_attendance?.[0]?.check_in || undefined,
      check_out: p.daily_attendance?.[0]?.check_out || undefined,
      break_start: p.daily_attendance?.[0]?.break_start || undefined,
      break_minutes: p.daily_attendance?.[0]?.break_minutes ?? undefined,
      daily_attendance: undefined,
    }) as Picker;

  try {
    let pickersQuery = storeSyncRepository.getPickersQuery(activeOrchard?.id ?? '', today);

    let bucketsQuery = storeSyncRepository.getBucketRecordsQuery(
      activeOrchard?.id ?? '',
      startOfDayNZ
    );

    if (useDelta) {
      const safeSyncDate = new Date(new Date(lastSync!).getTime() - 120_000).toISOString();
      pickersQuery = pickersQuery.gte('updated_at', safeSyncDate);
      bucketsQuery = bucketsQuery.gte('updated_at', safeSyncDate);
      logger.info(`[Sync] Delta mode: fetching changes since ${safeSyncDate}`);
    } else {
      pickersQuery = pickersQuery.is('deleted_at', null);
      bucketsQuery = bucketsQuery.is('deleted_at', null);
      logger.info('[Sync] Full mode: downloading all active records');
    }

    // Carga completa por páginas: un día con mucha cuadrilla pasa de las 1000
    // filas que devuelve PostgREST por petición.
    const bucketsPromise = useDelta
      ? bucketsQuery
      : fetchAllRows<BucketRecord>((from, to) =>
          storeSyncRepository
            .getBucketRecordsQuery(activeOrchard?.id ?? '', startOfDayNZ)
            .is('deleted_at', null)
            .order('id')
            .range(from, to)
        ).then(data => ({ data, error: null }));
    const [pickersRes, bucketsRes] = await Promise.all([pickersQuery, bucketsPromise]);
    if (pickersRes.error) throw pickersRes.error;
    if (bucketsRes.error) throw bucketsRes.error;

    if (useDelta) {
      const crewMap = new Map(state.crew.map((p: Picker) => [p.id, p]));
      pickersRes.data.forEach((p: PickerWithAttendance) => {
        if (p.deleted_at) crewMap.delete(p.id);
        else crewMap.set(p.id, mapPickerWithAttendance(p));
      });
      const bucketsMap = new Map(state.bucketRecords.map((b: BucketRecord) => [b.id, b]));
      bucketsRes.data.forEach((b: BucketRecord) => {
        if (b.deleted_at) bucketsMap.delete(b.id);
        else bucketsMap.set(b.id, b);
      });
      set({
        crew: Array.from(crewMap.values()),
        bucketRecords: Array.from(bucketsMap.values()),
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
  } catch (syncError) {
    logger.warn('[Sync] Delta/full sync failed — falling back to simple fetch:', syncError);
    const [pickersRes, bucketsRes] = await Promise.all([
      storeSyncRepository.getPickersQuery(activeOrchard?.id ?? '', today),
      storeSyncRepository.getBucketRecordsQuery(activeOrchard?.id ?? '', startOfDayNZ),
    ]);
    const crewWithAttendance = pickersRes.data?.map(mapPickerWithAttendance) || [];
    set({ crew: crewWithAttendance, bucketRecords: bucketsRes.data || [], lastSyncAt: null });
    logger.info(
      `[Sync] Fallback load: ${crewWithAttendance.length} pickers, ${(bucketsRes.data || []).length} buckets`
    );
  }

  // Fetch blocks
  if (activeOrchard?.id) await get().fetchBlocks(activeOrchard.id);

  // Recuperar row assignments del servidor si el store esta vacio
  const existingAssignments = get().rowAssignments;
  if (existingAssignments.length === 0 && activeOrchard?.id) {
    const { data: serverAssignments, error: raError } = await supabase
      .from('row_assignments')
      .select('id, row_number, side, assigned_pickers, completion_percentage')
      .eq('orchard_id', activeOrchard.id)
      .eq('status', 'active')
      .is('deleted_at', null);

    if (!raError && serverAssignments && serverAssignments.length > 0) {
      // Usar datos reales del servidor, preservando el side correcto
      const rebuiltAssignments = serverAssignments.map(ra => ({
        id: ra.id as string,
        row_number: ra.row_number as number,
        side: (ra.side as 'north' | 'south') ?? 'north',
        assigned_pickers: (ra.assigned_pickers as string[]) ?? [],
        completion_percentage: (ra.completion_percentage as number) ?? 0,
      }));
      set({ rowAssignments: rebuiltAssignments });
      logger.info(`[Store] Loaded ${rebuiltAssignments.length} row assignments from server`);
    } else {
      // Fallback: reconstruir desde crew data si el servidor no tiene registros
      const crewList = get().crew;
      const rowMap = new Map<string, { row: number; pickers: string[] }>();
      for (const p of crewList as Picker[]) {
        if (p.current_row > 0) {
          const groupKey = p.team_leader_id || p.id;
          const mapKey = `${groupKey}-${p.current_row}`;
          if (!rowMap.has(mapKey)) rowMap.set(mapKey, { row: p.current_row, pickers: [] });
          rowMap.get(mapKey)!.pickers.push(p.id);
        }
      }
      for (const p of crewList as Picker[]) {
        if (p.current_row > 0 && p.role === 'team_leader') {
          const mapKey = `${p.id}-${p.current_row}`;
          if (!rowMap.has(mapKey)) rowMap.set(mapKey, { row: p.current_row, pickers: [] });
          if (!rowMap.get(mapKey)!.pickers.includes(p.id)) rowMap.get(mapKey)!.pickers.push(p.id);
        }
      }
      const rebuiltAssignments = Array.from(rowMap.values()).map(entry => ({
        id: `rebuilt-${entry.row}-${entry.pickers[0]}`,
        row_number: entry.row,
        side: 'north' as const,
        assigned_pickers: entry.pickers,
        completion_percentage: 0,
      }));
      if (rebuiltAssignments.length > 0) {
        set({ rowAssignments: rebuiltAssignments });
        logger.info(`[Store] Rebuilt ${rebuiltAssignments.length} row assignments from crew data (fallback)`);
      }
    }
  } else if (existingAssignments.length > 0) {
    logger.info(`[Store] Using ${existingAssignments.length} persisted row assignments`);
  }

  return activeOrchard;
}

/* ── Realtime Subscriptions ─────────────── */

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
              p.id === attendanceRecord.picker_id
                ? {
                    ...p,
                    checked_in_today: !!attendanceRecord.check_in,
                    check_in: attendanceRecord.check_in || undefined,
                  }
                : p
            ),
          }));
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
          ].slice(0, 10),
        }));
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'timesheets', filter: `orchard_id=eq.${orchardId}` },
      payload => {
        if (document.hidden) return;
        set(state => ({
          recentTimesheetUpdates: [
            payload.new as Record<string, unknown>,
            ...state.recentTimesheetUpdates,
          ].slice(0, 10),
        }));
      }
    )
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
        const record = payload.new as {
          id: string;
          row_number: number;
          side: string;
          assigned_pickers: string[];
          completion_percentage: number;
          status: string;
          deleted_at: string | null;
        };

        if (!record?.id) return;

        set(state => {
          // DELETE o soft-delete: eliminar del store local
          if (payload.eventType === 'DELETE' || record.deleted_at || record.status === 'completed') {
            if (payload.eventType === 'DELETE' || record.deleted_at) {
              return {
                rowAssignments: state.rowAssignments.filter(ra => ra.id !== record.id),
              };
            }
          }

          // INSERT o UPDATE: upsert en store local
          const exists = state.rowAssignments.some(ra => ra.id === record.id);
          const mapped = {
            id: record.id,
            row_number: record.row_number,
            side: (record.side as 'north' | 'south') ?? 'north',
            assigned_pickers: record.assigned_pickers ?? [],
            completion_percentage: record.completion_percentage ?? 0,
          };

          if (exists) {
            return {
              rowAssignments: state.rowAssignments.map(ra =>
                ra.id === record.id ? mapped : ra
              ),
            };
          }

          return {
            rowAssignments: [...state.rowAssignments, mapped],
          };
        });
        logger.info(`[Store] Realtime row_assignment ${payload.eventType}: row ${record.row_number}`);
      }
    )
    .subscribe(status => logger.info(`[Store] Realtime subscription: ${status}`));
}

