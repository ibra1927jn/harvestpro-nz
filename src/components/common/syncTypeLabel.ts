/** Nombre legible (traducido) del tipo de cambio de la cola de sincronización */
import type { TFunction } from '@/i18n';

const TYPES = ['SCAN', 'MESSAGE', 'ATTENDANCE', 'ASSIGNMENT', 'CONTRACT', 'TRANSPORT', 'TIMESHEET', 'PICKER', 'QC_INSPECTION', 'UNLINK', 'LEAVE_REQUEST'];

export function syncTypeLabel(t: TFunction, type: string): string {
    return TYPES.includes(type) ? t(`sync.type.${type.toLowerCase()}`) : type;
}
