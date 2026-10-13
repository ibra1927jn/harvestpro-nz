// Payload types for different sync operations

export type ScanPayload = {
    picker_id: string;
    orchard_id: string;
    quality_grade: 'A' | 'B' | 'C' | 'reject';
    timestamp: string;
    row_number?: number;
};

export type MessagePayload = {
    channel_type: 'direct' | 'group' | 'team';
    recipient_id: string;
    sender_id: string;
    content: string;
    timestamp: string;
    priority?: string;
};

export type AttendancePayload = {
    picker_id: string;
    orchard_id: string;
    check_in?: string;
    check_out?: string;
    attendanceId?: string;  // for optimistic lock on checkout
    verifiedBy?: string;
};

// Phase 2: Offline-first payloads for HR, Logistics, Payroll
// CONFLICT RESOLUTION: Last-write-wins for all types below.
// This is a deliberate architectural decision for current scale.
// The updated_at column on DB tables allows future optimistic-locking.
export type ContractPayload = {
    action: 'create' | 'update';
    contractId?: string;
    employee_id?: string;
    orchard_id?: string;
    type?: string;
    status?: string;
    start_date?: string;
    end_date?: string;
    hourly_rate?: number;
    notes?: string;
};

export type TransportPayload = {
    action: 'create' | 'assign' | 'complete' | 'cancel';
    /** id generado en el móvil al encolar un create */
    id?: string;
    requestId?: string;
    vehicleId?: string;
    assignedBy?: string;
    orchard_id?: string;
    requested_by?: string;
    requester_name?: string;
    zone?: string;
    bins_count?: number;
    priority?: string;
    notes?: string;
};

export type TimesheetPayload = {
    action: 'approve' | 'reject';
    attendanceId: string;
    verifiedBy: string;
    notes?: string;
};

// 🔧 L26: Picker CRUD payload for offline-first crew management
export type PickerPayload = {
    id: string;
    picker_id: string;
    name: string;
    orchard_id: string;
    status?: string;
    role?: string;
    team_leader_id?: string | null;
    [key: string]: unknown;
};

// 🔧 L31: QC inspection payload for offline-first quality control
export type QCInspectionPayload = {
    orchard_id: string;
    picker_id: string;
    inspector_id: string;
    grade: 'A' | 'B' | 'C' | 'reject';
    notes?: string | null;
    photo_url?: string | null;
};

export type SyncPayload = ScanPayload | MessagePayload | AttendancePayload | ContractPayload | TransportPayload | TimesheetPayload | PickerPayload | QCInspectionPayload;

export interface PendingItem {
    id: string; // UUID (generated client-side)
    type: 'SCAN' | 'MESSAGE' | 'ATTENDANCE' | 'ASSIGNMENT' | 'CONTRACT' | 'TRANSPORT' | 'TIMESHEET' | 'PICKER' | 'QC_INSPECTION' | 'UNLINK';
    payload: SyncPayload;
    timestamp: number;
    retryCount: number;
    updated_at?: string; // ISO timestamp for conflict detection
}
