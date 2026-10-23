/**
 * Datos propios de la suite móvil (BD local vía psql). Cada test crea lo que
 * necesita y lo borra al terminar, sin tocar los datos sembrados.
 */
import { execFileSync } from 'child_process';

const DB_URL = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Ejecuta SQL y devuelve las filas (columnas separadas por '|'). */
export function sql(query: string): string[] {
  const out = execFileSync('psql', [DB_URL, '-At', '-v', 'ON_ERROR_STOP=1', '-c', query], {
    encoding: 'utf-8',
  });
  return out
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
}

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

export interface TestPicker {
  id: string;
  code: string;
  orchardId: string;
}

/** Picker de prueba con fichaje de hoy (hora NZ) en el huerto del usuario dado. */
export function createCheckedInPicker(ownerEmail = 'runner@harvestpro.nz'): TestPicker {
  const [orchardId] = sql(`select orchard_id from public.users where email = ${lit(ownerEmail)}`);
  if (!orchardId) throw new Error(`No orchard for ${ownerEmail}`);
  const code = `E2EM${Date.now().toString(36).toUpperCase()}`;
  // psql -c con varias sentencias devuelve solo la salida de la última
  const [id] = sql(
    `insert into public.pickers (picker_id, name, orchard_id, status, safety_verified)
     values (${lit(code)}, ${lit(`E2E Mobile ${code}`)}, ${lit(orchardId)}, 'active', true)
     returning id`
  );
  sql(
    `insert into public.daily_attendance (picker_id, orchard_id, date, check_in, status)
     values (${lit(id)}, ${lit(orchardId)}, (now() at time zone 'Pacific/Auckland')::date, now(), 'present')`
  );
  return { id, code, orchardId };
}

export function bucketCount(pickerId: string): number {
  const [n] = sql(
    `select count(*) from public.bucket_records where picker_id = ${lit(pickerId)} and deleted_at is null`
  );
  return Number(n);
}

/** Borra el picker de prueba y todo lo que cuelga de él. */
export function removePicker(pickerId: string): void {
  const id = lit(pickerId);
  sql(`delete from public.rejected_scans where picker_id = ${id}`);
  sql(`delete from public.bucket_records where picker_id = ${id}`);
  sql(`delete from public.qc_inspections where picker_id = ${id}`);
  sql(`delete from public.daily_attendance where picker_id = ${id}`);
  sql(`delete from public.pickers where id = ${id}`);
}

export function qcInspectionCount(pickerId: string): number {
  const [n] = sql(`select count(*) from public.qc_inspections where picker_id = ${lit(pickerId)}`);
  return Number(n);
}

/**
 * Limpia restos de ejecuciones interrumpidas (pickers E2E Mobile*).
 * Solo los de hace más de 30 min: otra ejecución de la suite (otro worktree,
 * misma BD) puede estar usando los suyos ahora mismo.
 */
export function removeLeftoverPickers(): void {
  const old = sql(
    `select id from public.pickers where picker_id like 'E2EM%' and name like 'E2E Mobile %'
       and created_at < now() - interval '30 minutes'`
  );
  for (const id of old) {
    try {
      removePicker(id);
    } catch {
      // Un escaneo offline puede llegar justo después del borrado: se reintenta en la próxima ejecución
    }
  }
}
