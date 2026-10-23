/**
 * Sync Processors — Strategy Pattern barrel export.
 *
 * Each processor handles a specific domain's sync logic,
 * keeping the main sync.service.ts as a pure orchestrator.
 */
export { processContract } from './contract.processor';
export { processTransport } from './transport.processor';
export { processTimesheet } from './timesheet.processor';
export { processAttendance } from './attendance.processor';
export { processPicker } from './picker.processor';
export { processQCInspection } from './qc-inspection.processor';
export { processUnlink } from './unlink.processor';
export { processBin } from './bin.processor';
export { processLeaveRequest } from './leave.processor';

export type {
    ScanPayload,
    MessagePayload,
    AttendancePayload,
    ContractPayload,
    TransportPayload,
    TimesheetPayload,
    PickerPayload,
    QCInspectionPayload,
    BinPayload,
    LeaveRequestPayload,
    SyncPayload,
    PendingItem,
} from './types';
