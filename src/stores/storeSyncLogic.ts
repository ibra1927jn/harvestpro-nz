/**
 * storeSyncLogic — lógica pura de la sincronización del store (sin Supabase).
 *
 * Separada de storeSync.ts para poder probarla sin red: decide delta/full,
 * fusiona cambios, mapea filas del servidor y reconstruye asignaciones.
 */
import type { AttendanceShift, Bin, BucketRecord, Picker, RowAssignment } from '@/types';

/** Picker con el join de daily_attendance y el soft-delete de la consulta */
export interface PickerWithAttendance extends Picker {
  daily_attendance?: (AttendanceShift & { deleted_at?: string | null })[];
  deleted_at?: string | null;
}

/** Fila de daily_attendance tal como llega por realtime */
export interface AttendanceRecord {
  id?: string;
  deleted_at?: string | null;
  picker_id: string;
  date: string;
  check_in: string | null;
  check_out?: string | null;
  break_start?: string | null;
  break_minutes?: number | null;
  orchard_id: string;
}

/** Fila de row_assignments del servidor (consulta o realtime) */
export interface ServerRowAssignment {
  id: string;
  row_number: number;
  side?: string | null;
  assigned_pickers?: string[] | null;
  completion_percentage?: number | null;
  team_leader_id?: string | null;
  status?: string | null;
  deleted_at?: string | null;
}

/** Tramo abierto de un picker en otro huerto */
export interface OpenShiftElsewhere {
  picker_id: string;
  orchard_id: string;
  check_in: string | null;
  orchards: { name: string | null } | null;
}

/** Margen al pedir cambios por delta (evita perder filas por desfase de reloj) */
const DELTA_SAFETY_MS = 120_000;

const NZ_DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' });

/* ── Tramos de hoy ────────────────────────── */

/**
 * Campos de presencia de una persona a partir de sus tramos de hoy en este
 * huerto: el tramo actual es el abierto o, si no hay, el último.
 */
export function attendanceFields(shifts: AttendanceShift[]): Pick<Picker,
  'shifts' | 'checked_in_today' | 'check_in' | 'check_out' | 'break_start' | 'break_minutes'> {
  const list = shifts
    .filter(s => !!s.check_in)
    .sort((a, b) => (a.check_in ?? '').localeCompare(b.check_in ?? ''));
  const current = list.find(s => !s.check_out) ?? list[list.length - 1];
  return {
    shifts: list,
    checked_in_today: list.length > 0,
    check_in: current?.check_in || undefined,
    check_out: current?.check_out || undefined,
    break_start: current?.break_start || undefined,
    break_minutes: current?.break_minutes ?? undefined,
  };
}

/** Picker de la consulta → Picker del store, con sus tramos de hoy no borrados */
export function mapPickerWithAttendance(p: PickerWithAttendance): Picker {
  return {
    ...p,
    ...attendanceFields(
      (p.daily_attendance ?? [])
        .filter(a => !a.deleted_at)
        .map(({ deleted_at: _deleted, ...s }) => s)
    ),
    daily_attendance: undefined,
  } as Picker;
}

/* ── Delta / full ─────────────────────────── */

/**
 * Delta solo si la última sincronización fue HOY (fecha NZ) y las cubetas de
 * hoy ya están en memoria. Las cubetas NO se guardan en el navegador (crew y
 * lastSyncAt sí): tras recargar, el delta (por updated_at) nunca volvía a traer
 * las cubetas de la mañana. Igual al cambiar de día.
 */
export function shouldUseDelta(params: {
  lastSyncAt: string | null | undefined;
  todayNZ: string;
  crewCount: number;
  bucketCount: number;
}): boolean {
  const { lastSyncAt, todayNZ, crewCount, bucketCount } = params;
  const sameNZDay = !!lastSyncAt && NZ_DAY_FMT.format(new Date(lastSyncAt)) === todayNZ;
  return sameNZDay && crewCount > 0 && bucketCount > 0;
}

/** Desde cuándo pedir cambios en modo delta */
export function deltaSinceISO(lastSyncAt: string): string {
  return new Date(new Date(lastSyncAt).getTime() - DELTA_SAFETY_MS).toISOString();
}

/**
 * Medianoche NZ real de `todayNZ`, con el offset NZ actual de `nzNowISO`
 * (salida de toNZST: termina en "+12:00" o "+13:00"). Independiente del
 * timezone del dispositivo.
 */
export function startOfNZDay(todayNZ: string, nzNowISO: string): string {
  return `${todayNZ}T00:00:00${nzNowISO.slice(-6)}`;
}

/** Aplica un delta sobre una lista por id: los marcados como baja salen */
function mergeById<T extends { id: string }, R = T>(
  current: T[],
  incoming: R[],
  opts: { isRemoved: (row: R) => boolean; toItem: (row: R) => T; idOf: (row: R) => string }
): T[] {
  const map = new Map(current.map(item => [item.id, item]));
  for (const row of incoming) {
    if (opts.isRemoved(row)) map.delete(opts.idOf(row));
    else map.set(opts.idOf(row), opts.toItem(row));
  }
  return Array.from(map.values());
}

/** Delta de pickers: bajas y archivados salen de la lista en todos los dispositivos */
export function mergeCrewDelta(crew: Picker[], incoming: PickerWithAttendance[]): Picker[] {
  return mergeById<Picker, PickerWithAttendance>(crew, incoming, {
    isRemoved: p => !!p.deleted_at || p.status === 'archived',
    toItem: mapPickerWithAttendance,
    idOf: p => p.id,
  });
}

/** Delta de cubetas: las borradas salen */
export function mergeBucketDelta(records: BucketRecord[], incoming: BucketRecord[]): BucketRecord[] {
  return mergeById<BucketRecord>(records, incoming, {
    isRemoved: b => !!b.deleted_at,
    toItem: b => b,
    idOf: b => b.id,
  });
}

/* ── Otros huertos ────────────────────────── */

/**
 * Marca quién trabaja ahora en otro huerto. Si está fichado aquí, manda este
 * huerto. Devuelve el mismo objeto cuando no cambia nada (evita re-renders).
 */
export function applyElsewhere(crew: Picker[], elsewhere: OpenShiftElsewhere[]): Picker[] {
  const byPicker = new Map(elsewhere.map(s => [s.picker_id, s]));
  return crew.map(p => {
    const o = byPicker.get(p.id);
    const next = o && !(p.check_in && !p.check_out)
      ? { orchard_id: o.orchard_id, orchard_name: o.orchards?.name ?? 'another orchard', since: o.check_in }
      : null;
    return (p.elsewhere ?? null) === null && next === null ? p : { ...p, elsewhere: next };
  });
}

/* ── Row assignments ──────────────────────── */

/** Fila del servidor → RowAssignment del store (valores por defecto incluidos) */
function mapServerRowAssignment(ra: ServerRowAssignment): RowAssignment {
  return {
    id: ra.id,
    row_number: ra.row_number,
    side: (ra.side as 'north' | 'south') ?? 'north',
    assigned_pickers: ra.assigned_pickers ?? [],
    completion_percentage: ra.completion_percentage ?? 0,
    team_leader_id: ra.team_leader_id ?? null,
  };
}

/**
 * Fallback: reconstruye asignaciones desde crew (current_row) cuando ni el
 * servidor ni el móvil tienen ninguna. Agrupa por equipo y fila; el team
 * leader con fila cuenta en su propio grupo.
 */
export function rebuildRowAssignmentsFromCrew(crew: Picker[]): RowAssignment[] {
  const rowMap = new Map<string, { row: number; pickers: string[] }>();
  const entry = (key: string, row: number) => {
    if (!rowMap.has(key)) rowMap.set(key, { row, pickers: [] });
    return rowMap.get(key)!;
  };
  for (const p of crew) {
    if (p.current_row > 0) {
      const groupKey = p.team_leader_id || p.id;
      entry(`${groupKey}-${p.current_row}`, p.current_row).pickers.push(p.id);
    }
  }
  for (const p of crew) {
    if (p.current_row > 0 && p.role === 'team_leader') {
      const e = entry(`${p.id}-${p.current_row}`, p.current_row);
      if (!e.pickers.includes(p.id)) e.pickers.push(p.id);
    }
  }
  return Array.from(rowMap.values()).map(e => ({
    id: `rebuilt-${e.row}-${e.pickers[0]}`,
    row_number: e.row,
    side: 'north' as const,
    assigned_pickers: e.pickers,
    completion_percentage: 0,
  }));
}

/**
 * Qué hacer con las asignaciones tras pedirlas al servidor:
 * - el servidor tiene activas → mandan las del servidor
 * - el servidor responde sin ninguna y el móvil tenía → caducadas, vaciar
 * - nada en ningún lado → reconstruir desde crew
 * Devuelve null cuando no hay que tocar el store.
 */
export function resolveRowAssignments(params: {
  server: ServerRowAssignment[] | null;
  serverError: boolean;
  existing: RowAssignment[];
  crew: Picker[];
}): RowAssignment[] | null {
  const { server, serverError, existing, crew } = params;
  if (!serverError && server && server.length > 0) return server.map(mapServerRowAssignment);
  if (!serverError && server && existing.length > 0) return [];
  if (existing.length === 0) {
    const rebuilt = rebuildRowAssignmentsFromCrew(crew);
    return rebuilt.length > 0 ? rebuilt : null;
  }
  return null;
}

/**
 * Evento realtime de row_assignments: una borrada o que ya no está activa
 * (movida, terminada) sale de las actuales; si no, upsert.
 */
export function applyRowAssignmentEvent(
  list: RowAssignment[],
  record: ServerRowAssignment,
  eventType: string
): RowAssignment[] {
  if (eventType === 'DELETE' || record.deleted_at || (record.status && record.status !== 'active')) {
    return list.filter(ra => ra.id !== record.id);
  }
  const mapped = mapServerRowAssignment(record);
  return list.some(ra => ra.id === record.id)
    ? list.map(ra => (ra.id === record.id ? mapped : ra))
    : [...list, mapped];
}

/* ── Realtime de fichajes ─────────────────── */

/**
 * Aplica un cambio de daily_attendance a un picker: actualiza (o añade) el
 * tramo; uno borrado sale. Si ficha aquí, deja de estar en otro huerto.
 */
export function applyAttendanceRecord(p: Picker, record: AttendanceRecord): Picker {
  const shift: AttendanceShift = {
    id: record.id,
    orchard_id: record.orchard_id,
    check_in: record.check_in,
    check_out: record.check_out,
    break_start: record.break_start,
    break_minutes: record.break_minutes,
  };
  const others = (p.shifts ?? []).filter(s => !shift.id || s.id !== shift.id);
  const shifts = record.deleted_at ? others : [...others, shift];
  const fields = attendanceFields(shifts);
  const here = !!fields.check_in && !fields.check_out;
  return { ...p, ...fields, ...(here ? { elsewhere: null } : {}) };
}

/* ── Bins ─────────────────────────────────── */

/** Bins del servidor + los dados de alta en el móvil que aún no están allí */
export function mergeBins(serverBins: Bin[], local: Bin[] | undefined): Bin[] {
  const serverIds = new Set(serverBins.map(b => b.id));
  const localOnly = (local || []).filter(b => !serverIds.has(b.id) && b.bin_code);
  return [...serverBins, ...localOnly];
}
