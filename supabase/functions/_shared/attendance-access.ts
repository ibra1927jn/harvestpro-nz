/**
 * Quién puede fichar / corregir a quién (manage-attendance; también para
 * correct_batch de #71). Misma regla que la política RLS "Manage attendance"
 * (migración 20261023011000_attendance_team_scope):
 *
 * - admin: cualquier persona en cualquier huerto
 * - manager: su huerto
 * - team_leader: su huerto, y la persona es de SU equipo o no tiene equipo
 *   (regla del 16-10: puede coger a gente sin equipo)
 *
 * El servidor lo comprueba antes de escribir para responder 403 con un
 * mensaje claro (RLS solo dejaría la fila sin tocar) y antes de usar la clave
 * de servicio (check_in cierra con ella el turno abierto en otro huerto).
 */
import { AuthError } from './security.ts'

export interface AttendanceCaller {
    id: string
    role: string
    orchardId: string | null
}

export interface PickerTeam {
    id: string
    team_leader_id: string | null
}

// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any }

/** Rol y huerto de quien llama (la fila propia de users se lee con su sesión) */
export async function loadAttendanceCaller(db: Db, userId: string): Promise<AttendanceCaller> {
    const { data, error } = await db.from('users').select('role, orchard_id').eq('id', userId).single()
    if (error || !data) throw new AuthError('Account not found', 403)
    return { id: userId, role: String(data.role ?? ''), orchardId: (data.orchard_id as string | null) ?? null }
}

/**
 * Regla pura (sin red): null si puede, o el motivo del 403.
 * `picker` = fila de pickers de la persona (null si no existe).
 */
export function attendanceDenialReason(
    caller: AttendanceCaller,
    picker: PickerTeam | null,
    orchardId: string,
): string | null {
    if (caller.role === 'admin') return null
    if (!caller.orchardId || caller.orchardId !== orchardId) {
        return 'You can only manage attendance in your own orchard'
    }
    if (caller.role === 'manager') return null
    if (caller.role === 'team_leader') {
        if (!picker) return 'Person not found in this orchard'
        if (picker.team_leader_id === null || picker.team_leader_id === caller.id) return null
        return 'This person belongs to another team: only their team leader, a manager or HR can change their attendance'
    }
    return 'Not allowed to manage attendance'
}

/**
 * Lanza AuthError 403 si quien llama no puede tocar los fichajes de esta
 * persona en este huerto. `db` debe ver la fila de pickers (clave de servicio).
 */
export async function assertCanTouchPicker(
    db: Db,
    caller: AttendanceCaller,
    target: { pickerId: string; orchardId: string },
): Promise<void> {
    let picker: PickerTeam | null = null
    if (caller.role === 'team_leader') {
        const { data, error } = await db.from('pickers')
            .select('id, team_leader_id')
            .eq('id', target.pickerId)
            .maybeSingle()
        if (error) throw new Error(`Picker lookup failed: ${error.message}`)
        picker = (data as PickerTeam | null) ?? null
    }
    const reason = attendanceDenialReason(caller, picker, target.orchardId)
    if (reason) throw new AuthError(reason, 403)
}

/**
 * Errores de la BD que tienen respuesta propia: día cerrado (B3) y semana de
 * pago cerrada → 409 con el código delante para que la app lo reconozca.
 */
export function lockedPeriodError(message: string | undefined): AuthError | null {
    if (!message) return null
    if (message.includes('DAY_CLOSED')) {
        return new AuthError('DAY_CLOSED: this day is closed. Only an admin can change its timesheets.', 409)
    }
    if (message.includes('PAY_WEEK_CLOSED')) {
        return new AuthError('PAY_WEEK_CLOSED: the pay week of this timesheet is closed. Reopen it to change timesheets.', 409)
    }
    return null
}
