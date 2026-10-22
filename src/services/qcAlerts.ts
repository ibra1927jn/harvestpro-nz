/**
 * qcAlerts — avisos de calidad para el team leader y el manager (auditoría 23-10, C).
 *
 * Una inspección con nota «reject» o con algún criterio «mal» avisa al team
 * leader de la persona y a los managers del huerto. Lógica pura (sin React ni
 * Supabase): de qué inspecciones sale aviso, para quién y qué se enseña.
 */
import {
    QC_CRITERION_KEYS,
    normalizeCriteria,
    type QcCriterionKey,
    type QcGrade,
} from './qcCriteria';

/** Lo que se lee de una fila de qc_inspections (la del realtime o la de la consulta) */
export interface QcInspectionLike {
    id: string;
    picker_id: string;
    grade: QcGrade | string;
    created_at: string;
    criteria?: unknown;
    informed?: boolean | null;
    comfortable?: boolean | null;
}

export interface QcAlert {
    id: string;
    pickerId: string;
    pickerName: string;
    grade: QcGrade;
    /** Criterios marcados «mal», en el orden de la pantalla de QC */
    badCriteria: QcCriterionKey[];
    createdAt: string;
}

/** Persona del store con lo que hace falta para decidir el equipo */
export interface CrewMemberLike {
    id: string;
    name?: string | null;
    team_leader_id?: string | null;
}

/** Quién ve las respuestas de bienestar (informado / a gusto): nunca el perfil público */
const WELLBEING_ROLES: ReadonlySet<string> = new Set(['team_leader', 'manager', 'hr_admin', 'admin']);

export function canViewWellbeing(role: string | null | undefined): boolean {
    return !!role && WELLBEING_ROLES.has(role);
}

/** Roles que reciben avisos de calidad */
const ALERT_ROLES: ReadonlySet<string> = new Set(['team_leader', 'manager', 'admin']);

export function receivesQcAlerts(role: string | null | undefined): boolean {
    return !!role && ALERT_ROLES.has(role);
}

const GRADES: ReadonlySet<string> = new Set(['A', 'B', 'C', 'reject']);

export function asGrade(value: unknown): QcGrade {
    return typeof value === 'string' && GRADES.has(value) ? (value as QcGrade) : 'A';
}

/** Criterios marcados «mal» */
export function badCriteriaOf(insp: Pick<QcInspectionLike, 'criteria'>): QcCriterionKey[] {
    const c = normalizeCriteria(insp.criteria);
    return QC_CRITERION_KEYS.filter(k => c[k] === 'bad');
}

/** El peor criterio de la inspección: el primero «mal»; si no, el primero «regular» */
export function worstCriterionOf(insp: Pick<QcInspectionLike, 'criteria'>): { key: QcCriterionKey; state: 'bad' | 'warn' } | null {
    const c = normalizeCriteria(insp.criteria);
    const bad = QC_CRITERION_KEYS.find(k => c[k] === 'bad');
    if (bad) return { key: bad, state: 'bad' };
    const warn = QC_CRITERION_KEYS.find(k => c[k] === 'warn');
    return warn ? { key: warn, state: 'warn' } : null;
}

/** ¿Esta inspección avisa? Nota «reject» o algún criterio «mal» */
export function isQcAlert(insp: Pick<QcInspectionLike, 'grade' | 'criteria'>): boolean {
    return insp.grade === 'reject' || badCriteriaOf(insp).length > 0;
}

/** ¿Marcó la persona algo de bienestar que seguir? (solo para quien puede verlo) */
export function hasWellbeingFlag(insp: Pick<QcInspectionLike, 'informed' | 'comfortable'>): boolean {
    return insp.informed === false || insp.comfortable === false;
}

/**
 * Inspecciones que le tocan a quien mira: el manager (y admin) las de todo el
 * huerto; el team leader las de su equipo (pickers con team_leader_id = él).
 * El resto de roles, ninguna.
 */
export function scopeInspections<T extends QcInspectionLike>(params: {
    inspections: ReadonlyArray<T>;
    crew: ReadonlyArray<CrewMemberLike>;
    role: string | null | undefined;
    userId: string | null | undefined;
}): T[] {
    const { inspections, crew, role, userId } = params;
    if (role === 'manager' || role === 'admin') return [...inspections];
    if (role !== 'team_leader' || !userId) return [];
    const mine = new Set(crew.filter(p => p.team_leader_id === userId).map(p => p.id));
    return inspections.filter(i => mine.has(i.picker_id));
}

/** Une dos listas por id (la primera manda) y ordena de la más nueva a la más vieja */
export function mergeInspections<T extends QcInspectionLike>(a: ReadonlyArray<T>, b: ReadonlyArray<T>): T[] {
    const byId = new Map<string, T>();
    for (const i of [...a, ...b]) {
        if (i && typeof i.id === 'string' && !byId.has(i.id)) byId.set(i.id, i);
    }
    return [...byId.values()].sort((x, y) => (y.created_at ?? '').localeCompare(x.created_at ?? ''));
}

/** Avisos (ya filtrados por quien mira), más nuevos primero */
export function buildQcAlerts(params: {
    inspections: ReadonlyArray<QcInspectionLike>;
    crew: ReadonlyArray<CrewMemberLike>;
    role: string | null | undefined;
    userId: string | null | undefined;
}): QcAlert[] {
    const names = new Map(params.crew.map(p => [p.id, p.name ?? '']));
    return scopeInspections(params)
        .filter(isQcAlert)
        .sort((x, y) => (y.created_at ?? '').localeCompare(x.created_at ?? ''))
        .map(i => ({
            id: i.id,
            pickerId: i.picker_id,
            pickerName: names.get(i.picker_id) || '—',
            grade: asGrade(i.grade),
            badCriteria: badCriteriaOf(i),
            createdAt: i.created_at,
        }));
}

/** Cuántos avisos no se han visto todavía */
export function countUnseen(alerts: ReadonlyArray<Pick<QcAlert, 'id'>>, seen: ReadonlySet<string>): number {
    return alerts.reduce((n, a) => n + (seen.has(a.id) ? 0 : 1), 0);
}
