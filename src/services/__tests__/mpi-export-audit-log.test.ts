/**
 * mpi-export — audit_logs bug fix (2026-04-19).
 *
 * REGRESSION TEST: el service llamaba `supabase.from('audit_log')` (singular,
 * no existe) en lugar de `audit_logs` (plural). El insert silenciosamente
 * fallaba. Este test fija el comportamiento correcto con mocks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chain que retorna un object awaitable simulando Supabase query result.
function makeSupabaseMock() {
    const calls: Array<{ table: string; op: string; payload: unknown }> = [];
    const chain = {
        select: vi.fn(() => chain),
        insert: vi.fn((payload: unknown) => {
            const lastTable = calls[calls.length - 1]?.table;
            calls.push({ table: lastTable ?? '__unknown__', op: 'insert', payload });
            return Promise.resolve({ data: null, error: null });
        }),
        eq: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        not: vi.fn(() => chain),
        is: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(() => chain),
        then: (fn: (v: unknown) => void) => Promise.resolve({ data: [], error: null }).then(fn),
    };
    const from = vi.fn((table: string) => {
        calls.push({ table, op: 'from', payload: null });
        return chain as unknown as Record<string, unknown>;
    });
    return { from, calls };
}

describe('mpi-export.service — audit_logs insert fix (2026-04-19)', () => {
    let fromCalls: Array<{ table: string; op: string; payload: unknown }>;
    let fromFn: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.resetModules();
        const mock = makeSupabaseMock();
        fromCalls = mock.calls;
        fromFn = mock.from;

        vi.doMock('@/services/supabase', () => ({
            supabase: { from: fromFn },
        }));
        vi.doMock('@/utils/logger', () => ({
            logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
        }));
    });

    it('generateBatchExport escribe a tabla audit_logs (NO a audit_log singular)', async () => {
        const { mpiExportService } = await import('../mpi-export.service');

        // Stubbear generateBinTrace para no tocar la lógica de binTrace
        vi.spyOn(
            mpiExportService as unknown as { generateBinTrace: () => Promise<unknown> },
            'generateBinTrace',
        ).mockResolvedValue({
            bin_id: 'bin-1',
            picker_id: 'p1',
            picker_name: 'x',
            harvested_at: '2026-04-18T00:00:00Z',
            quality_grade: 'A',
            orchard_id: 'o1',
            block_id: 'b1',
            completeness_score: 90,
        });

        await mpiExportService.generateBatchExport('o1', '2026-04-01', '2026-04-18');

        // Debe haber llamado from('audit_logs') — plural. NO audit_log.
        const tables = fromCalls.map(c => c.table);
        expect(tables).toContain('audit_logs');
        expect(tables).not.toContain('audit_log');
    });

    it('audit insert incluye action="mpi_export" y table_name (NOT NULL)', async () => {
        const { mpiExportService } = await import('../mpi-export.service');

        vi.spyOn(
            mpiExportService as unknown as { generateBinTrace: () => Promise<unknown> },
            'generateBinTrace',
        ).mockResolvedValue({
            bin_id: 'bin-1',
            picker_id: 'p1',
            picker_name: 'x',
            harvested_at: '2026-04-18T00:00:00Z',
            quality_grade: 'A',
            orchard_id: 'o1',
            block_id: 'b1',
            completeness_score: 90,
        });

        await mpiExportService.generateBatchExport('o1', '2026-04-01', '2026-04-18');

        // Encontrar la insert en audit_logs
        const insertIdx = fromCalls.findIndex(c => c.table === 'audit_logs' && c.op === 'from');
        expect(insertIdx).toBeGreaterThanOrEqual(0);

        const insertCall = fromCalls.slice(insertIdx).find(c => c.op === 'insert');
        expect(insertCall).toBeDefined();
        const payload = insertCall!.payload as Record<string, unknown>;
        expect(payload.action).toBe('mpi_export');
        expect(payload.table_name).toBeTruthy(); // NOT NULL
        // El orchard_id e export_id van dentro de new_data (jsonb)
        expect(payload.new_data).toMatchObject({ orchard_id: 'o1' });
    });

    it('no usa columnas inexistentes del schema audit_logs (details, orchard_id top-level)', async () => {
        const { mpiExportService } = await import('../mpi-export.service');

        vi.spyOn(
            mpiExportService as unknown as { generateBinTrace: () => Promise<unknown> },
            'generateBinTrace',
        ).mockResolvedValue({
            bin_id: 'bin-1',
            picker_id: 'p1',
            picker_name: 'x',
            harvested_at: '2026-04-18T00:00:00Z',
            quality_grade: 'A',
            orchard_id: 'o1',
            block_id: 'b1',
            completeness_score: 90,
        });

        await mpiExportService.generateBatchExport('o1', '2026-04-01', '2026-04-18');

        const insertCall = fromCalls.find(c => c.op === 'insert' && c.table === 'audit_logs');
        const payload = insertCall?.payload as Record<string, unknown>;
        // Payload NO debe tener claves que no son columnas de audit_logs.
        // Columnas válidas: id, user_id, user_email, action, table_name, record_id,
        //   old_values, new_values, ip_address, user_agent, created_at, old_data,
        //   new_data, performed_by
        const validKeys = new Set([
            'id', 'user_id', 'user_email', 'action', 'table_name', 'record_id',
            'old_values', 'new_values', 'ip_address', 'user_agent', 'created_at',
            'old_data', 'new_data', 'performed_by',
        ]);
        for (const key of Object.keys(payload)) {
            expect(validKeys.has(key), `audit_logs has no column "${key}"`).toBe(true);
        }
    });
});
