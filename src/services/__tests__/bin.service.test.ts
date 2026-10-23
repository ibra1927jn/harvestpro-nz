import { describe, it, expect, vi, beforeEach } from 'vitest';
import { binService } from '../bin.service';

// ── Mock repositories ──────────────────────────
vi.mock('@/repositories/bin.repository', () => ({
  binRepository: {
    getByOrchard: vi.fn(),
    updateStatus: vi.fn(),
  },
}));
vi.mock('@/utils/nzst', () => ({
  nowNZST: () => '2026-02-14T10:00:00+13:00',
}));

// La cola offline se sustituye por su procesador: el cambio llega al repositorio
// igual que cuando la cola lo sube (sync.service → dispatchItem → processBin)
vi.mock('@/services/sync.service', () => ({
    syncService: {
        addToQueue: async (_type: string, payload: unknown) => {
            const { processBin } = await import('@/services/sync-processors/bin.processor');
            await processBin(payload as Parameters<typeof processBin>[0]);
            return 'queued-id';
        },
    },
}));

import { binRepository } from '@/repositories/bin.repository';

const mockGetByOrchard = binRepository.getByOrchard as ReturnType<typeof vi.fn>;
const mockUpdateStatus = binRepository.updateStatus as ReturnType<typeof vi.fn>;

describe('binService', () => {
  beforeEach(() => vi.clearAllMocks());

  // ═══════════════════════════════════════
  // getBins
  // ═══════════════════════════════════════

  it('getBins returns mapped bins on success', async () => {
    const dbRows = [
      { id: 'b1', status: 'full', variety: 'Hayward', bin_code: 'BIN-001' },
      { id: 'b2', status: 'empty', variety: null, bin_code: 'BIN-002' },
    ];
    mockGetByOrchard.mockResolvedValue(dbRows);

    const result = await binService.getBins('orchard-1');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'b1',
      status: 'full',
      fillPercentage: 0,
      type: 'Hayward',
      bin_code: 'BIN-001',
    });
    expect(result[1].type).toBe('Standard'); // fallback when variety is null
  });

  it('getBins returns empty array when data is null', async () => {
    mockGetByOrchard.mockResolvedValue(null);

    const result = await binService.getBins('orchard-x');
    expect(result).toEqual([]);
  });

  it('getBins throws on error', async () => {
    mockGetByOrchard.mockRejectedValue(new Error('DB down'));

    await expect(binService.getBins('orchard-1')).rejects.toThrow('DB down');
  });

  // ═══════════════════════════════════════
  // updateBinStatus
  // ═══════════════════════════════════════

  it('updateBinStatus sends filled_at when status is full', async () => {
    mockUpdateStatus.mockResolvedValue(undefined);

    await binService.updateBinStatus('b1', 'full');

    expect(mockUpdateStatus).toHaveBeenCalledWith('b1', 'full', '2026-02-14T10:00:00+13:00');
  });

  it('updateBinStatus sends filled_at as null for non-full status', async () => {
    mockUpdateStatus.mockResolvedValue(undefined);

    await binService.updateBinStatus('b1', 'empty');

    expect(mockUpdateStatus).toHaveBeenCalledWith('b1', 'empty', null);
  });

  it('updateBinStatus throws on error', async () => {
    mockUpdateStatus.mockRejectedValue(new Error('Update failed'));

    await expect(binService.updateBinStatus('b1', 'full')).rejects.toThrow('Update failed');
  });
});
