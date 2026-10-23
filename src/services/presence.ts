/**
 * presence — dónde está cada persona hoy, para Equipos del manager (auditoría 23-10, C):
 * fichado / en descanso / salió / de permiso / sin fichar hoy.
 * Sale de los fichajes de hoy del store (daily_attendance, en vivo) y de las
 * ausencias aprobadas. Lógica pura.
 */
export type Presence = 'on_shift' | 'on_break' | 'left' | 'on_leave' | 'not_in';

export interface PresenceInput {
    check_in?: string | null;
    check_out?: string | null;
    checked_in_today?: boolean;
    break_start?: string | null;
    break_minutes?: number | null;
    status?: string | null;
}

/** Descanso anotado por defecto si no se dijo cuánto (minutos) */
export const DEFAULT_BREAK_MINUTES = 30;

/**
 * Turno abierto → en descanso (dentro de su descanso anotado) o fichado.
 * Sin turno abierto: de permiso si tiene ausencia aprobada hoy; salió si fichó
 * hoy y ya cerró; si no, sin fichar. Lo que está pasando manda sobre la ausencia
 * (medio día de permiso y viene por la tarde).
 */
export function presenceOf(p: PresenceInput, onLeave: boolean, now: Date = new Date()): Presence {
    const open = !!p.check_in && !p.check_out;
    if (open) {
        if (p.status === 'on_break' || p.status === 'break') return 'on_break';
        if (p.break_start) {
            const start = Date.parse(p.break_start);
            const mins = p.break_minutes ?? DEFAULT_BREAK_MINUTES;
            const t = now.getTime();
            if (!Number.isNaN(start) && start <= t && t < start + mins * 60_000) return 'on_break';
        }
        return 'on_shift';
    }
    if (onLeave) return 'on_leave';
    if (p.check_in && p.check_out) return 'left';
    if (p.checked_in_today) return 'left';
    return 'not_in';
}

/** Recuento por estado (cabecera de cada equipo) */
export function countPresence(list: ReadonlyArray<Presence>): Record<Presence, number> {
    const out: Record<Presence, number> = { on_shift: 0, on_break: 0, left: 0, on_leave: 0, not_in: 0 };
    for (const p of list) out[p]++;
    return out;
}
