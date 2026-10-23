/**
 * Hora de un fichaje (manage-attendance: entrada, salida, descansos).
 *
 * La hora la pone el servidor. Solo cuando el móvil manda la suya (`at`, pase
 * de lista guardado sin red y enviado después) se usa la del móvil:
 *   · corregida con el desfase que el servidor mide ahora (client_now, hora del
 *     móvil al enviar), descontando la corrección que el móvil ya aplicó
 *     (clock_skew_ms); por debajo de DEVICE_SKEW_IGNORE_MS no se toca (ruido
 *     de la red);
 *   · nunca del futuro: unos minutos por delante (FUTURE_TOLERANCE_MS) se
 *     quedan en la hora del servidor; más, se rechaza;
 *   · más antigua que MAX_PAST_MS: se rechaza (se corrige en la hoja de horas).
 * Devuelve el desfase total aplicado para apuntarlo en el fichaje.
 */
export const DEVICE_SKEW_IGNORE_MS = 2 * 60_000
export const FUTURE_TOLERANCE_MS = 5 * 60_000
export const MAX_PAST_MS = 36 * 3_600_000

export interface ResolvedTime {
    /** Hora a guardar (ISO) */
    at: string
    /** null = hora del servidor; si no, desfase total aplicado (ms, servidor − móvil) */
    skewMs: number | null
}

export class DeviceTimeError extends Error {}

export function resolveDeviceTime(
    at: string | undefined,
    serverNow: number,
    clientNow?: number | null,
    skewApplied?: number | null,
): ResolvedTime {
    if (!at) return { at: new Date(serverNow).toISOString(), skewMs: null }
    const raw = Date.parse(at)
    if (Number.isNaN(raw)) throw new DeviceTimeError('TIME_OUT_OF_RANGE: the phone time is not a date.')

    const applied = skewApplied ?? 0
    // Error que queda en la hora del móvil = desfase medido ahora − lo ya corregido
    const residual = typeof clientNow === 'number' && Number.isFinite(clientNow)
        ? (serverNow - clientNow) - applied
        : 0
    const extra = Math.abs(residual) > DEVICE_SKEW_IGNORE_MS ? residual : 0
    let ms = raw + extra

    if (ms > serverNow + FUTURE_TOLERANCE_MS || ms < serverNow - MAX_PAST_MS) {
        throw new DeviceTimeError('TIME_OUT_OF_RANGE: the phone time is too far from the server time. Check the phone clock and correct it in Timesheet.')
    }
    if (ms > serverNow) ms = serverNow
    return { at: new Date(ms).toISOString(), skewMs: Math.round(applied + extra) }
}
