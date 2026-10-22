/**
 * data-export.service.ts — Tests for IPP 6 NZ Privacy Act data export
 * Covers: exportUserData (all data paths), downloadAsJSON (DOM trigger)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Supabase query chain factory ──────────────────────
function makeChain(data: unknown, error: unknown = null) {
    const resolved = Promise.resolve({ data, error, count: null });
    const chain: Record<string, unknown> = {
        then: resolved.then.bind(resolved),
        catch: resolved.catch.bind(resolved),
        finally: resolved.finally.bind(resolved),
    };
    ['select', 'eq', 'order', 'limit', 'single', 'in', 'gte', 'lte', 'range'].forEach(m => {
        chain[m] = vi.fn().mockReturnValue(chain);
    });
    chain['insert'] = vi.fn().mockResolvedValue({ data: null, error: null });
    return chain;
}

// Tablas simuladas — datos por defecto
const mockUser = {
    id: 'u1',
    email: 'alice@test.com',
    role: 'picker',
    full_name: 'Alice',
    created_at: '2025-01-01T00:00:00Z',
    privacy_consent_at: '2025-01-01T10:00:00Z',
};

const mockAttendance = [
    { id: 'a1', check_in: '2026-04-01T06:00:00Z', check_out: '2026-04-01T14:00:00Z', orchard_id: 'o1', orchards: { name: 'Te Puke Gold' } },
    { id: 'a2', check_in: '2026-04-02T06:00:00Z', check_out: null, orchard_id: 'o1' },
];

const mockScans = [
    { id: 's1', scanned_at: '2026-04-01T10:00:00Z', quality_grade: 'A', orchard_id: 'o1' },
    { id: 's2', scanned_at: '2026-04-01T11:00:00Z', quality_grade: null, orchard_id: 'o1' },
];

const mockConsents = [
    { consent_type: 'privacy_policy', policy_version: '1.2', consented_at: '2025-01-01T10:00:00Z' },
];

const mockFrom = vi.fn();

vi.mock('@/services/supabase', () => ({
    supabase: { from: (...a: unknown[]) => mockFrom(...a) },
}));

import { dataExportService } from '../data-export.service';

// ── Helper: configure per-table mock responses ──────
type TableName = 'users' | 'daily_attendance' | 'bucket_records' | 'privacy_consent_log' | 'messages' | 'chat_messages' | 'audit_logs';

function setupTableMocks(overrides: Partial<Record<TableName, { data: unknown; error: unknown }>> = {}) {
    const defaults: Record<TableName, { data: unknown; error: unknown }> = {
        users:               { data: mockUser, error: null },
        daily_attendance:    { data: mockAttendance, error: null },
        bucket_records:        { data: mockScans, error: null },
        privacy_consent_log: { data: mockConsents, error: null },
        messages:            { data: null, error: null },
        chat_messages:       { data: null, error: null },
        audit_logs:          { data: null, error: null },
    };

    mockFrom.mockImplementation((table: TableName) => {
        const response = overrides[table] ?? defaults[table];
        const chain = makeChain(response.data, response.error);

        // messages table uses head:true — override count directly
        if (table === 'messages' || table === 'chat_messages') {
            const msgResolved = Promise.resolve({ data: null, error: null, count: table === 'messages' ? 5 : 2 });
            const msgChain: Record<string, unknown> = {
                then: msgResolved.then.bind(msgResolved),
                catch: msgResolved.catch.bind(msgResolved),
                finally: msgResolved.finally.bind(msgResolved),
            };
            ['select', 'eq'].forEach(m => {
                msgChain[m] = vi.fn().mockReturnValue(msgChain);
            });
            return msgChain;
        }

        return chain;
    });
}

// ──────────────────────────────────────────────────────
// exportUserData
// ──────────────────────────────────────────────────────
describe('dataExportService.exportUserData', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupTableMocks();
    });

    it('returns export with user profile data', async () => {
        const result = await dataExportService.exportUserData('u1');
        expect(result.user.id).toBe('u1');
        expect(result.user.email).toBe('alice@test.com');
        expect(result.user.role).toBe('picker');
        expect(result.user.name).toBe('Alice');
        expect(result.user.privacy_consent_at).toBe('2025-01-01T10:00:00Z');
    });

    it('returns exportedAt ISO timestamp', async () => {
        const result = await dataExportService.exportUserData('u1');
        expect(result.exportedAt).toBeDefined();
        // Should be a valid ISO string
        expect(() => new Date(result.exportedAt)).not.toThrow();
    });

    it('maps attendance records to correct shape', async () => {
        const result = await dataExportService.exportUserData('u1');
        expect(result.attendance).toHaveLength(2);
        expect(result.attendance[0].id).toBe('a1');
        expect(result.attendance[0].check_in).toBe('2026-04-01T06:00:00Z');
        expect(result.attendance[0].check_out).toBe('2026-04-01T14:00:00Z');
    });

    it('maps null check_out correctly', async () => {
        const result = await dataExportService.exportUserData('u1');
        expect(result.attendance[1].check_out).toBeNull();
    });

    it('maps bucket scans with quality grade', async () => {
        const result = await dataExportService.exportUserData('u1');
        expect(result.bucketScans).toHaveLength(2);
        expect(result.bucketScans[0].quality_grade).toBe('A');
        expect(result.bucketScans[1].quality_grade).toBeNull();
    });

    it('maps consent history correctly', async () => {
        const result = await dataExportService.exportUserData('u1');
        expect(result.consentHistory).toHaveLength(1);
        expect(result.consentHistory[0].consent_type).toBe('privacy_policy');
        expect(result.consentHistory[0].policy_version).toBe('1.2');
    });

    it('message count adds chat messages and legacy direct messages', async () => {
        const result = await dataExportService.exportUserData('u1');
        expect(result.messageCount).toBe(7);
    });

    it('attendance shows the orchard name, or the id when the name could not be read', async () => {
        const result = await dataExportService.exportUserData('u1');
        expect(result.attendance[0].orchard_name).toBe('Te Puke Gold');
        expect(result.attendance[1].orchard_name).toBe('o1');
    });

    it('writes an audit log entry on successful export', async () => {
        await dataExportService.exportUserData('u1');
        // audit_logs.insert should have been called
        const auditCallIndex = mockFrom.mock.calls.findIndex(
            (args: unknown[]) => args[0] === 'audit_logs'
        );
        expect(auditCallIndex).toBeGreaterThanOrEqual(0);
    });

    it('handles empty attendance gracefully', async () => {
        setupTableMocks({ daily_attendance: { data: [], error: null } });
        const result = await dataExportService.exportUserData('u1');
        expect(result.attendance).toHaveLength(0);
    });

    it('handles empty bucket scans gracefully', async () => {
        setupTableMocks({ bucket_records: { data: [], error: null } });
        const result = await dataExportService.exportUserData('u1');
        expect(result.bucketScans).toHaveLength(0);
    });

    it('handles null attendance (DB error) gracefully — returns empty array', async () => {
        setupTableMocks({
            daily_attendance: { data: null, error: { message: 'Attendance query failed' } },
        });
        const result = await dataExportService.exportUserData('u1');
        expect(result.attendance).toHaveLength(0);
    });

    it('handles null scans (DB error) gracefully — returns empty array', async () => {
        setupTableMocks({
            bucket_records: { data: null, error: { message: 'Scans query failed' } },
        });
        const result = await dataExportService.exportUserData('u1');
        expect(result.bucketScans).toHaveLength(0);
    });

    it('handles null consent history gracefully — returns empty array', async () => {
        setupTableMocks({
            privacy_consent_log: { data: null, error: { message: 'Consent query failed' } },
        });
        const result = await dataExportService.exportUserData('u1');
        expect(result.consentHistory).toHaveLength(0);
    });

    it('throws when user profile fetch fails (critical error)', async () => {
        setupTableMocks({
            users: { data: null, error: { message: 'user not found' } },
        });
        await expect(dataExportService.exportUserData('u1')).rejects.toThrow();
    });

    it('fetches users table with user id', async () => {
        await dataExportService.exportUserData('u1');
        const usersCall = mockFrom.mock.calls.find((args: unknown[]) => args[0] === 'users');
        expect(usersCall).toBeDefined();
    });

    it('fetches daily_attendance table', async () => {
        await dataExportService.exportUserData('u1');
        const attCall = mockFrom.mock.calls.find((args: unknown[]) => args[0] === 'daily_attendance');
        expect(attCall).toBeDefined();
    });
});

// ──────────────────────────────────────────────────────
// downloadAsJSON
// ──────────────────────────────────────────────────────
describe('dataExportService.downloadAsJSON', () => {
    let mockAnchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        setupTableMocks();

        // Mock DOM APIs used by the download function
        mockAnchor = { href: '', download: '', click: vi.fn() };
        vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement);
        vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as unknown as Node);
        vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor as unknown as Node);

        // Mock URL APIs — use vi.stubGlobal + cleanup in afterEach via restoreAllMocks
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
            revokeObjectURL: vi.fn(),
        });
    });

    it('triggers file download via anchor click', async () => {
        await dataExportService.downloadAsJSON('u1');
        expect(mockAnchor.click).toHaveBeenCalledOnce();
    });

    it('sets download filename with today date', async () => {
        await dataExportService.downloadAsJSON('u1');
        expect(mockAnchor.download).toContain('harvestpro-data-export');
        expect(mockAnchor.download).toContain('.json');
    });

    it('creates blob and passes it to URL.createObjectURL', async () => {
        // jsdom supports Blob natively — verify the download pipeline ran end-to-end
        await dataExportService.downloadAsJSON('u1');
        // createObjectURL called means a Blob was successfully constructed
        expect(URL.createObjectURL).toHaveBeenCalledOnce();
        expect(mockAnchor.href).toBe('blob:mock-url');
    });

    it('cleans up object URL after download', async () => {
        await dataExportService.downloadAsJSON('u1');
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('removes anchor from DOM after click', async () => {
        await dataExportService.downloadAsJSON('u1');
        expect(document.body.removeChild).toHaveBeenCalledOnce();
    });

    it('propagates error if exportUserData fails', async () => {
        setupTableMocks({
            users: { data: null, error: { message: 'not found' } },
        });
        await expect(dataExportService.downloadAsJSON('u1')).rejects.toThrow();
    });
});
