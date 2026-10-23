/** Nombre legible (traducido) del tipo de cambio de la cola de sincronización */
import type { TFunction } from '@/i18n';

const TYPES = ['SCAN', 'MESSAGE', 'ATTENDANCE', 'ASSIGNMENT', 'CONTRACT', 'TRANSPORT', 'TIMESHEET', 'PICKER', 'QC_INSPECTION', 'UNLINK', 'BIN', 'LEAVE_REQUEST', 'CHAT_REACTION'];

export function syncTypeLabel(t: TFunction, type: string): string {
    return TYPES.includes(type) ? t(`sync.type.${type.toLowerCase()}`) : type;
}

/**
 * Motivo legible de un cambio que el servidor rechazó. Los de día o semana de
 * pago cerrados (p. ej. un pase de lista guardado sin red antes de cerrar el
 * día y enviado después) se dicen claro; el resto, tal cual llegó.
 */
export function syncFailureReason(t: TFunction, reason: string | undefined): string {
    const r = reason ?? '';
    if (r.includes('DAY_CLOSED')) return t('sync.reason.day_closed');
    if (r.includes('PAY_WEEK_CLOSED')) return t('sync.reason.pay_week_closed');
    return r;
}
