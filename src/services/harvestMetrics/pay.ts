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
    /**
     * Lo ganado con cubetas, si cada cubeta tiene su precio (variedad). Si se
     * pasa, manda sobre buckets × pieceRate.
     */
    pieceEarnings?: number;
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
    /**
     * Festivo (Holidays Act 2003 s.50): tiempo y medio de la paga del día,
     * también de lo ganado por cubetas. Es la media parte extra de las cubetas.
     */
    holidayPremium: number;
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

/** Plus de festivo (la media parte extra) de lo ganado por cubetas, al céntimo */
function holidayPremiumOf(pieceEarnings: number, multiplier: number): number {
    return Math.round(Math.round(pieceEarnings * 100) * (multiplier - 1)) / 100;
}

/**
 * Pago de UN día. El complemento se calcula por día (regla de negocio).
 * Para una semana: sumar los dayPay de cada día, nunca agregar antes.
 */
export function dayPay(input: DayPayInput): DayPay {
    const minWage = Math.max(input.minWage || 0, PAY_RULES.minWageFloor);
    const multiplier = input.isPublicHoliday ? PAY_RULES.publicHolidayMultiplier : 1;
    const minWageApplied = minWage * multiplier;
    const hours = Math.max(0, input.hours);
    const pieceEarnings = input.pieceEarnings !== undefined
        ? Math.max(0, input.pieceEarnings)
        : Math.max(0, input.buckets) * Math.max(0, input.pieceRate);
    const minimumEarnings = hours * minWageApplied;
    const pieceHourlyRate = hours > 0 ? pieceEarnings / hours : 0;

    // Todo en céntimos ya redondeados, para que las líneas que se exportan a
    // nómina (cubetas + plus de festivo + complemento) sumen exactamente el total.
    const pieceRounded = round2(pieceEarnings);
    // Festivo: lo ganado por cubetas también va a tiempo y medio. El plus se
    // calcula sobre los céntimos (medio céntimo hacia arriba: 833.925 → 833.93)
    const premiumRounded = holidayPremiumOf(pieceRounded, multiplier);
    // El complemento cubre lo que falte hasta el mínimo y se redondea HACIA
    // ARRIBA al céntimo: al más cercano podía quedar medio céntimo por debajo
    // (5.5 h × 23.95 = 131.725 pagaba 131.72). −1e-6: ruido de coma flotante.
    const missing = minimumEarnings - pieceRounded - premiumRounded;
    const topUpRounded = missing > 0 ? Math.max(0, Math.ceil(missing * 100 - 1e-6) / 100) : 0;
    return {
        pieceEarnings: pieceRounded,
        holidayPremium: premiumRounded,
        minimumEarnings: round2(minimumEarnings),
        topUp: topUpRounded,
        total: round2(pieceRounded + premiumRounded + topUpRounded),
        minWageApplied: round2(minWageApplied),
        pieceHourlyRate: round2(pieceHourlyRate),
        belowMinimum: hours > 0 && pieceHourlyRate * multiplier < minWageApplied,
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
    /** YYYY-MM-DD (fecha NZ del tramo) */
    date: string;
    /** Huerto del tramo (una persona puede trabajar en varios el mismo día) */
    orchardId?: string | null;
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
    orchardId?: string | null;
    variety?: string | null;
    /** Precio de ESTA cubeta (según variedad y huerto); si falta, el general */
    pieceRate?: number | null;
}

/** Un tramo de trabajo tal como cuenta para el pago */
export interface PaySegment {
    orchardId: string | null;
    checkIn: string | null;
    /** Salida real o, si quedó abierto, la estimada / "ahora" */
    checkOut: string | null;
    open: boolean;
    breakStart: string | null;
    grossHours: number;
    /** Horas de trayecto que se cargan a este tramo (mitad de cada viaje) */
    travelHours: number;
}

/** Cubetas pagadas a un mismo precio (misma variedad y tarifa) */
export interface PieceLine {
    variety: string;
    rate: number;
    buckets: number;
    earnings: number;
}

/**
 * Parte del día que corresponde a un huerto:
 * - horas: lo trabajado allí + su mitad de los trayectos, menos su parte del descanso
 * - cubetas y lo ganado por cubetas: las recogidas allí
 * - complemento al mínimo: repartido según las horas
 */
export interface OrchardShare {
    orchardId: string | null;
    hours: number;
    buckets: number;
    pieceEarnings: number;
    /** Plus de festivo de las cubetas recogidas aquí */
    holidayPremium: number;
    topUp: number;
    total: number;
}

/** Detalle de un día de una persona: dónde, cuándo y cuánto */
export interface PayDay {
    date: string;
    segments: PaySegment[];
    /** Horas pagables del día (todos los tramos, un descanso no pagado) */
    hours: number;
    breakMinutes: number;
    /** Minutos de trayecto entre huertos (pagados, mitad a cada huerto) */
    travelMinutes: number;
    buckets: number;
    bucketsByVariety: Record<string, number>;
    /** Líneas de pago por cubetas: variedad y precio (para Xero/PaySauce) */
    pieceLines: PieceLine[];
    /** Reparto del día por huerto (coste por huerto) */
    byOrchard: OrchardShare[];
    pieceEarnings: number;
    /** Plus de festivo (media parte extra de lo ganado por cubetas) */
    holidayPremium: number;
    topUp: number;
    total: number;
    belowMinimum: boolean;
    /** Horas estimadas (algún tramo sin cerrar o sin fichaje) */
    estimated: boolean;
    isPublicHoliday: boolean;
}

export interface PickerRangePay {
    pickerId: string;
    buckets: number;
    hours: number;
    pieceEarnings: number;
    /** Plus de festivo de la semana */
    holidayPremium: number;
    topUp: number;
    total: number;
    /** Días con horas o cubetas */
    days: number;
    /** Días en que las cubetas no llegaron al mínimo */
    daysBelowMinimum: number;
    /** Días cuyas horas son estimadas (sin fichaje cerrado): revisar la hoja de horas */
    estimatedDays: number;
    /** Detalle día a día (huerto, horas, cubetas por variedad, pago) */
    dayDetails: PayDay[];
}

interface ScanForPay {
    ms: number;
    ts: string;
    orchardId: string | null;
    variety: string | null;
    rate: number;
}

/**
 * Horas de UN día de una persona con varios tramos (p. ej. mañana en el huerto
 * A, tarde en el B). Reglas:
 * - Cada tramo: entrada → salida. Abierto hoy: hasta ahora. Abierto en un día
 *   pasado: hasta el último escaneo de ese tramo (estimado).
 * - Un solo descanso de comida al día (no pagado): si el team leader anotó su
 *   hora dentro de algún tramo, se descuenta (como mucho lo transcurrido); si
 *   no, se descuentan breakMinutes cuando el día supera mealBreakAfterHours.
 * - Trayecto: el hueco entre un tramo y el siguiente en OTRO huerto se paga;
 *   la mitad se carga al huerto de salida y la otra mitad al de llegada.
 *   El hueco entre dos tramos del mismo huerto (salió y volvió) no se paga.
 * - Sin tramos: del primer al último escaneo (estimado).
 */
function dayHours(
    rows: ReadonlyArray<AttendanceRow>,
    scans: ReadonlyArray<ScanForPay>,
    isToday: boolean,
    nowMs: number,
): { hours: number; breakMinutes: number; travelMinutes: number; segments: PaySegment[]; estimated: boolean } {
    const sorted = [...rows]
        .filter(r => toMs(r.checkIn) !== null)
        .sort((a, b) => (toMs(a.checkIn) ?? 0) - (toMs(b.checkIn) ?? 0));

    if (sorted.length === 0) {
        const h = shiftHours({ scanTimes: scans.map(s => s.ts) });
        return { hours: h.hours, breakMinutes: h.breakMinutes, travelMinutes: 0, segments: [], estimated: h.source !== 'none' };
    }

    let estimated = false;
    const ranges: { start: number; end: number; row: AttendanceRow; contained: boolean }[] = [];
    // Fin más tardío hasta ahora: un tramo que se solapa con el anterior (error
    // al corregir la hoja) empieza donde acabó aquel; si no, el rato solapado
    // se pagaba dos veces
    let coveredUntil = -Infinity;
    sorted.forEach((r, i) => {
        const rawStart = toMs(r.checkIn) as number;
        const start = Math.max(rawStart, coveredUntil);
        const out = toMs(r.checkOut);
        const nextStart = i + 1 < sorted.length ? (toMs(sorted[i + 1].checkIn) as number) : Infinity;
        let end: number;
        if (out !== null) {
            end = Math.max(start, out);
        } else if (isToday) {
            // Abierto hoy: hasta ahora, pero nunca más allá de la entrada del tramo
            // siguiente (si no, las horas se contaban dos veces)
            end = Math.max(start, Math.min(nowMs, nextStart));
            estimated = true;
        } else {
            // Abierto en un día pasado: hasta el último escaneo de este tramo
            // (mismo huerto, antes del siguiente tramo)
            const last = scans
                .filter(s => s.ms >= start && s.ms < nextStart && (!r.orchardId || !s.orchardId || s.orchardId === r.orchardId))
                .reduce((m, s) => Math.max(m, s.ms), start);
            end = last;
            estimated = true;
        }
        // Tramo entero dentro de otro: no cuenta (tampoco para trayectos)
        const contained = coveredUntil > rawStart && end <= coveredUntil;
        end = Math.max(start, end);
        coveredUntil = Math.max(coveredUntil, end);
        ranges.push({ start, end, row: r, contained });
    });

    // Trayectos entre huertos distintos: mitad para cada tramo
    const travelMs = ranges.map(() => 0);
    let totalTravelMs = 0;
    let prevIdx = -1;
    for (let i = 0; i < ranges.length; i++) {
        if (ranges[i].contained) continue;
        const p = prevIdx;
        prevIdx = i;
        if (p < 0) continue;
        const prev = ranges[p], cur = ranges[i];
        const a = prev.row.orchardId, b = cur.row.orchardId;
        if (!a || !b || a === b) continue;
        const gap = Math.max(0, cur.start - prev.end);
        travelMs[p] += gap / 2;
        travelMs[i] += gap / 2;
        totalTravelMs += gap;
    }

    const grossMs = ranges.reduce((sum, x) => sum + (x.end - x.start), 0) + totalTravelMs;
    const grossHours = grossMs / MS_PER_HOUR;
    const breakMinutesSetting = sorted.find(r => r.breakMinutes != null)?.breakMinutes ?? PAY_RULES.mealBreakMinutes;

    let deducted = 0;
    const withBreak = ranges.find(x => {
        const b = toMs(x.row.breakStart);
        return b !== null && b >= x.start && b < x.end;
    });
    if (withBreak) {
        const b = toMs(withBreak.row.breakStart) as number;
        deducted = Math.min(breakMinutesSetting, (withBreak.end - b) / 60_000);
    } else if (grossHours > PAY_RULES.mealBreakAfterHours) {
        deducted = breakMinutesSetting;
    }

    const segments: PaySegment[] = ranges.map((x, i) => ({
        orchardId: x.row.orchardId ?? null,
        checkIn: x.row.checkIn ?? null,
        checkOut: new Date(x.end).toISOString(),
        open: !x.row.checkOut,
        breakStart: x.row.breakStart ?? null,
        grossHours: round2((x.end - x.start) / MS_PER_HOUR),
        travelHours: round2(travelMs[i] / MS_PER_HOUR),
    }));

    return {
        hours: round2(Math.max(0, grossHours - deducted / 60)),
        breakMinutes: Math.round(deducted),
        travelMinutes: Math.round(totalTravelMs / 60_000),
        segments,
        estimated,
    };
}

/** Agrupa las cubetas del día por variedad y precio */
function buildPieceLines(scans: ReadonlyArray<ScanForPay>): PieceLine[] {
    const lines = new Map<string, PieceLine>();
    for (const s of scans) {
        const variety = s.variety ?? '—';
        const k = `${variety}|${s.rate}`;
        const line = lines.get(k) ?? { variety, rate: s.rate, buckets: 0, earnings: 0 };
        line.buckets += 1;
        line.earnings = round2(line.earnings + s.rate);
        lines.set(k, line);
    }
    return [...lines.values()].sort((a, b) => a.variety.localeCompare(b.variety) || a.rate - b.rate);
}

/**
 * Reparte el día entre huertos. Las horas pagables del día se reparten en
 * proporción a (tiempo en el huerto + su mitad de trayectos); las cubetas van
 * al huerto donde se escanearon; el complemento al mínimo, según las horas.
 * Los céntimos que sobran del redondeo van al huerto con más peso, para que la
 * suma de huertos sea exactamente el total del día.
 */
function splitByOrchard(
    h: { hours: number; segments: PaySegment[] },
    scans: ReadonlyArray<ScanForPay>,
    topUp: number,
    holidayMultiplier = 1,
    holidayPremium = 0,
): OrchardShare[] {
    const key = (o: string | null | undefined) => o ?? '';
    const weight = new Map<string, number>();
    for (const s of h.segments) weight.set(key(s.orchardId), (weight.get(key(s.orchardId)) ?? 0) + s.grossHours + s.travelHours);
    const piece = new Map<string, { buckets: number; earnings: number }>();
    for (const s of scans) {
        const k = key(s.orchardId);
        const e = piece.get(k) ?? { buckets: 0, earnings: 0 };
        e.buckets += 1;
        e.earnings += s.rate;
        piece.set(k, e);
    }
    const ids = [...new Set([...weight.keys(), ...piece.keys()])];
    if (ids.length === 0) return [];
    const totalWeight = [...weight.values()].reduce((a, b) => a + b, 0);
    // Sin tramos (horas estimadas por escaneos): las horas siguen a las cubetas
    const share = (k: string) => totalWeight > 0
        ? (weight.get(k) ?? 0) / totalWeight
        : (piece.get(k)?.buckets ?? 0) / Math.max(1, scans.length);

    const out = ids.map(k => ({
        orchardId: k === '' ? null : k,
        hours: round2(h.hours * share(k)),
        buckets: piece.get(k)?.buckets ?? 0,
        pieceEarnings: round2(piece.get(k)?.earnings ?? 0),
        holidayPremium: holidayPremiumOf(round2(piece.get(k)?.earnings ?? 0), holidayMultiplier),
        topUp: round2(topUp * share(k)),
        total: 0,
    }));
    // Cuadrar céntimos con el total del día
    const fix = (field: 'hours' | 'topUp' | 'holidayPremium', target: number) => {
        const diff = round2(target - out.reduce((s, o) => s + o[field], 0));
        if (diff !== 0) {
            const big = out.reduce((m, o) => (share(key(o.orchardId)) > share(key(m.orchardId)) ? o : m), out[0]);
            big[field] = round2(big[field] + diff);
        }
    };
    fix('hours', h.hours);
    fix('topUp', topUp);
    fix('holidayPremium', holidayPremium);
    for (const o of out) o.total = round2(o.pieceEarnings + o.holidayPremium + o.topUp);
    return out.sort((a, b) => key(a.orchardId).localeCompare(key(b.orchardId)));
}

const dayKey = (pickerId: string, date: string) => `${pickerId}|${date}`;

/** Agrupa una lista por clave, manteniendo el orden de entrada */
function groupBy<T>(items: ReadonlyArray<T>, keyOf: (item: T) => string | null): Map<string, T[]> {
    const out = new Map<string, T[]>();
    for (const item of items) {
        const k = keyOf(item);
        if (k === null) continue;
        const list = out.get(k) ?? [];
        list.push(item);
        out.set(k, list);
    }
    return out;
}

interface ClosedShift { start: number; end: number; date: string }

/** Tramos cerrados (entrada y salida, salida posterior) de cada persona */
function closedShiftsByPicker(attendance: ReadonlyArray<AttendanceRow>): Map<string, ClosedShift[]> {
    const out = new Map<string, ClosedShift[]>();
    for (const a of attendance) {
        const start = toMs(a.checkIn), end = toMs(a.checkOut);
        if (start === null || end === null || end <= start) continue;
        const list = out.get(a.pickerId) ?? [];
        list.push({ start, end, date: a.date });
        out.set(a.pickerId, list);
    }
    return out;
}

/**
 * Día al que cuenta una cubeta. Una cubeta escaneada dentro de un tramo que
 * cruza la medianoche es del día de ese tramo (horas y cubetas juntas; antes se
 * iba al día siguiente y allí se estimaban horas otra vez). Si un tramo de su
 * propio día la cubre, se queda en su día.
 */
function payDateOfScan(ms: number, scanDate: string, closed: ReadonlyArray<ClosedShift>): string {
    const covering = closed.filter(x => ms >= x.start && ms <= x.end);
    if (covering.length === 0 || covering.some(x => x.date === scanDate)) return scanDate;
    return [...covering].sort((x, y) => x.date.localeCompare(y.date))[0].date;
}

/** Cubetas pagables (sin 'reject') agrupadas por persona y día de pago */
function scansByPayDay(
    buckets: ReadonlyArray<BucketRow>,
    closedByPicker: ReadonlyMap<string, ClosedShift[]>,
    pieceRate: number,
): Map<string, ScanForPay[]> {
    const scans = new Map<string, ScanForPay[]>();
    for (const b of buckets) {
        if (b.qualityGrade === 'reject') continue;
        const ms = toMs(b.scannedAt);
        if (ms === null) continue;
        const date = payDateOfScan(ms, nzDateOf(b.scannedAt), closedByPicker.get(b.pickerId) ?? []);
        const k = dayKey(b.pickerId, date);
        const list = scans.get(k) ?? [];
        list.push({
            ms,
            ts: b.scannedAt,
            orchardId: b.orchardId ?? null,
            variety: b.variety ?? null,
            rate: b.pieceRate ?? pieceRate,
        });
        scans.set(k, list);
    }
    return scans;
}

function countByVariety(scans: ReadonlyArray<ScanForPay>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const s of scans) {
        const v = s.variety ?? '—';
        out[v] = (out[v] ?? 0) + 1;
    }
    return out;
}

interface DayContext {
    pieceRate: number;
    minWage: number;
    isPublicHoliday: (dateYMD: string) => boolean;
    today: string;
    nowMs: number;
}

/** Detalle de pago de un día de una persona, o null si no hay nada que pagar */
function payDayOf(date: string, rows: AttendanceRow[], dayScans: ScanForPay[], ctx: DayContext): PayDay | null {
    const h = dayHours(rows, dayScans, date === ctx.today, ctx.nowMs);
    const hasStaleOpen = date < ctx.today && rows.some(r => r.checkIn && !r.checkOut);
    // Sin horas ni cubetas no hay nada que pagar, salvo un tramo abierto de un
    // día pasado: se mantiene (0 h, estimado) para que no desaparezca sin aviso.
    if (h.hours === 0 && dayScans.length === 0 && !hasStaleOpen) return null;

    const holiday = ctx.isPublicHoliday(date);
    const p = dayPay({
        buckets: dayScans.length,
        pieceEarnings: dayScans.reduce((sum, s) => sum + s.rate, 0),
        hours: h.hours,
        pieceRate: ctx.pieceRate,
        minWage: ctx.minWage,
        isPublicHoliday: holiday,
    });
    return {
        date,
        segments: h.segments,
        hours: h.hours,
        breakMinutes: h.breakMinutes,
        travelMinutes: h.travelMinutes,
        buckets: dayScans.length,
        bucketsByVariety: countByVariety(dayScans),
        pieceLines: buildPieceLines(dayScans),
        byOrchard: splitByOrchard(h, dayScans, p.topUp, holiday ? PAY_RULES.publicHolidayMultiplier : 1, p.holidayPremium),
        pieceEarnings: p.pieceEarnings,
        holidayPremium: p.holidayPremium,
        topUp: p.topUp,
        total: p.total,
        belowMinimum: p.belowMinimum,
        estimated: h.estimated || hasStaleOpen,
        isPublicHoliday: holiday,
    };
}

function emptyRangePay(pickerId: string): PickerRangePay {
    return {
        pickerId, buckets: 0, hours: 0, pieceEarnings: 0, holidayPremium: 0, topUp: 0, total: 0,
        days: 0, daysBelowMinimum: 0, estimatedDays: 0, dayDetails: [],
    };
}

/** Suma un día al acumulado de la persona (redondeando a céntimos en cada paso) */
function addDay(acc: PickerRangePay, day: PayDay): void {
    acc.buckets += day.buckets;
    acc.hours = round2(acc.hours + day.hours);
    acc.pieceEarnings = round2(acc.pieceEarnings + day.pieceEarnings);
    acc.holidayPremium = round2(acc.holidayPremium + day.holidayPremium);
    acc.topUp = round2(acc.topUp + day.topUp);
    acc.total = round2(acc.total + day.total);
    acc.days += 1;
    if (day.belowMinimum) acc.daysBelowMinimum += 1;
    if (day.estimated) acc.estimatedDays += 1;
    acc.dayDetails.push(day);
}

/**
 * Pago de cada picker en un rango de días. El complemento se calcula día a día
 * (con TODOS los tramos y cubetas de ese día, de cualquier huerto o variedad)
 * y luego se suma: nunca se agregan cubetas u horas de varios días antes.
 */
export function payForRange(params: {
    attendance: ReadonlyArray<AttendanceRow>;
    buckets: ReadonlyArray<BucketRow>;
    /** Precio por cubeta cuando la cubeta no trae el suyo */
    pieceRate: number;
    minWage: number;
    /** Por defecto, festivos nacionales NZ (isNZPublicHoliday) */
    isPublicHoliday?: (dateYMD: string) => boolean;
    now?: Date;
}): PickerRangePay[] {
    const { attendance, buckets, pieceRate, minWage } = params;
    const nowDate = params.now ?? new Date();
    const ctx: DayContext = {
        pieceRate,
        minWage,
        isPublicHoliday: params.isPublicHoliday ?? isNZPublicHoliday,
        today: nzDateOf(nowDate),
        nowMs: nowDate.getTime(),
    };

    const shifts = groupBy(attendance, a => dayKey(a.pickerId, a.date));
    const scans = scansByPayDay(buckets, closedShiftsByPicker(attendance), pieceRate);

    const byPicker = new Map<string, PickerRangePay>();
    const dayKeys = [...new Set<string>([...shifts.keys(), ...scans.keys()])].sort();
    for (const k of dayKeys) {
        const [pickerId, date] = k.split('|');
        const day = payDayOf(date, shifts.get(k) ?? [], scans.get(k) ?? [], ctx);
        if (!day) continue;
        const acc = byPicker.get(pickerId) ?? emptyRangePay(pickerId);
        addDay(acc, day);
        byPicker.set(pickerId, acc);
    }

    return [...byPicker.values()].sort((a, b) => b.buckets - a.buckets);
}

/**
 * Precio de una cubeta: el de su variedad en su huerto; si no hay, el de su
 * variedad para la empresa; si no, el precio normal del huerto; si no, el general.
 */
export function pieceRateFor(
    bucket: { orchardId?: string | null; variety?: string | null },
    rates: {
        /** variety_rates: [{ orchardId|null, variety, pieceRate }] */
        varietyRates?: ReadonlyArray<{ orchardId: string | null; variety: string; pieceRate: number }>;
        /** harvest_settings.piece_rate por huerto */
        orchardRates?: Readonly<Record<string, number>>;
        fallback: number;
    },
): number {
    const v = bucket.variety?.trim().toLowerCase();
    if (v && rates.varietyRates?.length) {
        const own = rates.varietyRates.find(r => r.orchardId === (bucket.orchardId ?? null) && r.variety.trim().toLowerCase() === v);
        if (own) return own.pieceRate;
        const company = rates.varietyRates.find(r => r.orchardId === null && r.variety.trim().toLowerCase() === v);
        if (company) return company.pieceRate;
    }
    if (bucket.orchardId && rates.orchardRates?.[bucket.orchardId] != null) return rates.orchardRates[bucket.orchardId];
    return rates.fallback;
}
