/**
 * Implementación de REFERENCIA del pago de pickers (solo para tests).
 *
 * Escrita a partir de las reglas (ver /home/claude/reports/payroll-differential.md,
 * tabla de reglas), NO copiando pay.ts. Es deliberadamente simple: minutos
 * enteros, céntimos enteros y bucles planos. Sirve para pruebas diferenciales:
 * se generan semanas al azar y se compara con cada camino de pago de la app.
 *
 * Reglas (resumen):
 *  R1  Día de pago = fecha NZ. Semana lunes–domingo.
 *  R2  Horas = unión de tramos (entrada→salida) + trayectos entre huertos
 *      DISTINTOS (hueco entre un tramo y el siguiente) − UN descanso de comida
 *      no pagado al día.
 *  R3  Descanso: SOLO si el team leader anotó la hora dentro de un tramo se
 *      descuenta (como mucho lo que quedaba del tramo). Sin anotar (o anotado
 *      fuera de todo tramo) no se descuenta nada, ni en días sin fichaje
 *      (decisión del dueño 2026-10-14). Descansos cortos: pagados.
 *  R4  Tramo abierto hoy: hasta ahora (sin pisar el siguiente tramo). Abierto
 *      de un día pasado: hasta su último escaneo (estimado).
 *  R5  Sin fichaje: del primer al último escaneo pagable de ese día.
 *  R1b Una cubeta escaneada dentro de un tramo cerrado que cruza la medianoche
 *      es del día de ese tramo (las horas y las cubetas van juntas).
 *  R6  Cubeta 'reject': no se paga. Cada cubeta paga el precio de su variedad
 *      en su huerto → de su variedad en la empresa → del huerto → general.
 *  R7  Mínimo/h = máx(legal 23.95, configurado, contrato si es mayor).
 *  R8  Complemento POR DÍA: total del día = M × máx(cubetas, mínimo × horas),
 *      M = 1.5 en festivo nacional NZ (Holidays Act s.50), 1 si no. El
 *      complemento se redondea al céntimo HACIA ARRIBA (nunca bajo el mínimo).
 *  R9  Líneas: cubetas, plus festivo (0.5 × cubetas), complemento (resto).
 *  R10 Reparto por huerto: horas según (tiempo allí + mitad de cada trayecto);
 *      cubetas donde se escanearon; complemento según horas.
 */

export const REF_LEGAL_MIN_WAGE = 23.95;
const DEFAULT_MEAL_MIN = 30;

export interface RefShift {
    pickerId: string;
    orchardId: string | null;
    /** Fecha NZ del tramo (la del fichaje de entrada) */
    date: string;
    checkIn: string | null;
    checkOut: string | null;
    breakStart?: string | null;
    breakMinutes?: number | null;
}

export interface RefBucket {
    pickerId: string;
    orchardId: string | null;
    variety: string | null;
    scannedAt: string;
    grade?: string | null;
}

export interface RefRates {
    varietyRates: ReadonlyArray<{ orchardId: string | null; variety: string; rate: number }>;
    orchardRates: Readonly<Record<string, number>>;
    fallback: number;
}

export interface RefConfig {
    rates: RefRates;
    /** Mínimo configurado (harvest_settings.min_wage_rate) */
    minWage: number;
    /** Tarifa por hora de contrato por persona (si es mayor que el mínimo, manda) */
    contractRates?: Readonly<Record<string, number>>;
    holidays: ReadonlySet<string>;
    now: Date;
    /** 'centihour': las horas del día se redondean a 0.01 h antes de pagar (como la app) */
    hoursRounding?: 'exact' | 'centihour';
}

export interface RefOrchardShare {
    orchardId: string | null;
    hours: number;
    buckets: number;
    pieceCents: number;
    premiumCents: number;
    topUpCents: number;
    totalCents: number;
}

export interface RefDay {
    pickerId: string;
    date: string;
    /** Horas pagables (exactas o a 0.01 h) */
    hours: number;
    breakMinutes: number;
    travelMinutes: number;
    buckets: number;
    pieceCents: number;
    premiumCents: number;
    topUpCents: number;
    totalCents: number;
    holiday: boolean;
    byOrchard: RefOrchardShare[];
}

const MIN_MS = 60_000;

function ms(ts: string | null | undefined): number | null {
    if (!ts) return null;
    const v = Date.parse(ts);
    return Number.isFinite(v) ? v : null;
}

/** Fecha NZ (YYYY-MM-DD) de un instante */
const NZ_PARTS = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit',
});
export function refNzDate(t: number | string): string {
    const parts = NZ_PARTS.formatToParts(new Date(t));
    const get = (k: string) => parts.find(p => p.type === k)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
}

/** R6: precio de una cubeta */
export function refRate(b: { orchardId: string | null; variety: string | null }, rates: RefRates): number {
    const v = (b.variety ?? '').trim().toLowerCase();
    if (v) {
        for (const r of rates.varietyRates) {
            if (r.orchardId === b.orchardId && r.variety.trim().toLowerCase() === v) return r.rate;
        }
        for (const r of rates.varietyRates) {
            if (r.orchardId === null && r.variety.trim().toLowerCase() === v) return r.rate;
        }
    }
    if (b.orchardId && rates.orchardRates[b.orchardId] !== undefined) return rates.orchardRates[b.orchardId];
    return rates.fallback;
}

/** Longitud de la unión de intervalos [a, b) en ms */
function unionLength(intervals: Array<[number, number]>): number {
    const sorted = intervals.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
    let total = 0;
    let curA = -Infinity;
    let curB = -Infinity;
    for (const [a, b] of sorted) {
        if (a > curB) {
            if (curB > curA) total += curB - curA;
            curA = a;
            curB = b;
        } else if (b > curB) {
            curB = b;
        }
    }
    if (curB > curA) total += curB - curA;
    return total;
}

/** Pago de cada persona y día. Devuelve los días con horas o cubetas pagables. */
export function referencePay(shifts: ReadonlyArray<RefShift>, buckets: ReadonlyArray<RefBucket>, cfg: RefConfig): RefDay[] {
    const nowMs = cfg.now.getTime();
    const today = refNzDate(nowMs);
    const payable = buckets.filter(b => b.grade !== 'reject' && ms(b.scannedAt) !== null);

    // Intervalos de cada tramo (R4), para saber qué escaneos están cubiertos (R5)
    type Seg = { shift: RefShift; start: number; end: number };
    const segsByPersonDay = new Map<string, Seg[]>();
    const people = new Set<string>([...shifts.map(s => s.pickerId), ...payable.map(b => b.pickerId)]);
    const k = (p: string, d: string) => `${p}|${d}`;

    for (const s of shifts) {
        if (ms(s.checkIn) === null) continue;
        const list = segsByPersonDay.get(k(s.pickerId, s.date)) ?? [];
        list.push({ shift: s, start: ms(s.checkIn) as number, end: 0 });
        segsByPersonDay.set(k(s.pickerId, s.date), list);
    }
    // Fin de los tramos cerrados (los abiertos se resuelven después)
    for (const list of segsByPersonDay.values()) {
        list.sort((a, b) => a.start - b.start);
        for (const seg of list) {
            const out = ms(seg.shift.checkOut);
            if (out !== null) seg.end = Math.max(seg.start, out);
        }
    }

    // R1: una cubeta es del día del tramo CERRADO que la cubre (turno que cruza
    // la medianoche); si ninguno la cubre, de su fecha NZ
    const payDay = new Map<RefBucket, string>();
    for (const b of payable) {
        const t = ms(b.scannedAt) as number;
        const own = refNzDate(t);
        const coveringDates: string[] = [];
        for (const [key, list] of segsByPersonDay) {
            if (!key.startsWith(b.pickerId + '|')) continue;
            for (const s of list) if (s.shift.checkOut && s.end > s.start && t >= s.start && t <= s.end) coveringDates.push(s.shift.date);
        }
        // Si la cubre un tramo de su propio día, se queda en su día
        payDay.set(b, coveringDates.length === 0 || coveringDates.includes(own) ? own : coveringDates.sort()[0]);
    }

    for (const list of segsByPersonDay.values()) {
        list.sort((a, b) => a.start - b.start);
        for (let i = 0; i < list.length; i++) {
            const seg = list[i];
            const next = i + 1 < list.length ? list[i + 1].start : Infinity;
            const out = ms(seg.shift.checkOut);
            if (out !== null) {
                seg.end = Math.max(seg.start, out);
            } else if (seg.shift.date === today) {
                seg.end = Math.max(seg.start, Math.min(nowMs, next));
            } else {
                let last = seg.start;
                for (const b of payable) {
                    const t = ms(b.scannedAt) as number;
                    const sameOrchard = !seg.shift.orchardId || !b.orchardId || seg.shift.orchardId === b.orchardId;
                    // Solo escaneos que son de ese día de pago
                    const sameDay = payDay.get(b) === seg.shift.date;
                    if (b.pickerId === seg.shift.pickerId && sameDay && t >= seg.start && t < next && sameOrchard && t > last) last = t;
                }
                seg.end = last;
            }
        }
    }

    const days: RefDay[] = [];
    for (const pickerId of people) {
        const dates = new Set<string>();
        for (const key of segsByPersonDay.keys()) if (key.startsWith(pickerId + '|')) dates.add(key.split('|')[1]);
        for (const b of payable) if (b.pickerId === pickerId) dates.add(payDay.get(b) as string);

        for (const date of [...dates].sort()) {
            const segs = segsByPersonDay.get(k(pickerId, date)) ?? [];
            const dayBuckets = payable.filter(b => b.pickerId === pickerId && payDay.get(b) === date);

            // R2/R3/R5: minutos brutos, trayecto y descanso
            let workMs = 0;
            let travelMs = 0;
            const travelBySeg = segs.map(() => 0);
            let breakMin = 0;
            let weights: Array<{ orchardId: string | null; w: number }> = [];
            if (segs.length > 0) {
                // Tramos solapados (error al corregir la hoja): cada uno empieza donde
                // acabó lo ya cubierto; uno que queda DENTRO de otro no cuenta ni
                // para trayectos
                let coveredUntil = -Infinity;
                const clipped = segs.map(s => {
                    const contained = coveredUntil > s.start && s.end <= coveredUntil;
                    const start = Math.max(s.start, coveredUntil);
                    const end = Math.max(start, s.end);
                    coveredUntil = Math.max(coveredUntil, end);
                    return { ...s, start, end, contained };
                });
                workMs = unionLength(segs.map(s => [s.start, s.end] as [number, number]));
                let prev = -1;
                clipped.forEach((b, i) => {
                    if (b.contained) return;
                    if (prev >= 0) {
                        const a = clipped[prev];
                        if (a.shift.orchardId && b.shift.orchardId && a.shift.orchardId !== b.shift.orchardId) {
                            const gap = Math.max(0, b.start - a.end);
                            travelMs += gap;
                            travelBySeg[prev] += gap / 2;
                            travelBySeg[i] += gap / 2;
                        }
                    }
                    prev = i;
                });
                const mealSetting = segs.find(s => s.shift.breakMinutes != null)?.shift.breakMinutes ?? DEFAULT_MEAL_MIN;
                const withBreak = clipped.find(s => {
                    const bs = ms(s.shift.breakStart);
                    return bs !== null && bs >= s.start && bs < s.end;
                });
                // R3: solo el descanso anotado; nunca uno supuesto
                if (withBreak) {
                    const bs = ms(withBreak.shift.breakStart) as number;
                    breakMin = Math.min(mealSetting, (withBreak.end - bs) / MIN_MS);
                }
                weights = clipped.map((s, i) => ({ orchardId: s.shift.orchardId, w: (s.end - s.start) + travelBySeg[i] }));
            } else {
                const times = dayBuckets.map(b => ms(b.scannedAt) as number);
                if (times.length > 0) {
                    // Sin fichaje no hay descanso anotado: no se descuenta (R3)
                    workMs = Math.max(...times) - Math.min(...times);
                }
            }
            let hours = Math.max(0, (workMs + travelMs) / MIN_MS - breakMin) / 60;
            if (cfg.hoursRounding === 'centihour') hours = Math.round(hours * 100 + 1e-9) / 100;

            if (hours === 0 && dayBuckets.length === 0) continue;

            // R6/R7/R8/R9: céntimos
            const rateCents = (b: RefBucket) => Math.round(refRate(b, cfg.rates) * 100);
            const pieceCents = dayBuckets.reduce((s, b) => s + rateCents(b), 0);
            const minWage = Math.max(REF_LEGAL_MIN_WAGE, cfg.minWage || 0, cfg.contractRates?.[pickerId] ?? 0);
            const holiday = cfg.holidays.has(date);
            const mult = holiday ? 1.5 : 1;
            const minimumCents = hours * minWage * 100;
            // Plus festivo al céntimo más cercano; complemento hacia ARRIBA (nunca bajo el mínimo)
            const premiumCents = holiday ? Math.round(pieceCents * 0.5) : 0;
            const topUpCents = Math.max(0, Math.ceil(mult * minimumCents - pieceCents - premiumCents - 1e-6));
            const totalCents = pieceCents + premiumCents + topUpCents;

            // R10: reparto por huerto
            const orchardIds = new Set<string | null>([...weights.map(w => w.orchardId), ...dayBuckets.map(b => b.orchardId)]);
            const totalW = weights.reduce((s, w) => s + w.w, 0);
            const byOrchard: RefOrchardShare[] = [...orchardIds].map(o => {
                const share = totalW > 0
                    ? weights.filter(w => w.orchardId === o).reduce((s, w) => s + w.w, 0) / totalW
                    : dayBuckets.filter(b => b.orchardId === o).length / Math.max(1, dayBuckets.length);
                const ob = dayBuckets.filter(b => b.orchardId === o);
                const op = ob.reduce((s, b) => s + rateCents(b), 0);
                const oprem = holiday ? Math.round(op * 0.5) : 0;
                const otop = Math.round(topUpCents * share);
                return { orchardId: o, hours: hours * share, buckets: ob.length, pieceCents: op, premiumCents: oprem, topUpCents: otop, totalCents: op + oprem + otop };
            });

            days.push({
                pickerId, date, hours, breakMinutes: breakMin, travelMinutes: travelMs / MIN_MS,
                buckets: dayBuckets.length, pieceCents, premiumCents, topUpCents, totalCents, holiday, byOrchard,
            });
        }
    }
    return days.sort((a, b) => a.pickerId.localeCompare(b.pickerId) || a.date.localeCompare(b.date));
}

/** Totales de la semana por persona (suma de días: nunca se agrega antes) */
export function referenceWeek(days: ReadonlyArray<RefDay>): Map<string, { hours: number; buckets: number; pieceCents: number; premiumCents: number; topUpCents: number; totalCents: number }> {
    const out = new Map<string, { hours: number; buckets: number; pieceCents: number; premiumCents: number; topUpCents: number; totalCents: number }>();
    for (const d of days) {
        const e = out.get(d.pickerId) ?? { hours: 0, buckets: 0, pieceCents: 0, premiumCents: 0, topUpCents: 0, totalCents: 0 };
        e.hours += d.hours;
        e.buckets += d.buckets;
        e.pieceCents += d.pieceCents;
        e.premiumCents += d.premiumCents;
        e.topUpCents += d.topUpCents;
        e.totalCents += d.totalCents;
        out.set(d.pickerId, e);
    }
    return out;
}

/**
 * Festivos nacionales NZ (Holidays Act 2003, con "Mondayisation"), comprobados
 * a mano con el calendario: lista independiente de la de la app.
 */
export const REF_NZ_PUBLIC_HOLIDAYS: ReadonlySet<string> = new Set([
    // 2026: Año Nuevo jue/vie, Waitangi vie, Viernes Santo 3-abr (Pascua 5-abr), Lunes de Pascua,
    // ANZAC sáb 25 → lun 27, King's Birthday 1er lunes de junio, Matariki 10-jul,
    // Labour Day 4º lunes de octubre, Navidad vie, Boxing Day sáb → lun 28
    '2026-01-01', '2026-01-02', '2026-02-06', '2026-04-03', '2026-04-06', '2026-04-27',
    '2026-06-01', '2026-07-10', '2026-10-26', '2026-12-25', '2026-12-28',
    // 2027: 2-ene sáb → lun 4, Waitangi sáb → lun 8, Pascua 28-mar, ANZAC dom → lun 26,
    // King's Birthday 7-jun, Matariki 25-jun, Labour Day 25-oct, Navidad sáb → lun 27, Boxing dom → mar 28
    '2027-01-01', '2027-01-04', '2027-02-08', '2027-03-26', '2027-03-29', '2027-04-26',
    '2027-06-07', '2027-06-25', '2027-10-25', '2027-12-27', '2027-12-28',
]);
