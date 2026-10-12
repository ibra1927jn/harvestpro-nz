/**
 * Attendance Repository Tests — vi.spyOn approach
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { attendanceRepository } from './attendance.repository';

function mockChain(result: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain), eq: vi.fn(() => chain), in: vi.fn(() => chain),
        update: vi.fn(() => chain), insert: vi.fn(() => chain), order: vi.fn(() => chain),
        limit: vi.fn(() => chain), single: vi.fn(() => chain), maybeSingle: vi.fn(() => chain),
        gte: vi.fn(() => chain), range: vi.fn(() => chain), is: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) =>
            Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

describe('attendanceRepository', () => {
    let fromSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        fromSpy = vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: [], error: null }) as never);
    });

    it('getDailyWithPickers returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: '1', picker: { name: 'John' } }], error: null }) as never);
        const result = await attendanceRepository.getDailyWithPickers('o1', '2026-03-01');
        expect(result).toHaveLength(1);
    });

    it('getDailyWithPickers throws on error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'err' } }) as never);
        await expect(attendanceRepository.getDailyWithPickers('o1', '2026-03-01')).rejects.toBeTruthy();
    });

    it('findOne returns record', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: 'att-1' }], error: null }) as never);
        const result = await attendanceRepository.findOne('p1', 'o1', '2026-03-01');
        expect(result).toEqual({ id: 'att-1' });
    });

    it('insert returns created record', async () => {
        fromSpy.mockReturnValue(mockChain({ data: { id: 'new-1' }, error: null }) as never);
        const result = await attendanceRepository.insert({ picker_id: 'p1' });
        expect(result).toEqual({ id: 'new-1' });
    });

    it('insert throws on error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'dup' } }) as never);
        await expect(attendanceRepository.insert({})).rejects.toBeTruthy();
    });

    it('update returns updated record', async () => {
        fromSpy.mockReturnValue(mockChain({ data: { id: '1', status: 'out' }, error: null }) as never);
        const result = await attendanceRepository.update('1', { status: 'out' });
        expect(result).toEqual({ id: '1', status: 'out' });
    });

    it('getCheckInTime returns time', async () => {
        fromSpy.mockReturnValue(mockChain({ data: { check_in: '08:00' }, error: null }) as never);
        const result = await attendanceRepository.getCheckInTime('1');
        expect(result?.check_in).toBe('08:00');
    });

    it('getActivePickers returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ picker_id: 'p1' }], error: null }) as never);
        const result = await attendanceRepository.getActivePickers('o1', '2026-03-01');
        expect(result).toHaveLength(1);
    });

    it('getHoursSummary returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ picker_id: 'p1' }], error: null }) as never);
        const result = await attendanceRepository.getHoursSummary('o1', '2026-03-01');
        expect(result).toHaveLength(1);
    });

    it('getTimesheets returns data', async () => {
        fromSpy.mockReturnValue(mockChain({ data: [{ id: '1' }], error: null }) as never);
        const result = await attendanceRepository.getTimesheets('o1', '2026-03-01');
        expect(result).toEqual([{ id: '1' }]);
    });

    it('getTimesheets returns empty on error', async () => {
        fromSpy.mockReturnValue(mockChain({ data: null, error: { message: 'err' } }) as never);
        const result = await attendanceRepository.getTimesheets('o1', '2026-03-01');
        expect(result).toEqual([]);
    });
});
