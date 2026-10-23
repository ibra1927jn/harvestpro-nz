/**
 * anomaly_dismissals y payroll_exports (auditoría 23-10, E): paginado estable y
 * «sin filas» = error (la RLS no dejó).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/services/supabase';
import { anomalyDismissalsRepository } from './anomaly-dismissals.repository';
import { payrollExportsRepository } from './payroll-exports.repository';
import { hrDocumentsRepository } from './hr-documents.repository';

function mockChain(result: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {
        select: vi.fn(() => chain), insert: vi.fn(() => chain), delete: vi.fn(() => chain), or: vi.fn(() => chain),
        eq: vi.fn(() => chain), is: vi.fn(() => chain), gte: vi.fn(() => chain), order: vi.fn(() => chain),
        range: vi.fn(() => chain), single: vi.fn(() => chain),
        then: (onF?: (v: unknown) => unknown, onR?: (r: unknown) => unknown) => Promise.resolve(result).then(onF, onR),
    };
    return chain;
}

beforeEach(() => vi.restoreAllMocks());

describe('anomalyDismissalsRepository', () => {
    it('lists today\'s dismissals of the orchard, newest first', async () => {
        const chain = mockChain({ data: [{ id: 'a', dismissed_at: '2026-10-23T01:00:00Z' }, { id: 'b', dismissed_at: '2026-10-23T03:00:00Z' }], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        const out = await anomalyDismissalsRepository.listSince('o1', '2026-10-22T11:00:00Z');
        expect(chain.eq).toHaveBeenCalledWith('orchard_id', 'o1');
        expect(chain.gte).toHaveBeenCalledWith('dismissed_at', '2026-10-22T11:00:00Z');
        expect(chain.order).toHaveBeenCalledWith('id');
        expect(out.map(r => r.id)).toEqual(['b', 'a']);
    });

    it('undo fails loudly when nothing was removed', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: [], error: null }) as never);
        await expect(anomalyDismissalsRepository.remove('x')).rejects.toThrow(/not removed/);
    });
});

describe('payrollExportsRepository', () => {
    it('logs an export and lists them newest first', async () => {
        const ins = mockChain({ data: { id: 'e1' }, error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(ins as never);
        await payrollExportsRepository.log({ week_start: '2026-10-06', week_end: '2026-10-12', format: 'csv', filename: 'p.csv', record_count: 1, total_earnings: 10 });
        expect(ins.insert).toHaveBeenCalledWith(expect.objectContaining({ format: 'csv', week_start: '2026-10-06' }));
        const list = mockChain({ data: [{ id: 'a', exported_at: '2026-10-01' }, { id: 'b', exported_at: '2026-10-20' }], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(list as never);
        expect((await payrollExportsRepository.list()).map(r => r.id)).toEqual(['b', 'a']);
    });

    it('delete fails loudly when the database refuses', async () => {
        vi.spyOn(supabase, 'from').mockReturnValue(mockChain({ data: [], error: null }) as never);
        await expect(payrollExportsRepository.remove('e1')).rejects.toThrow(/not deleted/);
    });
});

describe('hrDocumentsRepository.listByPerson', () => {
    it('finds staff documents (picker_id) and office ones (user_id)', async () => {
        const chain = mockChain({ data: [], error: null });
        vi.spyOn(supabase, 'from').mockReturnValue(chain as never);
        await hrDocumentsRepository.listByPerson('p1');
        expect(chain.or).toHaveBeenCalledWith('picker_id.eq.p1,user_id.eq.p1');
        expect(chain.is).toHaveBeenCalledWith('deleted_at', null);
    });
});
