/**
 * NZST Timezone Utility
 * Forces all date/time operations to use New Zealand Standard Time (Pacific/Auckland)
 * Prevents UTC drift from toISOString() which causes 13-hour discrepancies
 */

const NZ_TIMEZONE = 'Pacific/Auckland';

/**
 * Get current date/time in NZST as an ISO-like string with offset.
 * Example: "2026-02-11T13:30:00+13:00"
 */
export function nowNZST(): string {
    const now = new Date();
    return toNZST(now);
}

/**
 * Get today's date in NZST as YYYY-MM-DD.
 * Critical: prevents the date from being "yesterday" due to UTC offset.
 */
export function todayNZST(): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: NZ_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    return formatter.format(new Date()); // Returns "YYYY-MM-DD"
}

/**
 * Extraer la fecha NZ (YYYY-MM-DD) de cualquier timestamp UTC.
 * Previene que scans a las 04:30 NZ aparezcan como el dia anterior en UTC.
 */
export function dateInNZST(isoString: string): string {
    if (!isoString) return '';
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: NZ_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    return formatter.format(new Date(isoString));
}

/**
 * Get yesterday's date in NZ timezone as YYYY-MM-DD.
 * Correcto en transiciones DST: deriva del calendario NZ, no de "ahora - 24h UTC".
 */
export function yesterdayNZST(): string {
    const nzFmt = new Intl.DateTimeFormat('en-CA', { timeZone: NZ_TIMEZONE });
    const todayStr = nzFmt.format(new Date());
    const [year, month, day] = todayStr.split('-').map(Number);
    const todayUtcMidnight = new Date(Date.UTC(year, month - 1, day));
    return nzFmt.format(new Date(todayUtcMidnight.getTime() - 86_400_000));
}

/**
 * Get the Monday of the current NZ week as YYYY-MM-DD.
 * Weeks start on Monday (ISO standard).
 * Si se pasa un Date, calcula el lunes de esa semana NZ; por defecto usa "hoy NZ".
 */
export function startOfWeekNZ(date?: Date): string {
    const nzFmt = new Intl.DateTimeFormat('en-CA', { timeZone: NZ_TIMEZONE });
    const todayStr = nzFmt.format(date ?? new Date());
    const [year, month, day] = todayStr.split('-').map(Number);

    // Medianoche UTC del día NZ para calcular correctamente el día de semana
    const midnightUtc = new Date(Date.UTC(year, month - 1, day, 0));
    const dayOfWeek = midnightUtc.getUTCDay(); // 0=Domingo, 1=Lunes, ..., 6=Sábado

    // Días que retroceder para llegar al lunes (domingo→6, lunes→0, martes→1, ...)
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const mondayMs = midnightUtc.getTime() - daysToMonday * 86_400_000;

    return nzFmt.format(new Date(mondayMs));
}

/**
 * Convert any Date to an ISO string in NZST with correct offset.
 */
export function toNZST(date: Date): string {
    // Get NZST components
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: NZ_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);

    const get = (type: string) => parts.find(p => p.type === type)?.value || '00';

    const iso = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;

    // Determine NZST (+12) vs NZDT (+13) offset
    const utcMs = date.getTime();
    const nzParts = new Intl.DateTimeFormat('en-US', {
        timeZone: NZ_TIMEZONE,
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hourCycle: 'h23',
    }).formatToParts(date);

    const nzGet = (type: string) => parseInt(nzParts.find(p => p.type === type)?.value || '0');
    // Date.UTC: la hora NZ se lee como si fuera UTC. Con new Date(y, m, d…) se
    // leía en la zona del móvil y el desfase salía mal fuera de UTC (en NZ, +00:00).
    const nzAsUtc = Date.UTC(nzGet('year'), nzGet('month') - 1, nzGet('day'), nzGet('hour') % 24, nzGet('minute'), nzGet('second'));
    const offsetMs = nzAsUtc - Math.floor(utcMs / 1000) * 1000;
    const offsetHours = Math.round(offsetMs / 3600000);
    const offsetStr = `+${String(offsetHours).padStart(2, '0')}:00`;

    return `${iso}${offsetStr}`;
}

/** Desfase NZ ("+13:00" / "+12:00") vigente en un instante concreto. */
function nzOffsetAt(instant: Date): string {
  return (
    new Intl.DateTimeFormat('en-US', { timeZone: NZ_TIMEZONE, timeZoneName: 'longOffset' })
      .formatToParts(instant)
      .find(p => p.type === 'timeZoneName')
      ?.value.replace('GMT', '') || '+13:00'
  );
}

/**
 * Desfase horario de Nueva Zelanda en una fecha YYYY-MM-DD (al mediodia): "+13:00" (verano)
 * o "+12:00" (invierno). Ojo: en los dias de cambio de hora la medianoche tiene otro desfase;
 * para limites de dia usar nzMidnight / nzEndOfDay.
 */
export function nzOffsetOn(dateYMD: string): string {
  return nzOffsetAt(new Date(`${dateYMD}T12:00:00Z`));
}

/**
 * Desfase vigente a una hora local NZ. Se mide en la hora local tomada como +12:00;
 * los cambios de hora NZ son a las 02:00/03:00, asi que a medianoche y a las 23:59 es exacto.
 */
function nzOffsetAtLocal(dateYMD: string, hms: string): string {
  return nzOffsetAt(new Date(`${dateYMD}T${hms}+12:00`));
}

/** Medianoche NZ de una fecha YYYY-MM-DD, con su desfase: "2026-10-05T00:00:00+13:00" */
export function nzMidnight(dateYMD: string): string {
  return `${dateYMD}T00:00:00${nzOffsetAtLocal(dateYMD, '00:00:00')}`;
}

/** Último segundo del día NZ: "2026-10-05T23:59:59+13:00" */
export function nzEndOfDay(dateYMD: string): string {
  return `${dateYMD}T23:59:59${nzOffsetAtLocal(dateYMD, '23:59:59')}`;
}

/**
 * Suma (o resta) días a una fecha de calendario 'YYYY-MM-DD' (sin zonas: el día NZ sigue siendo el mismo día).
 * Ej.: addDaysYMD(todayNZST(), -6) = hace 6 días en NZ.
 */
export function addDaysYMD(ymd: string, days: number): string {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
