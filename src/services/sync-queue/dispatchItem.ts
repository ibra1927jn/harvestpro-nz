/**
 * Envía un elemento de la cola a su procesador, validando antes el payload con Zod.
 */
import { bucketLedgerService } from '../bucket-ledger.service';
import { simpleMessagingService } from '../simple-messaging.service';
import { userService } from '../user.service';
import { toNZST } from '@/utils/nzst';
import type { QueuedSyncItem } from '../db';
import {
  processContract,
  processTransport,
  processTimesheet,
  processAttendance,
  processPicker,
  processQCInspection,
  processUnlink,
  processBin,
} from '../sync-processors';
import type { AttendancePayload, PickerPayload, QCInspectionPayload } from '../sync-processors';

export type SyncSchemas = typeof import('../sync.schemas');

type Handler = (item: QueuedSyncItem, schemas: SyncSchemas) => Promise<unknown>;

const HANDLERS: Record<QueuedSyncItem['type'], Handler> = {
  SCAN: (item, s) => {
    // 🔧 BUG-3 fix: validar el payload antes de procesarlo
    const scanData = s.ScanPayloadSchema.parse(item.payload);
    return bucketLedgerService.recordBucket({
      ...scanData,
      scanned_at: toNZST(new Date(item.timestamp)),
    } as Parameters<typeof bucketLedgerService.recordBucket>[0]);
  },
  ATTENDANCE: item => processAttendance(item.payload as AttendancePayload, item.updated_at),
  ASSIGNMENT: (item, s) => {
    const assignData = s.AssignmentPayloadSchema.parse(item.payload);
    return userService.assignUserToOrchard(assignData.userId, assignData.orchardId);
  },
  MESSAGE: (item, s) => {
    const msgData = s.MessagePayloadSchema.parse(item.payload);
    return simpleMessagingService.sendMessage(msgData.receiverId, msgData.content, msgData.type || 'direct');
  },
  // Procesadores extraídos (Strategy), con validación Zod
  CONTRACT: (item, s) => processContract(s.ContractPayloadSchema.parse(item.payload), item.updated_at),
  TRANSPORT: (item, s) => processTransport(s.TransportPayloadSchema.parse(item.payload), item.updated_at),
  TIMESHEET: (item, s) => processTimesheet(s.TimesheetPayloadSchema.parse(item.payload), item.updated_at),
  PICKER: (item, s) => processPicker(s.PickerPayloadSchema.parse(item.payload) as PickerPayload),
  QC_INSPECTION: (item, s) =>
    processQCInspection(s.QCInspectionPayloadSchema.parse(item.payload) as QCInspectionPayload),
  UNLINK: (item, s) => processUnlink(s.UnlinkPayloadSchema.parse(item.payload)),
  BIN: (item, s) => processBin(s.BinPayloadSchema.parse(item.payload)),
};

/**
 * Procesa el elemento. Devuelve false si el tipo es desconocido para esta versión
 * (no se ha enviado nada); lanza si el procesador o la validación fallan.
 */
export async function dispatchSyncItem(item: QueuedSyncItem, schemas: SyncSchemas): Promise<boolean> {
  const handler = Object.prototype.hasOwnProperty.call(HANDLERS, item.type) ? HANDLERS[item.type] : undefined;
  if (!handler) return false;
  await handler(item, schemas);
  return true;
}
