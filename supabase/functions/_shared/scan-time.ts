/**
 * ¿Es creíble la hora de un escaneo que llega del móvil?
 *
 * El móvil guarda la hora con SU reloj (corregido con el desfase que el
 * servidor le enseñó, si ya lo conocía) y puede subirlo horas o días después
 * (sin cobertura). Regla, de menos a más grave:
 *
 *  - Escaneo de hace días (> OLD_SCAN_FLAG_MS): se guarda y se marca para que
 *    el manager lo mire (puede ser un móvil que estuvo sin red una semana). Si
 *    la semana de pago ya está cerrada, el trigger de la BD lo rechaza.
 *  - Reloj del móvil desfasado al subir (> CLOCK_FLAG_MS, medido con client_now
 *    y descontando la corrección que ya aplicó el móvil): se guarda con su
 *    hora y se marca ("la hora puede estar mal").
 *  - En el futuro (> FUTURE_TOLERANCE_MS sobre la hora del servidor):
 *      · si el desfase medido del móvil lo explica (reloj adelantado), se
 *        guarda con la hora corregida y se marca;
 *      · si no, se rechaza: un escaneo real no puede ser del futuro.
 *
 * Ante la duda se marca, no se rechaza: un rechazo deja la cubeta fuera de la
 * paga hasta que alguien la meta a mano.
 *
 * Nunca se guarda una hora del futuro: lo que queda dentro de la tolerancia
 * (unos minutos por delante del servidor) se guarda con la hora del servidor.
 */
export const FUTURE_TOLERANCE_MS = 5 * 60_000
export const CLOCK_FLAG_MS = 5 * 60_000
export const OLD_SCAN_FLAG_MS = 7 * 24 * 3_600_000

export type ScanTimeVerdict =
    | { verdict: 'ok'; scannedAt: string }
    | { verdict: 'flag'; scannedAt: string; reason: string }
    | { verdict: 'reject'; reason: string }

const minutes = (ms: number) => Math.round(Math.abs(ms) / 60_000)

/**
 * @param scannedAt   hora del escaneo enviada por el móvil (ISO con zona)
 * @param serverNow   Date.now() del servidor al recibir el lote
 * @param clientNow   Date.now() del móvil al enviar (ms) o null si no lo mandó
 * @param skewApplied corrección (ms) que el móvil ya sumó a scannedAt
 */
export function checkScanTime(
    scannedAt: string,
    serverNow: number,
    clientNow: number | null,
    skewApplied = 0,
): ScanTimeVerdict {
    const v = judgeScanTime(scannedAt, serverNow, clientNow, skewApplied)
    if (v.verdict === 'reject' || Date.parse(v.scannedAt) <= serverNow) return v
    return { ...v, scannedAt: new Date(serverNow).toISOString() }
}

/**
 * Desfase medido del reloj del móvil al subir (ms, servidor − móvil) para
 * apuntarlo con el escaneo; si el móvil no mandó client_now, lo que corrigió él.
 */
export function measuredSkew(serverNow: number, clientNow: number | null, skewApplied: number | null | undefined): number | null {
    if (clientNow !== null && Number.isFinite(clientNow)) return Math.round(serverNow - clientNow)
    return skewApplied ? Math.round(skewApplied) : null
}

function judgeScanTime(
    scannedAt: string,
    serverNow: number,
    clientNow: number | null,
    skewApplied: number,
): ScanTimeVerdict {
    const t = Date.parse(scannedAt)
    if (Number.isNaN(t)) return { verdict: 'reject', reason: 'INVALID_SCAN_TIME: scanned_at is not a date' }

    // Error de la hora guardada = desfase del móvil ahora − lo ya corregido
    const residual = clientNow !== null && Number.isFinite(clientNow) ? (serverNow - clientNow) - skewApplied : null

    if (t > serverNow + FUTURE_TOLERANCE_MS) {
        if (residual !== null && residual < -CLOCK_FLAG_MS && t + residual <= serverNow + FUTURE_TOLERANCE_MS) {
            const fixed = new Date(t + residual).toISOString()
            return {
                verdict: 'flag',
                scannedAt: fixed,
                reason: `PHONE_CLOCK_AHEAD: phone clock ${minutes(residual)} min ahead; time corrected from ${scannedAt} to ${fixed}`,
            }
        }
        return {
            verdict: 'reject',
            reason: `SCAN_TIME_IN_FUTURE: scanned_at is ${minutes(t - serverNow)} min ahead of server time (phone clock wrong?)`,
        }
    }
    if (residual !== null && Math.abs(residual) > CLOCK_FLAG_MS) {
        return {
            verdict: 'flag',
            scannedAt,
            reason: `PHONE_CLOCK_OFF: phone clock ${minutes(residual)} min ${residual > 0 ? 'behind' : 'ahead'}; check this scan's time`,
        }
    }
    if (serverNow - t > OLD_SCAN_FLAG_MS) {
        return {
            verdict: 'flag',
            scannedAt,
            reason: `OLD_SCAN: scanned ${Math.floor((serverNow - t) / 86_400_000)} days before upload`,
        }
    }
    return { verdict: 'ok', scannedAt }
}
