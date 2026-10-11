/**
 * harvestMetrics/pay.ts — Cálculo ÚNICO de horas y pago de un picker.
 *
 * Toda pantalla (Panel, Análisis, Informe semanal, Payroll, HR, Team Leader)
 * y la Edge Function calculate-payroll deben usar estas funciones. No hay
 * otra fórmula de horas ni de complemento en la app.
 *
 * Reglas de negocio (decididas 2026-10-11, ver doc "personas, roles y cálculo único"):
 * - Ficha el team leader por todo su equipo: la entrada/salida del picker en
 *   daily_attendance es la de su equipo, corregida después en la hoja de horas.
 * - Descanso de comida: 30 min NO pagados. El team leader anota a qué hora fue.
 *   Si no lo anotó y el turno pasa de 4 h, se descuentan igualmente.
 * - Complemento al salario mínimo POR DÍA: cada día se garantiza el mínimo por
 *   las horas de ese día; un día bueno no compensa uno malo.
 * - Semana de pago lunes–domingo (hora NZ); la nómina se cierra el lunes siguiente.
 * - Festivo trabajado: mínimo a 1.5x (Holidays Act 2003 s.50).
 *
 * IMPORTANTE: este fichero no importa nada. Se copia tal cual a
 * supabase/functions/_shared/pay-rules.ts para la Edge Function (Deno);
 * pay-parity.test.ts falla si las dos copias divergen.
 */

export const PAY_RULES = {
    /** Duración del descanso de comida, no pagado */
    mealBreakMinutes: 30,
    /** A partir de cuántas horas de turno se descuenta el descanso si no se anotó */
    mealBreakAfterHours: 4,
    /** Salario mínimo adulto NZ, Minimum Wage Order 2026 (desde 1 abril 2026) */
    minWageFloor: 23.95,
    /** Multiplicador del mínimo en festivo trabajado */
    publicHolidayMultiplier: 1.5,
    timeZone: 'Pacific/Auckland',
} as const;

/** De dónde salen las horas, de más fiable a menos */
export type HoursSource =
    /** Entrada y salida registradas (hoja de horas): la fuente de nómina */
    | 'timesheet'
    /** Entrada registrada, salida aún no: turno en curso, estimado hasta ahora */
    | 'open_shift'
    /** Sin fichaje: primer a último escaneo de cubeta. Solo para el panel en vivo */
    | 'scan_estimate'
    /** Ni fichaje ni escaneos */
    | 'none';

export interface ShiftInput {
    checkIn?: string | null;
    checkOut?: string | null;
    /** Hora del descanso anotada por el team leader */
    breakStart?: string | null;
    /** Minutos de descanso; por defecto PAY_RULES.mealBreakMinutes */
    breakMinutes?: number | null;
    /** Timestamps de escaneos del día, para estimar si no hay fichaje */
    scanTimes?: ReadonlyArray<string | null | undefined>;
    /** "Ahora", para turnos abiertos. Por defecto new Date() */
    now?: Date;
}

export interface ShiftHours {
    /** Horas pagables (tras descontar el descanso) */
    hours: number;
    /** Horas entre entrada y salida, sin descontar */
    grossHours: number;
    /** Minutos de descanso descontados */
    breakMinutes: number;
    source: HoursSource;
}

const MS_PER_HOUR = 3_600_000;

function toMs(ts: string | null | undefined): number | null {
    if (!ts) return null;
    const ms = new Date(ts).getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/** Redondeo a céntimos, half-up, sin el error de coma flotante (35.925 → 35.93). */
function round2(n: number): number {
    return Math.round((n + Math.sign(n) * Number.EPSILON) * 100 * (1 + Number.EPSILON)) / 100;
}

/**
 * Minutos de descanso a descontar de un tramo [startMs, endMs].
 * - Si el team leader anotó la hora y cae dentro del tramo: se descuenta
 *   (como mucho lo transcurrido, si el descanso está en curso).
 * - Si no la anotó, o la hora cae fuera del tramo: se descuenta el descanso
 *   completo cuando el tramo supera el umbral.
 */
function breakToDeduct(
    startMs: number,
    endMs: number,
    breakStart: string | null | undefined,
    breakMinutes: number,
): number {
    const grossHours = (endMs - startMs) / MS_PER_HOUR;
    const breakStartMs = toMs(breakStart);
    // Descanso anotado dentro del turno: se descuenta (como mucho lo transcurrido).
    // Si la hora anotada cae fuera del turno (error al anotarla), se aplica la
    // regla por defecto en vez de pagar el descanso.
    if (breakStartMs !== null && breakStartMs >= startMs && breakStartMs < endMs) {
        const elapsed = (endMs - breakStartMs) / 60_000;
        return Math.min(breakMinutes, elapsed);
    }
    return grossHours > PAY_RULES.mealBreakAfterHours ? breakMinutes : 0;
}

/**
 * Horas trabajadas de un picker en un día.
 */
export function shiftHours(input: ShiftInput): ShiftHours {
    const breakMinutes = input.breakMinutes ?? PAY_RULES.mealBreakMinutes;
    const nowMs = (input.now ?? new Date()).getTime();
    const inMs = toMs(input.checkIn);
    const outMs = toMs(input.checkOut);

    let startMs: number | null = null;
    let endMs: number | null = null;
    let source: HoursSource = 'none';

    if (inMs !== null && outMs !== null && outMs > inMs) {
        startMs = inMs;
        endMs = outMs;
        source = 'timesheet';
    } else if (inMs !== null && outMs === null) {
        startMs = inMs;
        endMs = Math.max(inMs, nowMs);
        source = 'open_shift';
    } else {
        const scans = (input.scanTimes ?? [])
            .map(toMs)
            .filter((ms): ms is number => ms !== null);
        if (scans.length > 0) {
            startMs = Math.min(...scans);
            endMs = Math.max(...scans);
            source = 'scan_estimate';
        }
    }

    if (startMs === null || endMs === null) {
        return { hours: 0, grossHours: 0, breakMinutes: 0, source: 'none' };
    }

    const grossHours = (endMs - startMs) / MS_PER_HOUR;
    const deducted = breakToDeduct(startMs, endMs, input.breakStart, breakMinutes);
    const hours = Math.max(0, grossHours - deducted / 60);

    return {
        hours: round2(hours),
        grossHours: round2(grossHours),
        breakMinutes: Math.round(deducted),
        source,
    };
}

export interface DayPayInput {
    /** Cubetas válidas del día (sin rechazos de QC) */
    buckets: number;
    /** Horas pagables del día (shiftHours().hours) */
    hours: number;
    pieceRate: number;
    /** Salario mínimo configurado; nunca se usa menos que PAY_RULES.minWageFloor */
    minWage: number;
    /** El día es festivo nacional NZ */
    isPublicHoliday?: boolean;
}

export interface DayPay {
    pieceEarnings: number;
    /** Lo que habría cobrado a salario mínimo (con festivo aplicado) */
    minimumEarnings: number;
    /** Complemento para llegar al mínimo, ≥ 0 */
    topUp: number;
    total: number;
    /** Mínimo por hora aplicado ese día */
    minWageApplied: number;
    /** Lo ganado por hora solo con cubetas */
    pieceHourlyRate: number;
    belowMinimum: boolean;
}

/**
 * Pago de UN día. El complemento se calcula por día (regla de negocio).
 * Para una semana: sumar los dayPay de cada día, nunca agregar antes.
 */
export function dayPay(input: DayPayInput): DayPay {
    const minWage = Math.max(input.minWage || 0, PAY_RULES.minWageFloor);
    const minWageApplied = input.isPublicHoliday
        ? minWage * PAY_RULES.publicHolidayMultiplier
        : minWage;
    const hours = Math.max(0, input.hours);
    const pieceEarnings = Math.max(0, input.buckets) * Math.max(0, input.pieceRate);
    const minimumEarnings = hours * minWageApplied;
    const topUp = Math.max(0, minimumEarnings - pieceEarnings);
    const pieceHourlyRate = hours > 0 ? pieceEarnings / hours : 0;

    return {
        pieceEarnings: round2(pieceEarnings),
        minimumEarnings: round2(minimumEarnings),
        topUp: round2(topUp),
        total: round2(pieceEarnings + topUp),
        minWageApplied: round2(minWageApplied),
        pieceHourlyRate: round2(pieceHourlyRate),
        belowMinimum: hours > 0 && pieceHourlyRate < minWageApplied,
    };
}

// Un solo formateador: crear un Intl.DateTimeFormat por llamada costaba ~125 µs
// y una semana de temporada (14.000 cubetas) tardaba 2 s solo en fechas.
const NZ_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
    timeZone: PAY_RULES.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

/** Fecha YYYY-MM-DD en hora de Nueva Zelanda de un timestamp. */
export function nzDateOf(ts: string | Date): string {
    return NZ_DATE_FMT.format(typeof ts === 'string' ? new Date(ts) : ts);
}

/**
 * Festivos nacionales NZ (Monday-ised). Misma lista que src/constants/nz-law.ts;
 * vive aquí para que la Edge Function la use sin imports (pay-parity.test.ts
 * comprueba que coinciden). Añadir cada año cuando se publiquen.
 */
export const NZ_PUBLIC_HOLIDAYS: ReadonlySet<string> = new Set([
    '2026-01-01', '2026-01-02', '2026-02-06', '2026-04-03', '2026-04-06',
    '2026-04-27', '2026-06-01', '2026-07-10', '2026-10-26', '2026-12-25',
    '2026-12-28',
    '2027-01-01', '2027-01-04', '2027-02-08', '2027-03-26', '2027-03-29',
    '2027-04-26', '2027-06-07', '2027-06-25', '2027-10-25', '2027-12-27',
    '2027-12-28',
]);

/** ¿Es festivo nacional NZ? Recibe la fecha NZ YYYY-MM-DD. */
export function isNZPublicHoliday(dateYMD: string): boolean {
    return NZ_PUBLIC_HOLIDAYS.has(dateYMD.slice(0, 10));
}

function addDays(dateYMD: string, days: number): string {
    const [y, m, d] = dateYMD.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + days));
    return t.toISOString().slice(0, 10);
}

export interface PayWeek {
    /** Lunes, YYYY-MM-DD */
    start: string;
    /** Domingo, YYYY-MM-DD */
    end: string;
    /** Lunes siguiente: día de cierre de la nómina */
    closesOn: string;
}

/** Semana de pago (lunes–domingo NZ) a la que pertenece una fecha YYYY-MM-DD. */
export function payWeekOf(dateYMD: string): PayWeek {
    const [y, m, d] = dateYMD.split('-').map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
    const sinceMonday = (weekday + 6) % 7;
    const start = addDays(dateYMD, -sinceMonday);
    return { start, end: addDays(start, 6), closesOn: addDays(start, 7) };
}

// ─── Agregado de un rango (semana de pago) ──────────────────────────────────

export interface AttendanceRow {
    pickerId: string;
    /** YYYY-MM-DD (fecha NZ del turno) */
    date: string;
    checkIn?: string | null;
    checkOut?: string | null;
    breakStart?: string | null;
    breakMinutes?: number | null;
}

export interface BucketRow {
    pickerId: string;
    scannedAt: string;
    /** 'reject' no cuenta para el pago */
    qualityGrade?: string | null;
}

export interface PickerRangePay {
    pickerId: string;
    buckets: number;
    hours: number;
    pieceEarnings: number;
    topUp: number;
    total: number;
    /** Días con horas o cubetas */
    days: number;
    /** Días en que las cubetas no llegaron al mínimo */
    daysBelowMinimum: number;
    /** Días cuyas horas son estimadas (sin fichaje cerrado): revisar la hoja de horas */
    estimatedDays: number;
}

/**
 * Pago de cada picker en un rango de días. El complemento se calcula día a día
 * y luego se suma: nunca se agregan cubetas u horas de varios días antes.
 */
export function payForRange(params: {
    attendance: ReadonlyArray<AttendanceRow>;
    buckets: ReadonlyArray<BucketRow>;
    pieceRate: number;
    minWage: number;
    /** Por defecto, festivos nacionales NZ (isNZPublicHoliday) */
    isPublicHoliday?: (dateYMD: string) => boolean;
    now?: Date;
}): PickerRangePay[] {
    const { attendance, buckets, pieceRate, minWage, now } = params;
    const isPublicHoliday = params.isPublicHoliday ?? isNZPublicHoliday;
    const key = (pickerId: string, date: string) => `${pickerId}|${date}`;
    const today = nzDateOf((now ?? new Date()).toISOString());

    const shifts = new Map<string, AttendanceRow>();
    for (const a of attendance) shifts.set(key(a.pickerId, a.date), a);

    const scans = new Map<string, string[]>();
    for (const b of buckets) {
        if (b.qualityGrade === 'reject') continue;
        const k = key(b.pickerId, nzDateOf(b.scannedAt));
        const list = scans.get(k) ?? [];
        list.push(b.scannedAt);
        scans.set(k, list);
    }

    const byPicker = new Map<string, PickerRangePay>();
    const dayKeys = new Set<string>([...shifts.keys(), ...scans.keys()]);
    for (const k of dayKeys) {
        const [pickerId, date] = k.split('|');
        const shift = shifts.get(k);
        const dayScans = scans.get(k) ?? [];
        // Un turno sin salida solo cuenta "hasta ahora" si es de hoy. Si quedó
        // abierto en un día pasado, se estima de la entrada al último escaneo y el
        // día queda marcado como estimado para que el team leader lo cierre.
        // El turno empieza cuando ficha el team leader, aunque haya escaneos antes.
        const staleOpen = !!shift?.checkIn && !shift.checkOut && date < today;
        const lastScanMs = dayScans.reduce((m, s) => Math.max(m, toMs(s) ?? 0), 0);
        const checkInMs = toMs(shift?.checkIn) ?? 0;
        const h = shiftHours({
            checkIn: shift?.checkIn,
            checkOut: staleOpen
                ? new Date(Math.max(checkInMs, lastScanMs)).toISOString()
                : shift?.checkOut,
            breakStart: shift?.breakStart,
            breakMinutes: shift?.breakMinutes,
            scanTimes: dayScans,
            now,
        });
        // Sin horas ni cubetas no hay nada que pagar, salvo un turno abierto de un
        // día pasado: se mantiene (0 h, estimado) para que no desaparezca sin aviso.
        if (h.hours === 0 && dayScans.length === 0 && !staleOpen) continue;
        const p = dayPay({
            buckets: dayScans.length,
            hours: h.hours,
            pieceRate,
            minWage,
            isPublicHoliday: isPublicHoliday(date),
        });
        const acc = byPicker.get(pickerId) ?? {
            pickerId, buckets: 0, hours: 0, pieceEarnings: 0, topUp: 0, total: 0,
            days: 0, daysBelowMinimum: 0, estimatedDays: 0,
        };
        acc.buckets += dayScans.length;
        acc.hours = round2(acc.hours + h.hours);
        acc.pieceEarnings = round2(acc.pieceEarnings + p.pieceEarnings);
        acc.topUp = round2(acc.topUp + p.topUp);
        acc.total = round2(acc.total + p.total);
        acc.days += 1;
        if (p.belowMinimum) acc.daysBelowMinimum += 1;
        if (staleOpen || h.source !== 'timesheet') acc.estimatedDays += 1;
        byPicker.set(pickerId, acc);
    }

    return [...byPicker.values()].sort((a, b) => b.buckets - a.buckets);
}
