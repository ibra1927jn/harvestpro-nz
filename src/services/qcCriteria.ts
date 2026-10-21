/**
 * qcCriteria — criterios de la inspección de calidad de un picker.
 *
 * Seis criterios de cómo recoge la persona, cada uno en tres estados
 * (bien / regular / mal). De ellos salen la nota global (grade, lo que ya
 * consume el resto de la app) y una puntuación 0-100 más fina (score).
 * Lógica pura, sin React ni Supabase: la misma en la pantalla, en el servicio
 * y en los informes.
 *
 * Reglas (decisión provisional del coordinador, 2026-10-21, pendiente del dueño):
 * - Nota: todo ok = A; 1 warn = B; 1 bad o 2+ warn = C; 2+ bad o escaleras mal = reject.
 *   «Mal» en escaleras es rechazo directo (seguridad).
 * - Puntuación: cada criterio marcado pesa igual (ok = 100, warn = 50, bad = 0);
 *   escaleras mal fuerza 0. Coherente con A=100 / B=70 / C=40 / reject=0 del
 *   perfil del picker, pero con más resolución.
 * - Los criterios sin marcar no cuentan (una inspección parcial sigue valiendo).
 */
/** Nota global de la inspección (la columna grade de qc_inspections) */
export type QcGrade = 'A' | 'B' | 'C' | 'reject';

export const QC_CRITERION_KEYS = [
    'ladder',
    'tree_damage',
    'fruit_on_ground',
    'bucket_fill',
    'size',
    'damaged_fruit',
] as const;

export type QcCriterionKey = (typeof QC_CRITERION_KEYS)[number];
export type QcCriterionState = 'ok' | 'warn' | 'bad';
export const QC_CRITERION_STATES: readonly QcCriterionState[] = ['ok', 'warn', 'bad'];

/** Criterios marcados; falta la clave cuando el inspector no lo marcó */
export type QcCriteria = Partial<Record<QcCriterionKey, QcCriterionState>>;

/** Criterio de seguridad: «mal» es rechazo directo */
export const SAFETY_CRITERION: QcCriterionKey = 'ladder';

const SCORE_BY_STATE: Record<QcCriterionState, number> = { ok: 100, warn: 50, bad: 0 };

export function isQcCriterionKey(value: unknown): value is QcCriterionKey {
    return typeof value === 'string' && (QC_CRITERION_KEYS as readonly string[]).includes(value);
}

export function isQcCriterionState(value: unknown): value is QcCriterionState {
    return value === 'ok' || value === 'warn' || value === 'bad';
}

/** Solo las claves conocidas con un estado válido (lo demás se ignora) */
export function normalizeCriteria(input: unknown): QcCriteria {
    const out: QcCriteria = {};
    if (!input || typeof input !== 'object') return out;
    for (const [key, state] of Object.entries(input as Record<string, unknown>)) {
        if (isQcCriterionKey(key) && isQcCriterionState(state)) out[key] = state;
    }
    return out;
}

/** Criterios marcados (los que tienen estado) */
export function markedCriteria(criteria: QcCriteria): Array<[QcCriterionKey, QcCriterionState]> {
    return QC_CRITERION_KEYS.flatMap(key => {
        const state = criteria[key];
        return state ? [[key, state] as [QcCriterionKey, QcCriterionState]] : [];
    });
}

export function countCriteria(criteria: QcCriteria): { marked: number; warn: number; bad: number } {
    let warn = 0;
    let bad = 0;
    const marked = markedCriteria(criteria);
    for (const [, state] of marked) {
        if (state === 'warn') warn++;
        else if (state === 'bad') bad++;
    }
    return { marked: marked.length, warn, bad };
}

/** ¿Están marcados los seis? (Turbo solo avanza entonces) */
export function isCriteriaComplete(criteria: QcCriteria): boolean {
    return countCriteria(criteria).marked === QC_CRITERION_KEYS.length;
}

/**
 * Nota global a partir de los criterios marcados.
 * Todo ok = A; 1 warn = B; 1 bad o 2+ warn = C; 2+ bad o escaleras mal = reject.
 * Sin criterios marcados: A (no hay nada en contra); la pantalla no sugiere nota en ese caso.
 */
export function gradeFromCriteria(criteria: QcCriteria): QcGrade {
    if (criteria[SAFETY_CRITERION] === 'bad') return 'reject';
    const { warn, bad } = countCriteria(criteria);
    if (bad >= 2) return 'reject';
    if (bad === 1 || warn >= 2) return 'C';
    if (warn === 1) return 'B';
    return 'A';
}

/**
 * Puntuación 0-100: media de los criterios marcados (ok = 100, warn = 50, bad = 0),
 * redondeada; escaleras mal fuerza 0. Sin criterios marcados: 100 (nada en contra).
 */
export function scoreFromCriteria(criteria: QcCriteria): number {
    if (criteria[SAFETY_CRITERION] === 'bad') return 0;
    const marked = markedCriteria(criteria);
    if (marked.length === 0) return 100;
    const sum = marked.reduce((acc, [, state]) => acc + SCORE_BY_STATE[state], 0);
    return Math.round(sum / marked.length);
}

/** Recuento de regular / mal por criterio sobre varias inspecciones (informes) */
export interface CriterionFailureCount {
    key: QcCriterionKey;
    warn: number;
    bad: number;
    /** warn + bad */
    total: number;
}

/**
 * Criterios que más fallan: uno por criterio, ordenados por total (mal pesa
 * más que regular en el desempate), siempre los seis aunque estén a cero.
 */
export function countCriteriaFailures(
    inspections: ReadonlyArray<{ criteria?: unknown }>,
): CriterionFailureCount[] {
    const counts = new Map<QcCriterionKey, CriterionFailureCount>(
        QC_CRITERION_KEYS.map(key => [key, { key, warn: 0, bad: 0, total: 0 }]),
    );
    for (const insp of inspections) {
        const criteria = normalizeCriteria(insp.criteria);
        for (const [key, state] of markedCriteria(criteria)) {
            const c = counts.get(key)!;
            if (state === 'warn') c.warn++;
            else if (state === 'bad') c.bad++;
            else continue;
            c.total++;
        }
    }
    return [...counts.values()].sort((a, b) => b.total - a.total || b.bad - a.bad || QC_CRITERION_KEYS.indexOf(a.key) - QC_CRITERION_KEYS.indexOf(b.key));
}

/** El criterio que más falla, o null si ninguno falló */
export function worstCriterion(inspections: ReadonlyArray<{ criteria?: unknown }>): CriterionFailureCount | null {
    const [top] = countCriteriaFailures(inspections);
    return top && top.total > 0 ? top : null;
}
