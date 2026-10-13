/**
 * Batch tests for uncovered modals — import-level smoke tests
 */
import { describe, it, expect, vi } from 'vitest';

// Common mocks
vi.mock('@/stores/useHarvestStore', () => ({
  useHarvestStore: Object.assign(
    (selector?: any) => {
      const state = {
        crew: [],
        rows: [],
        teams: [],
        teamLeaders: [],
        bucketRecords: [],
        orchard: { id: 'o1', name: 'Test' },
        settings: { piece_rate: 6.5, min_wage_rate: 23.95 },
      };
      return typeof selector === 'function' ? selector(state) : state;
    },
    { getState: () => ({ crew: [], rows: [] }) }
  ),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, appUser: { id: 'u1', role: 'manager', name: 'Mgr' } }),
}));

vi.mock('@/services/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  },
}));

vi.mock('@/services/picker.service', () => ({
  pickerService: {
    addPicker: vi.fn().mockResolvedValue(null),
    linkPicker: vi.fn().mockResolvedValue(null),
    unlinkPicker: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/utils/nzst', () => ({
  todayNZST: () => '2026-03-10',
  toNZST: (d: any) => d,
}));

describe('Uncovered modal modules', () => {

  // ScannerModal skipped — requires @capacitor-community/barcode-scanner native dep

  it('TeamLeaderSelectionModal exports default', async () => {
    const mod = await import('./TeamLeaderSelectionModal');
    expect(mod.default).toBeDefined();
  });
});
