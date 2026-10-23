/**
 * Rechazo definitivo del servidor (4xx con motivo: día cerrado, semana cerrada,
 * fuera de tu equipo, hora del móvil imposible…). Reintentarlo no lo arregla:
 * la pasada lo manda directo a la cola de fallidos con el motivo, que el team
 * leader ve en el aviso rojo de sincronización.
 */
export class SyncRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncRejectedError';
  }
}

/** Estados HTTP que son una decisión del servidor (no un fallo pasajero) */
const REJECTION_STATUSES = new Set([400, 403, 404, 409, 422]);

export function isSyncRejected(error: unknown): error is SyncRejectedError {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'SyncRejectedError';
}

/** ¿Este error de la Edge Function es un rechazo definitivo? (401/408/429/5xx/red: no) */
export function isServerRejection(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && REJECTION_STATUSES.has(status);
}
