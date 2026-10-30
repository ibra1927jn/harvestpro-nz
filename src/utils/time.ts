/**
 * utils/time.ts — Utilidades de tiempo para NZ timezone
 *
 * Pure helpers (sin React) para formatear horas y construir
 * límites de turno en Pacific/Auckland.
 */

const NZ_TZ = 'Pacific/Auckland';

/**
 * Formatea una hora (0-23) como etiqueta para el eje X (p.ej. "07", "14").
 */
export function formatHourLabel(hour: number): string {
    return String(hour).padStart(2, '0');
}

/**
 * Extrae el offset NZ actual ("+12:00" o "+13:00") de un Date.
 */
function getNZOffset(date: Date): string {
    const nowStr = toNZISO(date);
    return nowStr.slice(-6);
}

/**
 * Convierte un Date a string ISO con offset NZ (sin fracción de segundo).
 * Ejemplo: "2026-04-14T10:58:00+12:00"
 */
export function toNZISO(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: NZ_TZ,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
    }).formatToParts(date);
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
    const iso = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;

    const nzParts2 = new Intl.DateTimeFormat('en-US', {
        timeZone: NZ_TZ,
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: false,
    }).formatToParts(date);
    const nzGet = (t: string) => parseInt(nzParts2.find(p => p.type === t)?.value ?? '0');
    // Usar Date.UTC (no el constructor local) para que el offset sea correcto
    // independientemente del timezone de la máquina.
    const nzAsUtcMs = Date.UTC(nzGet('year'), nzGet('month') - 1, nzGet('day'), nzGet('hour'), nzGet('minute'), nzGet('second'));
    const offsetH = Math.round((nzAsUtcMs - date.getTime()) / 3_600_000);
    const offsetStr = `+${String(offsetH).padStart(2, '0')}:00`;

    return `${iso}${offsetStr}`;
}

/**
 * Retorna la hora actual en NZ (0-23).
 */
export function getNZHour(date: Date = new Date()): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: NZ_TZ, hour: 'numeric', hour12: false,
    }).formatToParts(date);
    return parseInt(parts.find(p => p.type === 'hour')?.value ?? '0');
}

/**
 * Retorna el minuto actual en NZ (0-59).
 */
export function getNZMinute(date: Date = new Date()): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: NZ_TZ, minute: '2-digit', hour12: false,
    }).formatToParts(date);
    return parseInt(parts.find(p => p.type === 'minute')?.value ?? '0');
}

/**
 * Construye un timestamp (ms UTC) para hoy a HH:MM en NZ.
 * Ejemplo: hhMM="07:00" → medianoche + 7h en NZ timezone.
 */
export function getNZShiftBoundaryMs(hhMM: string, ref: Date = new Date()): number {
    const offset = getNZOffset(ref);
    const nzIso = toNZISO(ref);
    const dateStr = nzIso.slice(0, 10); // "YYYY-MM-DD"
    return new Date(`${dateStr}T${hhMM}:00${offset}`).getTime();
}

/**
 * Genera los slots de hora para una ventana de turno [shiftStart, shiftEnd).
 * Cada slot es { hour: number (0-23), slotStartMs: number, slotEndMs: number }.
 */
export function buildShiftSlots(
    shiftStartHHMM: string,
    shiftEndHHMM: string,
    ref: Date = new Date()
): Array<{ hour: number; slotStartMs: number; slotEndMs: number }> {
    const [startH] = shiftStartHHMM.split(':').map(Number);
    const [endH] = shiftEndHHMM.split(':').map(Number);
    const slots: Array<{ hour: number; slotStartMs: number; slotEndMs: number }> = [];

    // Usar el offset de ref para construir cada slot
    const offset = getNZOffset(ref);
    const nzIso = toNZISO(ref);
    const dateStr = nzIso.slice(0, 10);

    for (let h = startH; h < endH; h++) {
        const slotStartMs = new Date(`${dateStr}T${String(h).padStart(2, '0')}:00:00${offset}`).getTime();
        const slotEndMs = new Date(`${dateStr}T${String(h + 1).padStart(2, '0')}:00:00${offset}`).getTime();
        slots.push({ hour: h, slotStartMs, slotEndMs });
    }
    return slots;
}

/**
 * Tramos de una hora desde el inicio de turno hasta la hora actual NZ (incluida).
 * No hay hora de fin de turno (cada equipo acaba cuando acaba): la ventana
 * crece durante el día. Antes del inicio devuelve solo el primer tramo.
 */
export function buildShiftSlotsUntilNow(
    shiftStartHHMM: string,
    ref: Date = new Date()
): Array<{ hour: number; slotStartMs: number; slotEndMs: number }> {
    const [startH] = shiftStartHHMM.split(':').map(Number);
    const nowH = Number(toNZISO(ref).slice(11, 13));
    const endH = Math.min(24, Math.max(startH + 1, nowH + 1));
    return buildShiftSlots(shiftStartHHMM, `${String(endH).padStart(2, '0')}:00`, ref);
}
