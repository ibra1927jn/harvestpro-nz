/**
 * Generadores fast-check de semanas de trabajo para las pruebas diferenciales
 * de nómina. Producen tramos (daily_attendance) y cubetas (bucket_records) con
 * casos raros: varios huertos, tramos abiertos, descansos fuera del turno,
 * cambios de hora, medianoche, festivos, días sin cubetas, rechazos, etc.
 */
import fc from 'fast-check';
import { refNzDate, type RefBucket, type RefRates, type RefShift } from './reference';

export const ORCHARDS = ['orch-a', 'orch-b', 'orch-c'] as const;
export const VARIETIES = ['Royal Gala', 'Jazz', 'Envy', 'jazz ', null] as const;

/**
 * Lunes de semanas interesantes: cambio de hora (27-sep-2026, 4-abr-2027),
 * festivos (Labour Day, Navidad, Waitangi, Pascua+ANZAC, Matariki) y una normal.
 */
export const WEEK_STARTS = [
    '2026-09-21', // DST empieza el domingo 27
    '2026-10-26', // Labour Day (lunes)
    '2026-12-21', // Navidad (viernes 25)
    '2026-12-28', // Boxing Day observado + Año Nuevo
    '2027-02-08', // Waitangi observado (lunes)
    '2027-03-29', // Lunes de Pascua; DST termina el domingo 4-abr
    '2027-04-26', // ANZAC observado
    '2027-06-21', // Matariki (viernes 25)
    '2026-10-12', // semana normal
] as const;

const HOUR = 3_600_000;
const MIN = 60_000;

/** Medianoche NZ aproximada (UTC−12 h) del día: sirve de base; la fecha real se calcula luego */
function approxNzMidnight(dateYMD: string): number {
    const [y, m, d] = dateYMD.split('-').map(Number);
    return Date.UTC(y, m - 1, d) - 12 * HOUR;
}

function addDays(dateYMD: string, n: number): string {
    const [y, m, d] = dateYMD.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const iso = (t: number) => new Date(t).toISOString();

const segmentArb = fc.record({
    orchard: fc.constantFrom(...ORCHARDS),
    /** Hueco desde el tramo anterior (min). Negativo = tramos solapados (error de fichaje) */
    gapMin: fc.oneof({ weight: 8, arbitrary: fc.integer({ min: 0, max: 120 }) }, { weight: 1, arbitrary: fc.integer({ min: -60, max: -1 }) }),
    lengthMin: fc.oneof({ weight: 6, arbitrary: fc.integer({ min: 30, max: 9 * 60 }) }, { weight: 1, arbitrary: fc.integer({ min: 0, max: 29 }) }),
    open: fc.integer({ min: 0, max: 9 }).map(n => n < 3),
    breakMode: fc.constantFrom('none', 'inside', 'outside', 'near-end'),
    breakOffsetMin: fc.integer({ min: 0, max: 600 }),
    breakMinutes: fc.constantFrom<number | null>(null, null, 30, 0, 20, 45),
    bucketCount: fc.oneof({ weight: 6, arbitrary: fc.integer({ min: 0, max: 40 }) }, { weight: 1, arbitrary: fc.integer({ min: 200, max: 500 }) }),
    variety: fc.constantFrom(...VARIETIES),
    /** Cubetas antes de la entrada / después de la salida (min) */
    spillMin: fc.integer({ min: 0, max: 60 }),
});

const dayArb = fc.record({
    dayIndex: fc.integer({ min: 0, max: 6 }),
    /** Minuto del día NZ (aprox.) de la primera entrada; >1320 = cruza medianoche */
    startMin: fc.oneof({ weight: 8, arbitrary: fc.integer({ min: 300, max: 720 }) }, { weight: 1, arbitrary: fc.integer({ min: 1320, max: 1430 }) }),
    segments: fc.array(segmentArb, { minLength: 0, maxLength: 3 }),
    /** Sin fichaje: solo cubetas (estimado por escaneos) */
    scanOnlyBuckets: fc.integer({ min: 0, max: 30 }),
    seed: fc.integer({ min: 0, max: 1_000_000 }),
});

export interface GeneratedWeek {
    weekStart: string;
    weekEnd: string;
    shifts: RefShift[];
    buckets: RefBucket[];
    rates: RefRates;
    minWage: number;
    now: Date;
}

/** PRNG simple y determinista (para repartir grados y escaneos sin romper el shrinking) */
function prng(seed: number): () => number {
    let s = seed >>> 0 || 1;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0x1_0000_0000;
    };
}

const ratesArb: fc.Arbitrary<RefRates> = fc.record({
    fallback: fc.constantFrom(6.5, 7, 5.85),
    orchardRates: fc.record({ 'orch-a': fc.constantFrom(6.5, 7.25), 'orch-b': fc.constantFrom(8, 6.75) }),
    varietyRates: fc.subarray([
        { orchardId: null, variety: 'Jazz', rate: 9.1 },
        { orchardId: 'orch-b', variety: 'Jazz', rate: 9.95 },
        { orchardId: null, variety: 'Envy', rate: 11.35 },
        { orchardId: 'orch-c', variety: 'Royal Gala', rate: 5.55 },
    ]),
});

export const weekArb: fc.Arbitrary<GeneratedWeek> = fc.record({
    weekStart: fc.constantFrom(...WEEK_STARTS),
    pickers: fc.array(fc.array(dayArb, { minLength: 1, maxLength: 7 }), { minLength: 1, maxLength: 3 }),
    rates: ratesArb,
    minWage: fc.constantFrom(23.95, 0, 22.7, 25.5),
    /** "Ahora": tras la semana (todo cerrado) o dentro de ella (turnos de hoy en curso) */
    nowOffsetHours: fc.oneof(fc.constant(24 * 9), fc.integer({ min: 6, max: 24 * 7 })),
}).map(({ weekStart, pickers, rates, minWage, nowOffsetHours }) => {
    const shifts: RefShift[] = [];
    const buckets: RefBucket[] = [];
    pickers.forEach((days, pi) => {
        const pickerId = `picker-${pi + 1}`;
        const usedDays = new Set<number>();
        for (const day of days) {
            if (usedDays.has(day.dayIndex)) continue;
            usedDays.add(day.dayIndex);
            const rnd = prng(day.seed);
            const date = addDays(weekStart, day.dayIndex);
            let cursor = approxNzMidnight(date) + day.startMin * MIN;
            let openUsed = false;
            day.segments.forEach((seg, si) => {
                const start = si === 0 ? cursor : cursor + seg.gapMin * MIN;
                const end = start + seg.lengthMin * MIN;
                // Como mucho un tramo abierto por persona y día (índice único en la BD)
                const open = seg.open && !openUsed && si === day.segments.length - 1;
                if (open) openUsed = true;
                let breakStart: string | null = null;
                if (seg.breakMode === 'inside') breakStart = iso(start + (seg.breakOffsetMin % Math.max(1, seg.lengthMin)) * MIN);
                if (seg.breakMode === 'outside') breakStart = iso(end + (seg.breakOffsetMin + 1) * MIN);
                if (seg.breakMode === 'near-end') breakStart = iso(end - Math.min(10, seg.lengthMin) * MIN);
                const checkIn = iso(start);
                shifts.push({
                    pickerId,
                    orchardId: seg.orchard,
                    date: refNzDate(checkIn),
                    checkIn,
                    checkOut: open ? null : iso(end),
                    breakStart,
                    breakMinutes: seg.breakMinutes,
                });
                for (let b = 0; b < seg.bucketCount; b++) {
                    const span = seg.lengthMin + 2 * seg.spillMin;
                    const t = start - seg.spillMin * MIN + Math.floor(rnd() * Math.max(1, span)) * MIN;
                    const r = rnd();
                    buckets.push({
                        pickerId,
                        orchardId: seg.orchard,
                        variety: seg.variety,
                        scannedAt: iso(t),
                        grade: r < 0.1 ? 'reject' : r < 0.4 ? 'A' : r < 0.6 ? 'B' : r < 0.7 ? 'C' : null,
                    });
                }
                cursor = end;
            });
            // Día sin fichaje: cubetas sueltas entre las 8:00 y las 15:00 (aprox.)
            if (day.segments.length === 0) {
                for (let b = 0; b < day.scanOnlyBuckets; b++) {
                    const t = approxNzMidnight(date) + (8 * 60 + Math.floor(rnd() * 7 * 60)) * MIN;
                    buckets.push({ pickerId, orchardId: ORCHARDS[b % 2], variety: VARIETIES[b % VARIETIES.length], scannedAt: iso(t), grade: rnd() < 0.1 ? 'reject' : 'A' });
                }
            }
        }
    });
    return {
        weekStart,
        weekEnd: addDays(weekStart, 6),
        shifts,
        buckets,
        rates,
        minWage,
        now: new Date(approxNzMidnight(weekStart) + nowOffsetHours * HOUR),
    };
});

/** Número de ejecuciones: rápido por defecto; PAYROLL_DIFF_RUNS=5000 para una pasada larga */
export function diffRuns(defaultRuns = 150): number {
    const env = typeof process !== 'undefined' ? process.env.PAYROLL_DIFF_RUNS : undefined;
    const n = env ? Number(env) : NaN;
    return Number.isFinite(n) && n > 0 ? n : defaultRuns;
}
